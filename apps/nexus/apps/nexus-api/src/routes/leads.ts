// ============================================================
// routes/leads.ts — TASK-801
// ============================================================
// Operator surface for the intent-mining lead scanner.
//
// GET    /              — list leads (filterable by status/source/intent/min-score)
// GET    /stats         — counts by status + intent + source
// GET    /:fingerprint  — single lead detail
// POST   /scan          — run a new scan against Reddit + HN
// PATCH  /:fp           — update note / enrichment / workflow state
// POST   /:fp/engage    — mark lead engaged (operator opened/replied)
// POST   /:fp/contact   — mark lead contacted
// POST   /:fp/qualify   — mark lead qualified
// POST   /:fp/disqualify — mark lead disqualified
// POST   /:fp/dismiss   — mark lead dismissed (not relevant)
// POST   /:fp/restore   — bring a dismissed/disqualified lead back to new
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
  contact_email?: string | null
  contact_name?: string | null
  company_name?: string | null
  company_domain?: string | null
  source_type?: string | null
  last_contacted_at?: string | null
  contact_status?: string | null
  enrichment_json?: string | null
  created_at: string
}

const LEAD_STATUSES = new Set([
  'new',
  'engaged',
  'contacted',
  'qualified',
  'dismissed',
  'disqualified',
])

const CONTACT_STATUSES = new Set([
  'unresearched',
  'researching',
  'ready',
  'contacted',
  'replied',
  'qualified',
  'disqualified',
])


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
    contact_email: row.contact_email ?? null,
    contact_name: row.contact_name ?? null,
    company_name: row.company_name ?? null,
    company_domain: row.company_domain ?? null,
    source_type: row.source_type ?? 'intent_post',
    last_contacted_at: row.last_contacted_at ?? null,
    contact_status: row.contact_status ?? 'unresearched',
    enrichment: safeParse<Record<string, unknown> | null>(row.enrichment_json ?? null, null),
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

function parseOptionalString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function parseOptionalJsonRecord(value: unknown): Record<string, unknown> | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value !== 'object' || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

async function updateLead(
  env: Env,
  fingerprint: string,
  patch: {
    status?: string
    operator_note?: string | null
    contact_email?: string | null
    contact_name?: string | null
    company_name?: string | null
    company_domain?: string | null
    source_type?: string | null
    last_contacted_at?: string | null
    contact_status?: string
    enrichment?: Record<string, unknown> | null
  },
) {
  const now = new Date().toISOString()
  const sets: string[] = []
  const binds: unknown[] = []

  if (patch.status !== undefined) {
    sets.push('status = ?')
    binds.push(patch.status)
  }
  if (patch.operator_note !== undefined) {
    sets.push('operator_note = ?')
    binds.push(patch.operator_note)
  }
  if (patch.contact_email !== undefined) {
    sets.push('contact_email = ?')
    binds.push(patch.contact_email)
  }
  if (patch.contact_name !== undefined) {
    sets.push('contact_name = ?')
    binds.push(patch.contact_name)
  }
  if (patch.company_name !== undefined) {
    sets.push('company_name = ?')
    binds.push(patch.company_name)
  }
  if (patch.company_domain !== undefined) {
    sets.push('company_domain = ?')
    binds.push(patch.company_domain)
  }
  if (patch.source_type !== undefined) {
    sets.push('source_type = ?')
    binds.push(patch.source_type)
  }
  if (patch.last_contacted_at !== undefined) {
    sets.push('last_contacted_at = ?')
    binds.push(patch.last_contacted_at)
  }
  if (patch.contact_status !== undefined) {
    sets.push('contact_status = ?')
    binds.push(patch.contact_status)
  }
  if (patch.enrichment !== undefined) {
    sets.push('enrichment_json = ?')
    binds.push(patch.enrichment ? JSON.stringify(patch.enrichment) : null)
  }

  if (patch.status === 'engaged') {
    sets.push('engaged_at = COALESCE(engaged_at, ?)')
    binds.push(now)
  }
  if (patch.status === 'contacted') {
    sets.push('engaged_at = COALESCE(engaged_at, ?)')
    binds.push(now)
    if (patch.last_contacted_at === undefined) {
      sets.push('last_contacted_at = COALESCE(last_contacted_at, ?)')
      binds.push(now)
    }
    if (patch.contact_status === undefined) {
      sets.push('contact_status = ?')
      binds.push('contacted')
    }
  }
  if (patch.status === 'qualified') {
    sets.push('engaged_at = COALESCE(engaged_at, ?)')
    binds.push(now)
    if (patch.contact_status === undefined) {
      sets.push('contact_status = ?')
      binds.push('qualified')
    }
  }
  if (patch.status === 'dismissed' || patch.status === 'disqualified') {
    sets.push('dismissed_at = ?')
    binds.push(now)
    if (patch.status === 'disqualified' && patch.contact_status === undefined) {
      sets.push('contact_status = ?')
      binds.push('disqualified')
    }
  }
  if (patch.status === 'new') {
    sets.push('dismissed_at = NULL')
  }

  if (sets.length === 0) return false

  const result = await env.DB
    .prepare(`UPDATE leads SET ${sets.join(', ')} WHERE fingerprint = ?`)
    .bind(...binds, fingerprint)
    .run()

  const changes = (result.meta as { changes?: number } | undefined)?.changes ?? 0
  return changes > 0
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


// ── PATCH /:fingerprint ───────────────────────────────────────

  .patch('/:fingerprint', async (c) => {
  const fp = c.req.param('fingerprint')
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>

  const status = typeof body.status === 'string' ? body.status : undefined
  if (status !== undefined && !LEAD_STATUSES.has(status)) {
    return c.json({ error: 'invalid_status' }, 400)
  }

  const contactStatus = typeof body.contact_status === 'string' ? body.contact_status : undefined
  if (contactStatus !== undefined && !CONTACT_STATUSES.has(contactStatus)) {
    return c.json({ error: 'invalid_contact_status' }, 400)
  }

  const updated = await updateLead(c.env, fp, {
    status,
    operator_note: parseOptionalString(body.operator_note),
    contact_email: parseOptionalString(body.contact_email),
    contact_name: parseOptionalString(body.contact_name),
    company_name: parseOptionalString(body.company_name),
    company_domain: parseOptionalString(body.company_domain),
    source_type: parseOptionalString(body.source_type),
    last_contacted_at: parseOptionalString(body.last_contacted_at),
    contact_status: contactStatus,
    enrichment: parseOptionalJsonRecord(body.enrichment),
  })

  if (!updated) return c.json({ error: 'not_found_or_noop' }, 404)

  const row = await c.env.DB
    .prepare(`SELECT * FROM leads WHERE fingerprint = ?`)
    .bind(fp)
    .first<LeadRow>()
    .catch(() => null)
  if (!row) return c.json({ error: 'not_found' }, 404)
  return c.json({ ok: true, lead: hydrate(row) })
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
  await updateLead(c.env, fp, { status: 'engaged', operator_note: note ?? undefined })
  return c.json({ ok: true })
})


// ── POST /:fp/contact ────────────────────────────────────────

  .post('/:fingerprint/contact', async (c) => {
  const fp = c.req.param('fingerprint')
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  const note = typeof body.note === 'string' ? body.note : null
  await updateLead(c.env, fp, { status: 'contacted', operator_note: note ?? undefined })
  return c.json({ ok: true })
})


// ── POST /:fp/qualify ────────────────────────────────────────

  .post('/:fingerprint/qualify', async (c) => {
  const fp = c.req.param('fingerprint')
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  const note = typeof body.note === 'string' ? body.note : null
  await updateLead(c.env, fp, { status: 'qualified', operator_note: note ?? undefined })
  return c.json({ ok: true })
})


// ── POST /:fp/disqualify ─────────────────────────────────────

  .post('/:fingerprint/disqualify', async (c) => {
  const fp = c.req.param('fingerprint')
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  const note = typeof body.note === 'string' ? body.note : null
  await updateLead(c.env, fp, {
    status: 'disqualified',
    contact_status: 'disqualified',
    operator_note: note ?? undefined,
  })
  return c.json({ ok: true })
})


// ── POST /:fp/dismiss ────────────────────────────────────────

  .post('/:fingerprint/dismiss', async (c) => {
  const fp = c.req.param('fingerprint')
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  const note = typeof body.note === 'string' ? body.note : null
  await updateLead(c.env, fp, { status: 'dismissed', operator_note: note ?? undefined })
  return c.json({ ok: true })
})


// ── POST /:fp/restore ────────────────────────────────────────

  .post('/:fingerprint/restore', async (c) => {
  const fp = c.req.param('fingerprint')
  await updateLead(c.env, fp, {
    status: 'new',
    contact_status: 'unresearched',
  })
  return c.json({ ok: true })
})


// ── DELETE /:fp ──────────────────────────────────────────────

  .delete('/:fingerprint', async (c) => {
  const fp = c.req.param('fingerprint')
  await c.env.DB.prepare(`DELETE FROM leads WHERE fingerprint = ?`).bind(fp).run()
  return c.json({ ok: true })
})
