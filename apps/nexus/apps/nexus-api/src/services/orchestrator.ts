/**
 * Worker-side orchestrator — single entry point for "run this agent task".
 *
 * Mirrors @posteragent/orchestrator's runAgentTask() but uses the worker's
 * D1 + Env conventions directly so the nested-workspace boundary stays
 * clean (no cross-workspace runtime imports — see routes/tasks.ts for the
 * documented rationale).
 *
 * Lifecycle for a single task:
 *   1. Load the row from `agent_tasks` (must exist).
 *   2. Atomic CAS: status='queued' → 'running', stamp started_at.
 *   3. Dispatch to the handler keyed by `task.type`.
 *   4. Persist outcome: status='done' | 'failed', result/error, duration,
 *      cost fields. updated_at is bumped by SQLite's trigger.
 *   5. Return the final row to the caller.
 *
 * All handler errors are caught and turned into a `failed` row — the route
 * always returns a 200 with the task body so the dashboard can render the
 * failure state. Truly unrecoverable errors (DB write fails) propagate.
 */

import type { D1Database } from '@cloudflare/workers-types'
import { createLogger } from '@nexus/logger'
import {
  AGENT_TASK_TYPES,
  getAgent,
  isAgentTaskType,
  type AgentTaskType,
} from './agent-registry'

const log = createLogger({ service: 'nexus-api', module: 'orchestrator' })

// ── Types ────────────────────────────────────────────────────────────────

export type TaskStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled'

export interface AgentTaskRow {
  id: string
  type: AgentTaskType
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
  origin: string
  parent_task_id: string | null
  created_at: string
  updated_at: string
  started_at: string | null
  finished_at: string | null
  duration_ms: number | null
}

export interface RunOutcome {
  status: 'done' | 'failed'
  result?: Record<string, unknown>
  error?: string
  /** Optional cost breakdown the handler can attribute. */
  cost?: {
    actualUsd?: number
    modelUsed?: string
    inputTokens?: number
    outputTokens?: number
  }
}

export interface HandlerCtx {
  taskId: string
  type: AgentTaskType
  payload: Record<string, unknown>
  db: D1Database
}

export type AgentHandler = (ctx: HandlerCtx) => Promise<RunOutcome>

// ── Handler registry (stubs by default, real ones override) ───────────────

const handlers = new Map<AgentTaskType, AgentHandler>()

export function registerHandler(type: AgentTaskType, handler: AgentHandler) {
  handlers.set(type, handler)
}

/** Resets the registry — used in tests. */
export function resetHandlers() {
  handlers.clear()
  for (const type of AGENT_TASK_TYPES) {
    handlers.set(type, defaultStubHandler(type))
  }
}

/**
 * Stub handler — returns a `{ stub: true }` payload that marks the
 * agent as a placeholder.  Real handlers replace these at boot via
 * registerHandler().
 */
export function defaultStubHandler(type: AgentTaskType): AgentHandler {
  return async ({ taskId, payload }) => ({
    status: 'done',
    result: {
      stub: true,
      type,
      taskId,
      message: `No handler wired for "${type}". Returning passthrough echo.`,
      echoedPayload: payload,
    },
    cost: { actualUsd: 0, modelUsed: 'stub' },
  })
}

// Initialise with stubs so the worker boots in a known state.
resetHandlers()

// ── Public API ────────────────────────────────────────────────────────────

export interface RunArgs {
  /** Existing task ID — runs that exact queued task. */
  taskId?: string
  /** Or create-and-run in one call. */
  create?: {
    type: AgentTaskType
    payload?: Record<string, unknown>
    agentId?: string | null
    origin?: string
    parentTaskId?: string | null
  }
  /** Re-run a non-queued task. Default false. */
  force?: boolean
}

export interface RunResult {
  task: AgentTaskRow
  ranInline: boolean
  reason?: string
}

export async function runAgentTask(
  db: D1Database,
  args: RunArgs,
): Promise<RunResult> {
  if (!args.taskId && !args.create) {
    throw new RunError('must supply either taskId or create{}', 400)
  }

  // Step 1 — resolve the task row, creating one if necessary.
  let taskId = args.taskId ?? ''
  if (!taskId && args.create) {
    taskId = await insertQueuedTask(db, args.create)
  }

  const initial = await loadTask(db, taskId)
  if (!initial) throw new RunError(`task ${taskId} not found`, 404)

  // Step 2 — atomic claim (queued → running) unless force.
  if (initial.status !== 'queued' && !args.force) {
    log.info('skip non-queued task', { taskId, status: initial.status })
    return {
      task: initial,
      ranInline: false,
      reason: `status=${initial.status} (use force=true to re-run)`,
    }
  }

  const claimed = await claimRunning(db, taskId, args.force === true)
  if (!claimed) {
    // Someone else won the race. Return current state.
    const current = await loadTask(db, taskId)
    return {
      task: current ?? initial,
      ranInline: false,
      reason: 'lost claim race',
    }
  }

  // Step 3 — dispatch.
  const startedAt = Date.now()
  const handler = handlers.get(initial.type) ?? defaultStubHandler(initial.type)
  let outcome: RunOutcome
  try {
    outcome = await handler({
      taskId,
      type: initial.type,
      payload: safeParseObject(initial.payload),
      db,
    })
  } catch (err) {
    const errObj = err instanceof Error ? err : new Error(String(err))
    log.error('handler threw', errObj, { taskId, type: initial.type })
    outcome = { status: 'failed', error: errObj.message }
  }

  // Step 4 — persist final state.
  const durationMs = Date.now() - startedAt
  const final = await persistOutcome(db, taskId, outcome, durationMs)
  return { task: final, ranInline: true }
}

// ── Validation helpers exposed for the route ──────────────────────────────

export function validateRunBody(body: unknown): RunArgs {
  if (!body || typeof body !== 'object') {
    throw new RunError('invalid JSON body', 400)
  }
  const b = body as Record<string, unknown>

  if (typeof b.taskId === 'string' && b.taskId.length > 0) {
    return { taskId: b.taskId, force: b.force === true }
  }

  if (b.create && typeof b.create === 'object') {
    const c = b.create as Record<string, unknown>
    if (!isAgentTaskType(c.type)) {
      throw new RunError(`invalid create.type: ${String(c.type)}`, 400)
    }
    return {
      create: {
        type: c.type,
        payload: (c.payload as Record<string, unknown>) ?? {},
        agentId: typeof c.agentId === 'string' ? c.agentId : null,
        origin: typeof c.origin === 'string' ? c.origin : 'api',
        parentTaskId: typeof c.parentTaskId === 'string' ? c.parentTaskId : null,
      },
      force: b.force === true,
    }
  }

  // Convenience shape: { type, payload } at top level — wraps into create.
  if (isAgentTaskType(b.type)) {
    return {
      create: {
        type: b.type,
        payload: (b.payload as Record<string, unknown>) ?? {},
        agentId: typeof b.agentId === 'string' ? b.agentId : null,
        origin: typeof b.origin === 'string' ? b.origin : 'api',
        parentTaskId: typeof b.parentTaskId === 'string' ? b.parentTaskId : null,
      },
      force: false,
    }
  }

  throw new RunError(
    'body must contain taskId, create{type,payload}, or top-level {type,payload}',
    400,
  )
}

export class RunError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message)
    this.name = 'RunError'
  }
}

// ── DB helpers ────────────────────────────────────────────────────────────

async function insertQueuedTask(
  db: D1Database,
  create: NonNullable<RunArgs['create']>,
): Promise<string> {
  const desc = getAgent(create.type)
  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 32)
  await db
    .prepare(
      `INSERT INTO agent_tasks (
         id, type, status, payload, agent_id, origin,
         parent_task_id, estimated_cost_usd
       )
       VALUES (?, ?, 'queued', ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      create.type,
      JSON.stringify(create.payload ?? {}),
      create.agentId ?? null,
      create.origin ?? 'api',
      create.parentTaskId ?? null,
      desc?.estimatedCostUsd ?? null,
    )
    .run()
  return id
}

async function loadTask(
  db: D1Database,
  id: string,
): Promise<AgentTaskRow | null> {
  const row = await db
    .prepare(`SELECT * FROM agent_tasks WHERE id = ?`)
    .bind(id)
    .first<AgentTaskRow>()
  return row ?? null
}

async function claimRunning(
  db: D1Database,
  id: string,
  force: boolean,
): Promise<boolean> {
  const sql = force
    ? `UPDATE agent_tasks
         SET status = 'running',
             started_at = COALESCE(started_at, CURRENT_TIMESTAMP),
             updated_at = CURRENT_TIMESTAMP,
             error = NULL,
             finished_at = NULL,
             duration_ms = NULL
       WHERE id = ?`
    : `UPDATE agent_tasks
         SET status = 'running',
             started_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'queued'`
  const res = await db.prepare(sql).bind(id).run()
  return (res.meta?.changes ?? 0) > 0
}

async function persistOutcome(
  db: D1Database,
  id: string,
  outcome: RunOutcome,
  durationMs: number,
): Promise<AgentTaskRow> {
  const finalStatus = outcome.status
  await db
    .prepare(
      `UPDATE agent_tasks
         SET status         = ?,
             result         = ?,
             error          = ?,
             actual_cost_usd= ?,
             model_used     = ?,
             input_tokens   = ?,
             output_tokens  = ?,
             finished_at    = CURRENT_TIMESTAMP,
             duration_ms    = ?,
             updated_at     = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    .bind(
      finalStatus,
      outcome.result ? JSON.stringify(outcome.result) : null,
      outcome.error ?? null,
      outcome.cost?.actualUsd ?? null,
      outcome.cost?.modelUsed ?? null,
      outcome.cost?.inputTokens ?? null,
      outcome.cost?.outputTokens ?? null,
      durationMs,
      id,
    )
    .run()
  const row = await loadTask(db, id)
  if (!row) {
    throw new Error(`persistOutcome: row ${id} disappeared after update`)
  }
  return row
}

function safeParseObject(s: string): Record<string, unknown> {
  if (!s) return {}
  try {
    const parsed = JSON.parse(s)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : { raw: parsed }
  } catch {
    return { raw: s }
  }
}

/** Inflates JSON columns so the route returns parsed payload/result. */
export function inflateTask(row: AgentTaskRow): Record<string, unknown> {
  const parse = (s: string | null): unknown => {
    if (s == null) return null
    try {
      return JSON.parse(s)
    } catch {
      return s
    }
  }
  return {
    ...row,
    payload: parse(row.payload),
    result: parse(row.result),
  }
}
