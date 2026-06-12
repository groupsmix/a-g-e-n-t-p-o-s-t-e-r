import { Hono } from 'hono'
import type { Env } from '../env'

export const processesRoutes = new Hono<{ Bindings: Env }>()

// ── GET /api/processes ──────────────────────────────────────────────────────
processesRoutes.get('/', async (c) => {
  const { results } = await c.env.DB
    .prepare(`SELECT * FROM live_processes ORDER BY created_at DESC`)
    .all()
  return c.json({ processes: results ?? [] })
})

// ── POST /api/processes/register ────────────────────────────────────────────
processesRoutes.post('/register', async (c) => {
  const body = await c.req.json<{ task_id?: string; name: string; status: 'running' | 'done' | 'failed' }>().catch(() => null)
  if (!body || !body.name || !body.status) {
    return c.json({ error: 'name and status are required' }, 400)
  }

  if (body.status !== 'running' && body.status !== 'done' && body.status !== 'failed') {
    return c.json({ error: 'status must be running, done, or failed' }, 400)
  }

  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 32)
  const now = new Date().toISOString()

  await c.env.DB
    .prepare(`INSERT INTO live_processes (id, task_id, name, status, created_at) VALUES (?, ?, ?, ?, ?)`)
    .bind(id, body.task_id ?? null, body.name, body.status, now)
    .run()

  return c.json({
    process: {
      id,
      task_id: body.task_id ?? null,
      name: body.name,
      status: body.status,
      created_at: now,
    },
  }, 201)
})
