// ============================================================
// routes/leads.ts — TASK-801
// ============================================================
// Operator surface for the intent-mining lead scanner.
//
// GET    /              — list leads (filterable by status/source/intent/min-score)
// GET    /stats         — counts by status + intent + source
// GET    /:fingerprint  — single lead detail
// POST   /scan          — run a new scan against Reddit + HN
// POST   /:fp/engage    — mark lead engaged (operator opened/replied)
// POST   /:fp/dismiss   — mark lead dismissed (not relevant)
// DELETE /:fp           — hard delete
// ============================================================

import { Hono } from 'hono'
import type { Env } from '../env'
import { rateLimit } from '../middleware/rate-limit'
import { runLeadScan } from '../services/lead-scanner'


interface LeadRow {
  fingerprint: string
  source: string
  source_id: string
  author: string
  author_bio: string | null
  text: string
  url: string
  posted_at: string
  matched_terms: string
  extra: string | null
  score_total: number
  score_intent: string
  score_components: string
  suggested_reply: string | null
  status: string
  engaged_at: string | null
  dismissed_at: string | null
  operator_note: string | null
  created_at: string
}


function hydrate(row: LeadRow) {
  return {
    fingerprint: row.fingerprint,
    source: row.source,
    source_id: row.source_id,
    author: row.author,
    author_bio: row.author_bio,
    text: row.text,
    url: row.url,
    posted_at: row.posted_at,
    matched_terms: safeParse<string[]>(row.matched_terms, []),
    extra: safeParse<Record<string, unknown> | null>(row.extra, null),
    score_total: row.score_total,
    score_intent: row.score_intent,
    score_components: safeParse<Record<string, number>>(row.score_components, {}),
    suggested_reply: row.suggested_reply,
    status: row.status,
    engaged_at: row.engaged_at,
    dismissed_at: row.dismissed_at,
    operator_note: row.operator_note,
    created_at: row.created_at,
  }
}


function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export const leadRoutes = new Hono<{ Bindings: Env }>()

// ── GET / — list ─────────────────────────────────────────────

  .get('/', async (c) => {
  const url = new URL(c.req.url)
  const status = url.searchParams.get('status') ?? 'new'
  const source = url.searchParams.get('source')
  const intent = url.searchParams.get('intent')
  const minScore = Number(url.searchParams.get('min_score') ?? '0') || 0
  const limit = Math.min(Number(url.searchParams.get('limit') ?? '100') || 100, 500)

  const wheres: string[] = []
  const binds: unknown[] = []
  if (status && status !== 'all') {
    wheres.push('status = ?')
    binds.push(status)
  }
  if (source) {
    wheres.push('source = ?')
    binds.push(source)
  }
  if (intent) {
    wheres.push('score_intent = ?')
    binds.push(intent)
  }
  if (minScore > 0) {
    wheres.push('score_total >= ?')
    binds.push(minScore)
  }
  const where = wheres.length ? `WHERE ${wheres.join(' AND ')}` : ''

  // Table may not exist yet on a brand-new DB — the lead-scanner ingest
  // path relies on the migration; we surface an empty list rather than 500.
  try {
    const rows = await c.env.DB
      .prepare(`SELECT * FROM leads ${where} ORDER BY score_total DESC, posted_at DESC LIMIT ?`)
      .bind(...binds, limit)
      .all<LeadRow>()
    return c.json({ leads: (rows.results ?? []).map(hydrate), total: rows.results?.length ?? 0 })
  } catch {
    return c.json({ leads: [], total: 0 })
  }
})


// ── GET /stats ───────────────────────────────────────────────

  .get('/stats', async (c) => {
  try {
    const [byStatus, byIntent, bySource, top] = await Promise.all([
      c.env.DB.prepare(`SELECT status, COUNT(*) AS n FROM leads GROUP BY status`).all<{ status: string; n: number }>(),
      c.env.DB.prepare(`SELECT score_intent AS intent, COUNT(*) AS n FROM leads WHERE status = 'new' GROUP BY score_intent`).all<{ intent: string; n: number }>(),
      c.env.DB.prepare(`SELECT source, COUNT(*) AS n FROM leads WHERE status = 'new' GROUP BY source`).all<{ source: string; n: number }>(),
      c.env.DB.prepare(`SELECT MAX(score_total) AS top FROM leads WHERE status = 'new'`).first<{ top: number | null }>(),
    ])
    return c.json({
      byStatus: byStatus.results ?? [],
      byIntent: byIntent.results ?? [],
      bySource: bySource.results ?? [],
      top_score: top?.top ?? 0,
    })
  } catch {
    return c.json({ byStatus: [], byIntent: [], bySource: [], top_score: 0 })
  }
})


// ── GET /:fingerprint ────────────────────────────────────────

  .get('/:fingerprint', async (c) => {
  const fp = c.req.param('fingerprint')
  const row = await c.env.DB
    .prepare(`SELECT * FROM leads WHERE fingerprint = ?`)
    .bind(fp)
    .first<LeadRow>()
    .catch(() => null)
  if (!row) return c.json({ error: 'not_found' }, 404)
  return c.json({ lead: hydrate(row) })
})


// ── POST /scan ───────────────────────────────────────────────
//
// Body: { terms: string[], subreddits?: string[], sources?: ['reddit'|'hn'][], limit?: number }
// Rate-limited so the operator can't accidentally hammer Reddit/HN.

  .post('/scan', rateLimit(5), async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  const terms = Array.isArray(body.terms) ? (body.terms as unknown[]).filter((t): t is string => typeof t === 'string' && t.trim().length > 0) : []
  if (terms.length === 0) {
    return c.json({ error: 'terms_required', detail: 'POST { terms: ["search phrase", ...] }' }, 400)
  }
  const subreddits = Array.isArray(body.subreddits)
    ? (body.subreddits as unknown[]).filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
    : []
  const sources = Array.isArray(body.sources)
    ? (body.sources as unknown[]).filter((s): s is 'reddit' | 'hn' => s === 'reddit' || s === 'hn')
    : undefined
  const limit = typeof body.limit === 'number' ? Math.min(Math.max(body.limit, 1), 100) : 25

  const result = await runLeadScan(c.env.DB, { terms, subreddits, sources, limit })
  return c.json({ ok: true, ...result })
})


// ── POST /:fp/engage ─────────────────────────────────────────

  .post('/:fingerprint/engage', async (c) => {
  const fp = c.req.param('fingerprint')
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  const note = typeof body.note === 'string' ? body.note : null
  await c.env.DB
    .prepare(`UPDATE leads SET status = 'engaged', engaged_at = ?, operator_note = COALESCE(?, operator_note) WHERE fingerprint = ?`)
    .bind(new Date().toISOString(), note, fp)
    .run()
  return c.json({ ok: true })
})


// ── POST /:fp/dismiss ────────────────────────────────────────

  .post('/:fingerprint/dismiss', async (c) => {
  const fp = c.req.param('fingerprint')
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  const note = typeof body.note === 'string' ? body.note : null
  await c.env.DB
    .prepare(`UPDATE leads SET status = 'dismissed', dismissed_at = ?, operator_note = COALESCE(?, operator_note) WHERE fingerprint = ?`)
    .bind(new Date().toISOString(), note, fp)
    .run()
  return c.json({ ok: true })
})


// ── DELETE /:fp ──────────────────────────────────────────────

  .delete('/:fingerprint', async (c) => {
  const fp = c.req.param('fingerprint')
  await c.env.DB.prepare(`DELETE FROM leads WHERE fingerprint = ?`).bind(fp).run()
  return c.json({ ok: true })
})
