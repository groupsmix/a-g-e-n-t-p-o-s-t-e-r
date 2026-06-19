import { Hono } from 'hono'
import type { Env } from '../env'

export const approvalsRoutes = new Hono<{ Bindings: Env }>()

// ── GET /api/approvals ──────────────────────────────────────────────────────
// Returns all pending approval requests
approvalsRoutes.get('/', async (c) => {
  const { results } = await c.env.DB
    .prepare(`SELECT * FROM approval_requests WHERE status = 'pending' ORDER BY created_at ASC`)
    .all()
  return c.json({ approvals: results ?? [] })
})

// ── POST /api/approvals/:id/approve ─────────────────────────────────────────
approvalsRoutes.post('/:id/approve', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json<{ feedback?: string }>().catch(() => null)
  const feedback = body?.feedback ?? null
  const now = new Date().toISOString()

  // Find the approval request — also read binding fields (migration 042) so we
  // can stay idempotent and surface whether this approval is payload-bound.
  const request = await c.env.DB
    .prepare(`SELECT task_id, status, payload_hash, executed_at FROM approval_requests WHERE id = ?`)
    .bind(id)
    .first<{ task_id: string; status: string; payload_hash: string | null; executed_at: string | null }>()

  if (!request) {
    return c.json({ error: 'approval request not found' }, 404)
  }

  // Idempotency: only a pending request may be approved. A re-POST (double
  // click, retry) is a no-op rather than re-triggering the downstream action.
  if (request.status !== 'pending') {
    return c.json({ error: `approval already ${request.status}`, status: request.status }, 409)
  }

  // Atomically update approval status and resolve it. The status guard makes
  // this a no-op if the row was resolved concurrently.
  await c.env.DB
    .prepare(`UPDATE approval_requests SET status = 'approved', feedback = ?, resolved_at = ? WHERE id = ? AND status = 'pending'`)
    .bind(feedback, now, id)
    .run()

  // Transition task back to queued (or done / running depending on needs)
  // Let's set it back to queued so it can be picked up by the runner again to execute the approved action
  await c.env.DB
    .prepare(`UPDATE agent_tasks SET status = 'queued', updated_at = ? WHERE id = ? AND status = 'needs_me'`)
    .bind(now, request.task_id)
    .run()

  // Log an event
  const eventId = crypto.randomUUID().replace(/-/g, '').slice(0, 32)
  await c.env.DB
    .prepare(`INSERT INTO task_events (id, task_id, event_type, message, created_at) VALUES (?, ?, 'approval_approved', ?, ?)`)
    .bind(eventId, request.task_id, `Action approved. Feedback: ${feedback ?? 'None'}`, now)
    .run()

  // payloadBound tells the caller whether this approval is bound to a payload
  // snapshot (migration 042). Unbound legacy approvals behave exactly as before;
  // bound ones must be hash-verified by the executor before dispatch.
  return c.json({ ok: true, status: 'approved', payloadBound: !!request.payload_hash })
})

// ── POST /api/approvals/:id/reject ─────────────────────────────────────────
approvalsRoutes.post('/:id/reject', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json<{ feedback?: string }>().catch(() => null)
  const feedback = body?.feedback ?? null
  const now = new Date().toISOString()

  const request = await c.env.DB
    .prepare(`SELECT task_id FROM approval_requests WHERE id = ?`)
    .bind(id)
    .first<{ task_id: string }>()

  if (!request) {
    return c.json({ error: 'approval request not found' }, 404)
  }

  await c.env.DB
    .prepare(`UPDATE approval_requests SET status = 'rejected', feedback = ?, resolved_at = ? WHERE id = ?`)
    .bind(feedback, now, id)
    .run()

  // Transition task to failed
  await c.env.DB
    .prepare(`UPDATE agent_tasks SET status = 'failed', error = ?, updated_at = ? WHERE id = ? AND status = 'needs_me'`)
    .bind(`Action rejected by user: ${feedback ?? 'No feedback'}`, now, request.task_id)
    .run()

  // Log an event
  const eventId = crypto.randomUUID().replace(/-/g, '').slice(0, 32)
  await c.env.DB
    .prepare(`INSERT INTO task_events (id, task_id, event_type, message, created_at) VALUES (?, ?, 'approval_rejected', ?, ?)`)
    .bind(eventId, request.task_id, `Action rejected. Feedback: ${feedback ?? 'None'}`, now)
    .run()

  return c.json({ ok: true, status: 'rejected' })
})

// ── POST /api/approvals/:id/request-changes ──────────────────────────────────
approvalsRoutes.post('/:id/request-changes', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json<{ feedback: string }>().catch(() => null)
  if (!body || !body.feedback) {
    return c.json({ error: 'feedback is required for changes request' }, 400)
  }
  const feedback = body.feedback
  const now = new Date().toISOString()

  const request = await c.env.DB
    .prepare(`SELECT task_id FROM approval_requests WHERE id = ?`)
    .bind(id)
    .first<{ task_id: string }>()

  if (!request) {
    return c.json({ error: 'approval request not found' }, 404)
  }

  await c.env.DB
    .prepare(`UPDATE approval_requests SET status = 'changes_requested', feedback = ?, resolved_at = ? WHERE id = ?`)
    .bind(feedback, now, id)
    .run()

  // Transition task back to failed or let the agent handle it. Let's transition to failed with an error, or leave it in needs_me/failed.
  // Standard is to set it to failed with message requesting changes, or leave it so the agent can react. Let's transition to failed with changes feedback.
  await c.env.DB
    .prepare(`UPDATE agent_tasks SET status = 'failed', error = ?, updated_at = ? WHERE id = ? AND status = 'needs_me'`)
    .bind(`Changes requested: ${feedback}`, now, request.task_id)
    .run()

  // Log an event
  const eventId = crypto.randomUUID().replace(/-/g, '').slice(0, 32)
  await c.env.DB
    .prepare(`INSERT INTO task_events (id, task_id, event_type, message, created_at) VALUES (?, ?, 'approval_changes_requested', ?, ?)`)
    .bind(eventId, request.task_id, `Changes requested by user. Feedback: ${feedback}`, now)
    .run()

  return c.json({ ok: true, status: 'changes_requested' })
})
