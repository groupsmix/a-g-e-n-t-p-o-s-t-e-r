/**
 * /api/agents — TASK-300 orchestrator surface.
 *
 *   GET    /api/agents/registry        — list all 14 agent types + status
 *   GET    /api/agents/registry/:type  — single descriptor
 *   POST   /api/agents/run             — run a task (sync). Body:
 *                                          { taskId }  | { create:{type,payload,...} }
 *                                          | { type, payload } (top-level shorthand)
 *
 * The run endpoint claims a queued task atomically, dispatches to the
 * matching handler, and persists the final state to `agent_tasks` (cost,
 * duration, tokens included).  Stub handlers ship for the 12 task types
 * whose real implementations land in later phases — they record a
 * `{ stub: true, ... }` result so the dashboard can still render an
 * end-to-end flow.
 *
 * Companion read endpoints (status / cancel / re-run) already exist on
 * `/api/tasks` — see routes/tasks.ts. We deliberately do NOT duplicate
 * the CRUD surface here.
 */

import { Hono } from 'hono'
import type { Env } from '../env'
import {
  AGENT_TASK_TYPES,
  getAgent,
  listAgents,
  type AgentStatus,
} from '../services/agent-registry'
import {
  RunError,
  inflateTask,
  runAgentTask,
  validateRunBody,
} from '../services/orchestrator'

export const agentsRoutes = new Hono<{ Bindings: Env }>()

// ── GET /api/agents/registry ────────────────────────────────────────────
  .get('/registry', (c) => {
  const statusFilter = c.req.query('status') as AgentStatus | undefined
  const tagFilter = c.req.query('tag')

  let agents = listAgents()
  if (statusFilter) agents = agents.filter((a) => a.status === statusFilter)
  if (tagFilter) agents = agents.filter((a) => a.tags.includes(tagFilter))

  return c.json({
    agents,
    count: agents.length,
    total: AGENT_TASK_TYPES.length,
    types: AGENT_TASK_TYPES,
  })
})


// ── GET /api/agents/registry/:type ──────────────────────────────────────
  .get('/registry/:type', (c) => {
  const descriptor = getAgent(c.req.param('type'))
  if (!descriptor) {
    return c.json({ error: `unknown agent type: ${c.req.param('type')}` }, 404)
  }
  return c.json({ agent: descriptor })
})


// ── POST /api/agents/run ────────────────────────────────────────────────
  .post('/run', async (c) => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400)
  }

  let args
  try {
    args = validateRunBody(body)
  } catch (err) {
    if (err instanceof RunError) {
      return c.json({ error: err.message }, err.status as 400 | 404)
    }
    throw err
  }

  try {
    const { task, ranInline, reason } = await runAgentTask(c.env.DB, args)
    return c.json({
      task: inflateTask(task),
      ranInline,
      ...(reason ? { reason } : {}),
    })
  } catch (err) {
    if (err instanceof RunError) {
      return c.json({ error: err.message }, err.status as 400 | 404)
    }
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: message }, 500)
  }
})
