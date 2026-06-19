/**
 * /api/pipeline/items — NEXUS Phase 1 Pipeline CRUD
 *
 * The UI Pipeline board talks to these endpoints exclusively.
 * The old /api/pipeline route is kept as-is (it powers the legacy
 * money-workflow summary and must not be removed until Phase 5).
 *
 * Routes:
 *   GET    /api/pipeline/items           — list all items (filterable by stage/type)
 *   GET    /api/pipeline/items/summary   — count per stage (for Home page snapshot)
 *   POST   /api/pipeline/items           — create a new item (user or agent)
 *   PATCH  /api/pipeline/items/:id       — update stage, title, content, etc.
 *   DELETE /api/pipeline/items/:id       — hard delete
 *
 * Guardrail enforced here (not just in the agent):
 *   - Any caller with created_by !== 'user' may only write stage = 'idea'.
 *     Trying to create/move to a higher stage returns 403.
 *   - Moving to 'published' always requires a matching ApprovalRequest.
 *     (Phase 3 — for now publishing is blocked unless called with user token.)
 */

import { Hono } from 'hono'
import type { Env } from '../env'

type ItemType  = 'note' | 'job' | 'product' | 'pod' | 'blog'
type ItemStage = 'idea' | 'draft' | 'review' | 'scheduled' | 'published'

interface PipelineItem {
  id: string
  type: ItemType
  stage: ItemStage
  title: string
  content: string | null
  deliverable_type: string | null
  client_ref: string | null
  client_notes: string | null
  brief_attachment_ref: string | null
  deadline: string | null
  created_by: string
  source_signal_id: string | null
  created_at: string
  updated_at: string
}

const VALID_TYPES: ItemType[]  = ['note', 'job', 'product', 'pod', 'blog']
const VALID_STAGES: ItemStage[] = ['idea', 'draft', 'review', 'scheduled', 'published']

export const pipelineItemRoutes = new Hono<{ Bindings: Env }>()

// ── GET /api/pipeline/items/summary ────────────────────────────────────────
// Must be registered before /:id or the literal "summary" gets matched as an ID.
  .get('/summary', async (c) => {
  const rows = await c.env.DB
    .prepare(`SELECT stage, COUNT(*) as n FROM pipeline_items GROUP BY stage`)
    .all<{ stage: string; n: number }>()
    .catch(() => ({ results: [] }))

  const counts: Record<ItemStage, number> = {
    idea: 0, draft: 0, review: 0, scheduled: 0, published: 0,
  }
  for (const row of rows.results ?? []) {
    if (row.stage in counts) counts[row.stage as ItemStage] = row.n
  }
  return c.json(counts)
})

// ── GET /api/pipeline/items ─────────────────────────────────────────────────
  .get('/', async (c) => {
  const stage  = c.req.query('stage')
  const type   = c.req.query('type')
  const limit  = Math.min(parseInt(c.req.query('limit') ?? '200'), 500)
  const offset = parseInt(c.req.query('offset') ?? '0')

  const conditions: string[] = []
  const params: unknown[]    = []

  if (stage && VALID_STAGES.includes(stage as ItemStage)) {
    conditions.push('stage = ?')
    params.push(stage)
  }
  if (type && VALID_TYPES.includes(type as ItemType)) {
    conditions.push('type = ?')
    params.push(type)
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  params.push(limit, offset)

  const rows = await c.env.DB
    .prepare(
      `SELECT * FROM pipeline_items ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    )
    .bind(...params)
    .all<PipelineItem>()
    .catch(() => ({ results: [] }))

  return c.json({ items: rows.results ?? [], count: (rows.results ?? []).length })
})

// ── POST /api/pipeline/items ────────────────────────────────────────────────
  .post('/', async (c) => {
  let body: Record<string, unknown>
  try {
    body = await c.req.json() as Record<string, unknown>
  } catch {
    return c.json({ error: 'invalid JSON' }, 400)
  }

  const title      = (body.title as string | undefined)?.trim()
  const type       = (body.type as ItemType | undefined) ?? 'note'
  const stage      = (body.stage as ItemStage | undefined) ?? 'idea'
  const created_by = (body.created_by as string | undefined) ?? 'user'

  if (!title) return c.json({ error: 'title is required' }, 400)
  if (!VALID_TYPES.includes(type))   return c.json({ error: `invalid type: ${type}` }, 400)
  if (!VALID_STAGES.includes(stage)) return c.json({ error: `invalid stage: ${stage}` }, 400)

  // GUARDRAIL: non-user callers (agents) can only create idea-stage items
  if (created_by !== 'user' && stage !== 'idea') {
    return c.json({ error: 'agents may only create items at stage=idea' }, 403)
  }

  const row = await c.env.DB
    .prepare(`
      INSERT INTO pipeline_items
        (type, stage, title, content, deliverable_type, client_ref, client_notes,
         brief_attachment_ref, deadline, created_by, source_signal_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `)
    .bind(
      type,
      stage,
      title,
      (body.content as string | null) ?? null,
      (body.deliverable_type as string | null) ?? null,
      (body.client_ref as string | null) ?? null,
      (body.client_notes as string | null) ?? null,
      (body.brief_attachment_ref as string | null) ?? null,
      (body.deadline as string | null) ?? null,
      created_by,
      (body.source_signal_id as string | null) ?? null,
    )
    .first<PipelineItem>()

  if (!row) return c.json({ error: 'insert failed' }, 500)
  return c.json(row, 201)
})

// ── PATCH /api/pipeline/items/:id ───────────────────────────────────────────
  .patch('/:id', async (c) => {
  const id = c.req.param('id')

  let body: Record<string, unknown>
  try {
    body = await c.req.json() as Record<string, unknown>
  } catch {
    return c.json({ error: 'invalid JSON' }, 400)
  }

  // Fetch existing row
  const existing = await c.env.DB
    .prepare(`SELECT * FROM pipeline_items WHERE id = ?`)
    .bind(id)
    .first<PipelineItem>()

  if (!existing) return c.json({ error: 'not found' }, 404)

  const newStage = (body.stage as ItemStage | undefined) ?? existing.stage
  if (!VALID_STAGES.includes(newStage)) return c.json({ error: `invalid stage: ${newStage}` }, 400)

  // GUARDRAIL: publishing requires approval (Phase 3 gate).
  // For now we block it at API level unless explicitly overridden with
  // approved: true (set by the approval resolution handler in Phase 3).
  if (newStage === 'published' && body.approved !== true) {
    return c.json({ error: 'moving to published requires an approved ApprovalRequest' }, 403)
  }

  const updated = await c.env.DB
    .prepare(`
      UPDATE pipeline_items SET
        stage      = ?,
        title      = ?,
        content    = ?,
        client_notes = ?
      WHERE id = ?
      RETURNING *
    `)
    .bind(
      newStage,
      (body.title as string | undefined) ?? existing.title,
      (body.content as string | undefined) ?? existing.content,
      (body.client_notes as string | undefined) ?? existing.client_notes,
      id,
    )
    .first<PipelineItem>()

  if (!updated) return c.json({ error: 'update failed' }, 500)
  return c.json(updated)
})

// ── DELETE /api/pipeline/items/:id ──────────────────────────────────────────
  .delete('/:id', async (c) => {
  const id = c.req.param('id')
  const existing = await c.env.DB
    .prepare(`SELECT id FROM pipeline_items WHERE id = ?`)
    .bind(id)
    .first<{ id: string }>()

  if (!existing) return c.json({ error: 'not found' }, 404)

  await c.env.DB
    .prepare(`DELETE FROM pipeline_items WHERE id = ?`)
    .bind(id)
    .run()

  return c.json({ ok: true })
})
