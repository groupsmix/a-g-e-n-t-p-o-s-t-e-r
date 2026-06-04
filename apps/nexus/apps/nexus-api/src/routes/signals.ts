import { Hono } from 'hono'
import type { Env } from '../env'
import { rateLimit } from '../middleware/rate-limit'
import {
  normalizeSignal,
  scoreSignal,
  promoteSignalToOpportunity,
} from '../services/signal-normalizer'
import type { SignalSourceType } from '@nexus/types'

export const signalRoutes = new Hono<{ Bindings: Env }>()

// ── Create signal ─────────────────────────────────────────────

signalRoutes.post('/', rateLimit(20), async (c) => {
  const body = await c.req.json<{
    source_type: SignalSourceType
    source_ref?: string
    title?: string
    audience?: string
    problem?: string
    evidence?: Array<{ source: string; url?: string; snippet?: string }>
    timestamp?: string
    [key: string]: unknown
  }>()

  if (!body.source_type) {
    return c.json({ error: 'source_type is required' }, 400)
  }

  const validSources: SignalSourceType[] = ['search_trend', 'competitor_gap', 'marketplace_data', 'ai_radar', 'buyer_feedback']
  if (!validSources.includes(body.source_type)) {
    return c.json({ error: `Invalid source_type. Must be one of: ${validSources.join(', ')}` }, 400)
  }

  try {
    const normalized = normalizeSignal(body, body.source_type)
    
    const id = crypto.randomUUID().replace(/-/g, '')

    await c.env.DB.prepare(`
      INSERT INTO signals (
        id, source_type, source_ref, title, extracted_audience, extracted_problem,
        evidence_json, demand_score, freshness_score, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).bind(
      id,
      normalized.source_type,
      normalized.source_ref,
      normalized.title,
      normalized.extracted_audience,
      normalized.extracted_problem,
      normalized.evidence_json,
      normalized.demand_score,
      normalized.freshness_score,
      normalized.status
    ).run()

    const signal = await c.env.DB.prepare('SELECT * FROM signals WHERE id = ?')
      .bind(id)
      .first()

    return c.json({ signal }, 201)
  } catch (err) {
    return c.json({ error: String(err) }, 400)
  }
})

// ── List signals ─────────────────────────────────────────────

signalRoutes.get('/', async (c) => {
  const status = c.req.query('status')
  const sourceType = c.req.query('source_type')
  const minDemandScore = c.req.query('min_demand_score')
  const limit = parseInt(c.req.query('limit') || '50', 10)
  const offset = parseInt(c.req.query('offset') || '0', 10)

  let query = 'SELECT * FROM signals WHERE 1=1'
  const params: unknown[] = []

  if (status) {
    query += ' AND status = ?'
    params.push(status)
  }
  if (sourceType) {
    query += ' AND source_type = ?'
    params.push(sourceType)
  }
  if (minDemandScore) {
    query += ' AND demand_score >= ?'
    params.push(parseInt(minDemandScore, 10))
  }

  query += ' ORDER BY demand_score DESC, created_at DESC LIMIT ? OFFSET ?'
  params.push(limit, offset)

  const result = await c.env.DB.prepare(query).bind(...params).all()

  const signals = (result.results ?? []).map((row: any) => ({
    id: row.id,
    source_type: row.source_type,
    source_ref: row.source_ref,
    title: row.title,
    extracted_audience: row.extracted_audience,
    extracted_problem: row.extracted_problem,
    evidence_json: safeParseJson(row.evidence_json),
    demand_score: row.demand_score,
    freshness_score: row.freshness_score,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }))

  return c.json({ signals, limit, offset })
})

// ── Get single signal ─────────────────────────────────────────

signalRoutes.get('/:id', async (c) => {
  const { id } = c.req.param()

  const signal = await c.env.DB.prepare('SELECT * FROM signals WHERE id = ?')
    .bind(id)
    .first()

  if (!signal) {
    return c.json({ error: 'Not found' }, 404)
  }

  return c.json({
    signal: {
      id: signal.id,
      source_type: signal.source_type,
      source_ref: signal.source_ref,
      title: signal.title,
      extracted_audience: signal.extracted_audience,
      extracted_problem: signal.extracted_problem,
      evidence_json: safeParseJson(signal.evidence_json as string),
      demand_score: signal.demand_score,
      freshness_score: signal.freshness_score,
      status: signal.status,
      created_at: signal.created_at,
      updated_at: signal.updated_at,
    },
  })
})

// ── Batch ingest signals ───────────────────────────────────────

signalRoutes.post('/batch', rateLimit(10), async (c) => {
  const body = await c.req.json<{ signals: Array<Record<string, unknown>> }>()

  if (!Array.isArray(body.signals)) {
    return c.json({ error: 'signals array is required' }, 400)
  }

  const results: Array<{ success: boolean; signal_id?: string; error?: string }> = []

  for (const rawSignal of body.signals) {
    try {
      const sourceType = rawSignal.source_type as SignalSourceType
      const normalized = normalizeSignal(rawSignal, sourceType)
      
      const id = crypto.randomUUID().replace(/-/g, '')

      await c.env.DB.prepare(`
        INSERT INTO signals (
          id, source_type, source_ref, title, extracted_audience, extracted_problem,
          evidence_json, demand_score, freshness_score, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).bind(
        id,
        normalized.source_type,
        normalized.source_ref,
        normalized.title,
        normalized.extracted_audience,
        normalized.extracted_problem,
        normalized.evidence_json,
        normalized.demand_score,
        normalized.freshness_score,
        normalized.status
      ).run()

      results.push({ success: true, signal_id: id })
    } catch (err) {
      results.push({ success: false, error: String(err) })
    }
  }

  const successful = results.filter((r) => r.success).length
  const failed = results.filter((r) => !r.success).length

  return c.json({
    total: results.length,
    successful,
    failed,
    results,
  })
})

// ── Re-score signal ───────────────────────────────────────────

signalRoutes.post('/:id/score', async (c) => {
  const { id } = c.req.param()

  const signal = await scoreSignal(c.env.DB, id)
  
  if (!signal) {
    return c.json({ error: 'Not found' }, 404)
  }

  return c.json({ signal })
})

// ── Promote signal to opportunity ─────────────────────────────

signalRoutes.post('/:id/promote', async (c) => {
  const { id } = c.req.param()

  const opportunityId = await promoteSignalToOpportunity(c.env.DB, id)
  
  if (!opportunityId) {
    return c.json({ error: 'Signal not found or could not promote' }, 404)
  }

  return c.json({
    success: true,
    opportunity_id: opportunityId,
  })
})

// ── Archive signal (soft delete) ───────────────────────────────

signalRoutes.delete('/:id', async (c) => {
  const { id } = c.req.param()

  await c.env.DB.prepare(`
    UPDATE signals SET status = 'archived', updated_at = datetime('now') WHERE id = ?
  `).bind(id).run()

  return c.json({ ok: true })
})

// ── Helper: Safe JSON parse ───────────────────────────────────

function safeParseJson(str: string): unknown {
  try {
    return JSON.parse(str)
  } catch {
    return {}
  }
}
