/**
 * /api/discovery — Discovery Agent control surface
 *
 *   POST /api/discovery/trigger  — manually trigger a discovery run
 *   GET  /api/discovery/runs     — list recent runs (from agent_runs)
 *   GET  /api/discovery/status   — enabled/disabled + niche config
 *   POST /api/discovery/config   — update niche + topics settings
 */

import { Hono } from 'hono'
import type { Env } from '../env'
import { runDiscoveryAgent } from '../services/discovery-agent'

const DISCOVERY_SETTING = 'discovery_agent_enabled'
const NICHE_SETTING     = 'discovery_agent_niche'
const TOPICS_SETTING    = 'discovery_agent_topics'

async function getSetting(env: Env, key: string): Promise<string | null> {
  try {
    const row = await env.DB
      .prepare(`SELECT value FROM settings WHERE key = ? LIMIT 1`)
      .bind(key)
      .first<{ value: string }>()
    return row?.value ?? null
  } catch {
    return null
  }
}

async function setSetting(env: Env, key: string, value: string): Promise<void> {
  await env.DB
    .prepare(`INSERT INTO settings (key, value) VALUES (?, ?)
              ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`)
    .bind(key, value)
    .run()
}

export const discoveryRoutes = new Hono<{ Bindings: Env }>()

// ── POST /api/discovery/trigger ─────────────────────────────────────────────
  .post('/trigger', async (c) => {
  // Fire and forget — caller gets immediate confirmation, run continues async
  c.executionCtx.waitUntil(
    runDiscoveryAgent(c.env).catch((err) => {
      console.error('Discovery trigger error:', err)
    }),
  )
  return c.json({ ok: true, message: 'Discovery agent triggered' })
})

// ── GET /api/discovery/runs ──────────────────────────────────────────────────
  .get('/runs', async (c) => {
  const limit = Math.min(parseInt(c.req.query('limit') ?? '20'), 100)

  const rows = await c.env.DB
    .prepare(`
      SELECT id, agent_name, status, metadata_json, started_at, finished_at
      FROM agent_runs
      WHERE agent_name = 'discovery-agent'
      ORDER BY started_at DESC
      LIMIT ?
    `)
    .bind(limit)
    .all<{
      id: string
      agent_name: string
      status: string
      metadata_json: string
      started_at: string
      finished_at: string | null
    }>()
    .catch(() => ({ results: [] }))

  const runs = (rows.results ?? []).map((r) => {
    let meta: Record<string, unknown> = {}
    try { meta = JSON.parse(r.metadata_json) as Record<string, unknown> } catch { /* ignore */ }
    return {
      id:              r.id,
      status:          r.status,
      niche:           meta.niche,
      signals_written: meta.signals_written ?? 0,
      items_written:   meta.items_written ?? 0,
      step_count:      Array.isArray(meta.steps) ? meta.steps.length : 0,
      started_at:      r.started_at,
      finished_at:     r.finished_at,
    }
  })

  return c.json({ runs, count: runs.length })
})

// ── GET /api/discovery/status ────────────────────────────────────────────────
  .get('/status', async (c) => {
  const [enabled, niche, topics] = await Promise.all([
    getSetting(c.env, DISCOVERY_SETTING),
    getSetting(c.env, NICHE_SETTING),
    getSetting(c.env, TOPICS_SETTING),
  ])

  return c.json({
    enabled: enabled !== 'false',
    niche:   niche   ?? 'digital products, freelance services',
    topics:  topics  ?? 'trending tools, buyer pain points, competitor gaps',
    schedule: '0 7 * * * (daily at 07:00 UTC)',
  })
})

// ── POST /api/discovery/config ───────────────────────────────────────────────
  .post('/config', async (c) => {
  let body: Record<string, unknown>
  try { body = await c.req.json() as Record<string, unknown> }
  catch { return c.json({ error: 'invalid JSON' }, 400) }

  if (typeof body.enabled === 'boolean') {
    await setSetting(c.env, DISCOVERY_SETTING, body.enabled ? 'true' : 'false')
  }
  if (typeof body.niche === 'string' && body.niche.trim()) {
    await setSetting(c.env, NICHE_SETTING, body.niche.trim())
  }
  if (typeof body.topics === 'string' && body.topics.trim()) {
    await setSetting(c.env, TOPICS_SETTING, body.topics.trim())
  }

  return c.json({ ok: true })
})
