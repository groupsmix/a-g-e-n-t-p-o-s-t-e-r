/**
 * /api/tasks — the user-facing task abstraction the dashboard tails.
 *
 * Reads/writes against the `agent_tasks` table (migration 023).  Provides:
 *   GET    /api/tasks              list (filter by status / type, paginate)
 *   POST   /api/tasks              create a task (returns the row)
 *   GET    /api/tasks/:id          fetch one
 *   PATCH  /api/tasks/:id          update status / result / error / cost
 *   GET    /api/tasks/stream       SSE — tail recent changes (polling under the hood)
 *
 * Higher-level than queue.ts (which exposes automation_jobs) and agent_runs
 * (the cost ledger).  One agent_task may fan out into many of each.
 *
 * Wire type contracts come from `packages/types/src/index.ts → AgentTask`.
 * We don't import that package directly here (the worker uses its own
 * type aliases to avoid runtime workspace coupling at build time), but the
 * shapes MUST stay in lock-step with the TS unions.
 */

import { Hono } from 'hono'
import type { Env } from '../env'



// ── Types (mirror @posteragent/types#AgentTask) ─────────────────────────────

const VALID_TYPES = [
  'research',
  'write',
  'build-app',
  'build-site',
  'publish',
  'analyse',
  'generate-video',
  'generate-image',
  'lead-scrape',
  'email-campaign',
  'financial-analysis',
  'brand-monitor',
  'autonome-run',
  'memory-consolidate',
] as const

type TaskType = (typeof VALID_TYPES)[number]


const VALID_STATUSES = ['queued', 'running', 'done', 'failed', 'cancelled'] as const

type TaskStatus = (typeof VALID_STATUSES)[number]


const VALID_ORIGINS = [
  'dashboard',
  'autopilot',
  'schedule',
  'webhook',
  'api',
  'cli',
] as const

type TaskOrigin = (typeof VALID_ORIGINS)[number]


interface AgentTaskRow {
  id: string
  type: TaskType
  status: TaskStatus
  payload: string
  result: string | null
  error: string | null
  estimated_cost_usd: number | null
  actual_cost_usd: number | null
  model_used: string | null
  input_tokens: number | null
  output_tokens: number | null
  agent_id: string | null
  origin: TaskOrigin
  parent_task_id: string | null
  created_at: string
  updated_at: string
  started_at: string | null
  finished_at: string | null
  duration_ms: number | null
}


interface CreateTaskBody {
  type: TaskType
  payload?: Record<string, unknown>
  agent_id?: string
  origin?: TaskOrigin
  parent_task_id?: string
  estimated_cost_usd?: number
}


interface PatchTaskBody {
  status?: TaskStatus
  result?: unknown
  error?: string
  actual_cost_usd?: number
  model_used?: string
  input_tokens?: number
  output_tokens?: number
}


// ── Helpers ─────────────────────────────────────────────────────────────────

/** Parse JSON columns safely; never throws — corrupt rows fall back to null. */
function inflate(row: AgentTaskRow) {
  const parse = (s: string | null): unknown => {
    if (s == null) return null
    try { return JSON.parse(s) } catch { return s }
  }
  return {
    ...row,
    payload: parse(row.payload),
    result: parse(row.result),
  }
}


function isValid<T extends readonly string[]>(set: T, v: unknown): v is T[number] {
  return typeof v === 'string' && (set as readonly string[]).includes(v)
}

export const tasksRoutes = new Hono<{ Bindings: Env }>()

// ── GET /api/tasks ──────────────────────────────────────────────────────────
  .get('/', async (c) => {
  const status = c.req.query('status')
  const type   = c.req.query('type')
  const limit  = Math.min(Math.max(Number(c.req.query('limit') || '50'), 1), 200)
  const since  = c.req.query('since') // ISO timestamp — incremental tail

  const filters: string[] = []
  const binds: unknown[] = []

  if (status) {
    if (!isValid(VALID_STATUSES, status)) {
      return c.json({ error: `invalid status: ${status}` }, 400)
    }
    filters.push('status = ?')
    binds.push(status)
  }
  if (type) {
    if (!isValid(VALID_TYPES, type)) {
      return c.json({ error: `invalid type: ${type}` }, 400)
    }
    filters.push('type = ?')
    binds.push(type)
  }
  if (since) {
    filters.push('updated_at > ?')
    binds.push(since)
  }

  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : ''
  const sql = `
    SELECT * FROM agent_tasks
    ${where}
    ORDER BY created_at DESC
    LIMIT ?
  `
  binds.push(limit)

  const { results } = await c.env.DB.prepare(sql).bind(...binds).all<AgentTaskRow>()
  return c.json({
    tasks: (results ?? []).map(inflate),
    count: results?.length ?? 0,
  })
})


// ── POST /api/tasks ─────────────────────────────────────────────────────────
  .post('/', async (c) => {
  const body = await c.req.json<CreateTaskBody>().catch(() => null)
  if (!body) return c.json({ error: 'invalid JSON body' }, 400)

  if (!isValid(VALID_TYPES, body.type)) {
    return c.json({ error: `invalid type: ${body.type}` }, 400)
  }
  if (body.origin && !isValid(VALID_ORIGINS, body.origin)) {
    return c.json({ error: `invalid origin: ${body.origin}` }, 400)
  }

  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 32)
  const payloadJson = JSON.stringify(body.payload ?? {})

  await c.env.DB
    .prepare(`
      INSERT INTO agent_tasks (
        id, type, status, payload, agent_id, origin,
        parent_task_id, estimated_cost_usd
      )
      VALUES (?, ?, 'queued', ?, ?, ?, ?, ?)
    `)
    .bind(
      id,
      body.type,
      payloadJson,
      body.agent_id ?? null,
      body.origin ?? 'api',
      body.parent_task_id ?? null,
      body.estimated_cost_usd ?? null,
    )
    .run()

  const row = await c.env.DB
    .prepare(`SELECT * FROM agent_tasks WHERE id = ?`)
    .bind(id)
    .first<AgentTaskRow>()

  return c.json({ task: row ? inflate(row) : null }, 201)
})


// ── GET /api/tasks/stream ───────────────────────────────────────────────────
// SSE that polls agent_tasks ordered by updated_at and pushes deltas.  Lives
// BEFORE /:id so Hono's router matches it first.
//
// Format:
//   event: task
//   data: { ...inflated AgentTaskRow }
//
// Heartbeat every 15s keeps the connection alive through CF's 100s idle cap.
// Clients reconnect with Last-Event-ID so we never replay a row we already
// pushed; we use updated_at-as-ID since the trigger guarantees it advances
// on every meaningful change.
  .get('/stream', async (c) => {
  const intervalMs = Math.min(Math.max(Number(c.req.query('interval') || '2000'), 500), 30000)
  const lastIdHeader = c.req.header('Last-Event-ID')
  let cursor = lastIdHeader ?? new Date(Date.now() - 60_000).toISOString()

  const encoder = new TextEncoder()
  const db = c.env.DB

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown, id?: string) => {
        let chunk = ''
        if (id) chunk += `id: ${id}\n`
        chunk += `event: ${event}\n`
        chunk += `data: ${JSON.stringify(data)}\n\n`
        controller.enqueue(encoder.encode(chunk))
      }

      // Initial hello so the client knows the stream is alive.
      send('open', { cursor, intervalMs })

      let heartbeatBudget = 0
      const tick = async () => {
        try {
          const { results } = await db
            .prepare(`
              SELECT * FROM agent_tasks
              WHERE updated_at > ?
              ORDER BY updated_at ASC
              LIMIT 100
            `)
            .bind(cursor)
            .all<AgentTaskRow>()

          if (results && results.length > 0) {
            for (const row of results) {
              send('task', inflate(row), row.updated_at)
              cursor = row.updated_at
            }
            heartbeatBudget = 0
          } else {
            heartbeatBudget += intervalMs
            if (heartbeatBudget >= 15_000) {
              send('ping', { at: new Date().toISOString() })
              heartbeatBudget = 0
            }
          }
        } catch (err) {
          send('error', { message: err instanceof Error ? err.message : String(err) })
        }
      }

      // Polling loop — terminates when the client disconnects (controller
      // throws on enqueue) or when we run out of CF Worker time budget.
      const startedAt = Date.now()
      while (Date.now() - startedAt < 90_000) {
        await tick()
        await new Promise((r) => setTimeout(r, intervalMs))
      }

      send('close', { reason: 'budget' })
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      'x-accel-buffering': 'no',
      connection: 'keep-alive',
    },
  })
})


// ── GET /api/tasks/:id ──────────────────────────────────────────────────────
  .get('/:id', async (c) => {
  const id = c.req.param('id')
  const row = await c.env.DB
    .prepare(`SELECT * FROM agent_tasks WHERE id = ?`)
    .bind(id)
    .first<AgentTaskRow>()

  if (!row) return c.json({ error: 'not found' }, 404)
  return c.json({ task: inflate(row) })
})


// ── PATCH /api/tasks/:id ────────────────────────────────────────────────────
// Status transitions also stamp started_at / finished_at / duration_ms so
// the dashboard doesn't have to know about those mechanics.
  .patch('/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json<PatchTaskBody>().catch(() => null)
  if (!body) return c.json({ error: 'invalid JSON body' }, 400)

  const existing = await c.env.DB
    .prepare(`SELECT * FROM agent_tasks WHERE id = ?`)
    .bind(id)
    .first<AgentTaskRow>()
  if (!existing) return c.json({ error: 'not found' }, 404)

  const sets: string[] = []
  const binds: unknown[] = []

  if (body.status) {
    if (!isValid(VALID_STATUSES, body.status)) {
      return c.json({ error: `invalid status: ${body.status}` }, 400)
    }
    sets.push('status = ?')
    binds.push(body.status)

    // queued → running: stamp started_at
    if (existing.status === 'queued' && body.status === 'running') {
      sets.push("started_at = datetime('now')")
    }
    // running → done|failed|cancelled: stamp finished_at + duration_ms
    if (
      existing.status === 'running' &&
      (body.status === 'done' || body.status === 'failed' || body.status === 'cancelled')
    ) {
      sets.push("finished_at = datetime('now')")
      sets.push(
        "duration_ms = CAST((julianday(datetime('now')) - julianday(started_at)) * 86400000 AS INTEGER)",
      )
    }
  }

  if (body.result !== undefined) {
    sets.push('result = ?')
    binds.push(JSON.stringify(body.result))
  }
  if (body.error !== undefined) {
    sets.push('error = ?')
    binds.push(body.error)
  }
  if (body.actual_cost_usd !== undefined) {
    sets.push('actual_cost_usd = ?')
    binds.push(body.actual_cost_usd)
  }
  if (body.model_used !== undefined) {
    sets.push('model_used = ?')
    binds.push(body.model_used)
  }
  if (body.input_tokens !== undefined) {
    sets.push('input_tokens = ?')
    binds.push(body.input_tokens)
  }
  if (body.output_tokens !== undefined) {
    sets.push('output_tokens = ?')
    binds.push(body.output_tokens)
  }

  if (sets.length === 0) {
    return c.json({ error: 'no patchable fields supplied' }, 400)
  }

  binds.push(id)
  await c.env.DB
    .prepare(`UPDATE agent_tasks SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...binds)
    .run()

  const updated = await c.env.DB
    .prepare(`SELECT * FROM agent_tasks WHERE id = ?`)
    .bind(id)
    .first<AgentTaskRow>()

  return c.json({ task: updated ? inflate(updated) : null })
})

// Re-export under the older alias used during scaffolding so either symbol works.
export const taskRoutes = tasksRoutes
