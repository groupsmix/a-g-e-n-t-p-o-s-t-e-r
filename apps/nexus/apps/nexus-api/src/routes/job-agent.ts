/**
 * /api/jobs — Job Agent control surface
 *
 *   POST /api/jobs/:itemId/brief      — save/update a brief for a pipeline item
 *   GET  /api/jobs/:itemId/brief      — get the current brief
 *   POST /api/jobs/:itemId/start      — start the job agent (validates brief exists)
 *   GET  /api/jobs/:itemId            — current status: latest run + approval
 *   GET  /api/jobs/:itemId/deliverable — get the deliverable content
 *   POST /api/jobs/:itemId/approve    — approve → move to scheduled
 *   POST /api/jobs/:itemId/reject     — reject → return to draft with notes
 */

import { Hono } from 'hono'
import type { Env } from '../env'
import { runJobAgent } from '../services/job-agent'

type DeliverableType = 'writing' | 'code' | 'design' | 'research'

interface JobBrief {
  id: string
  pipeline_item_id: string
  deliverable_type: DeliverableType
  brief_text: string
  client_name: string | null
  client_notes: string | null
  deadline: string | null
  attachment_ref: string | null
  created_at: string
  updated_at: string
}

interface AgentRunRow {
  id: string
  status: string
  metadata_json: string
  started_at: string
  finished_at: string | null
}

export const jobAgentRoutes = new Hono<{ Bindings: Env }>()

// ── POST /api/jobs/:itemId/brief ─────────────────────────────────────────────
  .post('/:itemId/brief', async (c) => {
  const itemId = c.req.param('itemId')

  // Validate the pipeline item exists and is type=job
  const item = await c.env.DB
    .prepare(`SELECT id, type FROM pipeline_items WHERE id = ?`)
    .bind(itemId)
    .first<{ id: string; type: string }>()

  if (!item) return c.json({ error: 'pipeline item not found' }, 404)
  if (item.type !== 'job') return c.json({ error: 'pipeline item is not type=job' }, 400)

  let body: Record<string, unknown>
  try { body = await c.req.json() as Record<string, unknown> }
  catch { return c.json({ error: 'invalid JSON' }, 400) }

  const brief_text       = (body.brief_text as string | undefined)?.trim()
  const deliverable_type = (body.deliverable_type as DeliverableType | undefined) ?? 'writing'

  if (!brief_text) return c.json({ error: 'brief_text is required' }, 400)

  const VALID_TYPES: DeliverableType[] = ['writing', 'code', 'design', 'research']
  if (!VALID_TYPES.includes(deliverable_type)) {
    return c.json({ error: `invalid deliverable_type: ${deliverable_type}` }, 400)
  }

  // Upsert
  const row = await c.env.DB
    .prepare(`
      INSERT INTO job_briefs
        (pipeline_item_id, deliverable_type, brief_text, client_name, client_notes, deadline, attachment_ref)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(pipeline_item_id) DO UPDATE SET
        deliverable_type = excluded.deliverable_type,
        brief_text       = excluded.brief_text,
        client_name      = excluded.client_name,
        client_notes     = excluded.client_notes,
        deadline         = excluded.deadline,
        attachment_ref   = excluded.attachment_ref,
        updated_at       = datetime('now')
      RETURNING *
    `)
    .bind(
      itemId,
      deliverable_type,
      brief_text,
      (body.client_name as string | null) ?? null,
      (body.client_notes as string | null) ?? null,
      (body.deadline as string | null) ?? null,
      (body.attachment_ref as string | null) ?? null,
    )
    .first<JobBrief>()

  if (!row) return c.json({ error: 'failed to save brief' }, 500)
  return c.json(row, 201)
})

// ── GET /api/jobs/:itemId/brief ──────────────────────────────────────────────
  .get('/:itemId/brief', async (c) => {
  const brief = await c.env.DB
    .prepare(`SELECT * FROM job_briefs WHERE pipeline_item_id = ?`)
    .bind(c.req.param('itemId'))
    .first<JobBrief>()

  if (!brief) return c.json({ error: 'no brief found' }, 404)
  return c.json(brief)
})

// ── POST /api/jobs/:itemId/start ─────────────────────────────────────────────
  .post('/:itemId/start', async (c) => {
  const itemId = c.req.param('itemId')

  const item = await c.env.DB
    .prepare(`SELECT id, type, stage FROM pipeline_items WHERE id = ?`)
    .bind(itemId)
    .first<{ id: string; type: string; stage: string }>()

  if (!item) return c.json({ error: 'pipeline item not found' }, 404)
  if (item.type !== 'job') return c.json({ error: 'only job-type items can use the job agent' }, 400)
  if (item.stage === 'published') return c.json({ error: 'item is already published' }, 400)

  // Brief must exist before starting
  const brief = await c.env.DB
    .prepare(`SELECT id FROM job_briefs WHERE pipeline_item_id = ?`)
    .bind(itemId)
    .first<{ id: string }>()
  if (!brief) return c.json({ error: 'add a brief first (POST /api/jobs/:itemId/brief)' }, 400)

  // Check for an already-running job
  const running = await c.env.DB
    .prepare(`
      SELECT id FROM agent_runs
      WHERE agent_name = 'job-agent'
        AND status = 'running'
        AND metadata_json LIKE ?
      LIMIT 1
    `)
    .bind(`%${itemId}%`)
    .first<{ id: string }>()

  if (running) return c.json({ error: 'job agent already running for this item', run_id: running.id }, 409)

  // Fire and forget — return immediately
  c.executionCtx.waitUntil(
    runJobAgent(c.env, itemId).catch((err) => {
      console.error('Job agent error:', err)
    }),
  )

  return c.json({ ok: true, message: 'Job agent started. Check GET /api/jobs/:itemId for status.' })
})

// ── GET /api/jobs/:itemId ────────────────────────────────────────────────────
  .get('/:itemId', async (c) => {
  const itemId = c.req.param('itemId')

  const [item, brief, latestRun, pendingApproval] = await Promise.all([
    c.env.DB.prepare(`SELECT * FROM pipeline_items WHERE id = ?`).bind(itemId).first(),
    c.env.DB.prepare(`SELECT * FROM job_briefs WHERE pipeline_item_id = ?`).bind(itemId).first<JobBrief>(),
    c.env.DB.prepare(`
      SELECT id, status, metadata_json, started_at, finished_at
      FROM agent_runs
      WHERE agent_name = 'job-agent' AND metadata_json LIKE ?
      ORDER BY started_at DESC LIMIT 1
    `).bind(`%${itemId}%`).first<AgentRunRow>(),
    c.env.DB.prepare(`
      SELECT id, status, summary, created_at FROM approval_requests
      WHERE pipeline_item_id = ? ORDER BY created_at DESC LIMIT 1
    `).bind(itemId).first<{ id: string; status: string; summary: string; created_at: string }>(),
  ])

  if (!item) return c.json({ error: 'not found' }, 404)

  let runMeta: Record<string, unknown> | null = null
  if (latestRun?.metadata_json) {
    try { runMeta = JSON.parse(latestRun.metadata_json) as Record<string, unknown> } catch { /* */ }
  }

  return c.json({
    item,
    brief: brief ?? null,
    run: latestRun ? {
      id:           latestRun.id,
      status:       latestRun.status,
      step_count:   Array.isArray(runMeta?.steps) ? (runMeta.steps as unknown[]).length : 0,
      deliverable_id: runMeta?.deliverable_id ?? null,
      started_at:   latestRun.started_at,
      finished_at:  latestRun.finished_at,
    } : null,
    approval: pendingApproval ?? null,
  })
})

// ── GET /api/jobs/:itemId/deliverable ────────────────────────────────────────
  .get('/:itemId/deliverable', async (c) => {
  const deliverable = await c.env.DB
    .prepare(`
      SELECT * FROM job_deliverables
      WHERE pipeline_item_id = ?
      ORDER BY created_at DESC LIMIT 1
    `)
    .bind(c.req.param('itemId'))
    .first()

  if (!deliverable) return c.json({ error: 'no deliverable found' }, 404)
  return c.json(deliverable)
})

// ── POST /api/jobs/:itemId/approve ───────────────────────────────────────────
  .post('/:itemId/approve', async (c) => {
  const itemId = c.req.param('itemId')

  let body: { reviewer_notes?: string } = {}
  try { body = await c.req.json() as typeof body } catch { /* optional body */ }

  const approval = await c.env.DB
    .prepare(`SELECT id, status FROM approval_requests WHERE pipeline_item_id = ? AND status = 'pending' LIMIT 1`)
    .bind(itemId)
    .first<{ id: string; status: string }>()

  if (!approval) return c.json({ error: 'no pending approval found for this item' }, 404)

  const now = new Date().toISOString()

  await c.env.DB.batch([
    // Resolve the approval
    c.env.DB.prepare(`
      UPDATE approval_requests
      SET status = 'approved', reviewer_notes = ?, resolved_at = ?
      WHERE id = ?
    `).bind(body.reviewer_notes ?? null, now, approval.id),

    // Move pipeline item to 'scheduled' (approved: true bypasses the publish guard)
    c.env.DB.prepare(`
      UPDATE pipeline_items SET stage = 'scheduled', updated_at = ?
      WHERE id = ?
    `).bind(now, itemId),
  ])

  return c.json({ ok: true, approval_id: approval.id, new_stage: 'scheduled' })
})

// ── POST /api/jobs/:itemId/reject ────────────────────────────────────────────
  .post('/:itemId/reject', async (c) => {
  const itemId = c.req.param('itemId')

  let body: { reviewer_notes?: string } = {}
  try { body = await c.req.json() as typeof body } catch { /* optional */ }

  const approval = await c.env.DB
    .prepare(`SELECT id FROM approval_requests WHERE pipeline_item_id = ? AND status = 'pending' LIMIT 1`)
    .bind(itemId)
    .first<{ id: string }>()

  if (!approval) return c.json({ error: 'no pending approval found' }, 404)

  const now = new Date().toISOString()

  await c.env.DB.batch([
    // Reject the approval
    c.env.DB.prepare(`
      UPDATE approval_requests
      SET status = 'rejected', reviewer_notes = ?, resolved_at = ?
      WHERE id = ?
    `).bind(body.reviewer_notes ?? null, now, approval.id),

    // Return item to draft with rejection notes appended to content
    c.env.DB.prepare(`
      UPDATE pipeline_items
      SET stage = 'draft',
          content = COALESCE(content || char(10) || char(10), '') || '--- Rejected: ' || COALESCE(?, 'No notes') || ' ---',
          updated_at = ?
      WHERE id = ?
    `).bind(body.reviewer_notes ?? 'No notes provided', now, itemId),
  ])

  return c.json({ ok: true, approval_id: approval.id, new_stage: 'draft' })
})
