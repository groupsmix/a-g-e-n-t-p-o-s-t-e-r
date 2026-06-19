/**
 * /api/qa — QA Agent control surface
 *
 *   POST /api/qa/trigger                — run all enabled suites
 *   POST /api/qa/suites/:id/run         — run a single suite by ID
 *   GET  /api/qa/status                 — enabled flag + last run summary
 *   POST /api/qa/config                 — enable/disable QA agent
 *   GET  /api/qa/results                — recent run results (across all suites)
 *   POST /api/qa/seed                   — seed default suites for this site
 */

import { Hono } from 'hono'
import type { Env } from '../env'
import { runQAAgent } from '../services/qa-agent'

async function getSetting(env: Env, key: string): Promise<string | null> {
  try {
    return (await env.DB
      .prepare(`SELECT value FROM settings WHERE key = ? LIMIT 1`)
      .bind(key)
      .first<{ value: string }>())?.value ?? null
  } catch { return null }
}

async function setSetting(env: Env, key: string, value: string): Promise<void> {
  await env.DB
    .prepare(`INSERT INTO settings (key, value) VALUES (?, ?)
              ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`)
    .bind(key, value).run()
}

export const qaRoutes = new Hono<{ Bindings: Env }>()

// ── POST /api/qa/trigger ────────────────────────────────────────────────────
  .post('/trigger', async (c) => {
  c.executionCtx.waitUntil(
    runQAAgent(c.env).catch(err => console.error('QA trigger error:', err)),
  )
  return c.json({ ok: true, message: 'QA agent triggered — all enabled suites queued' })
})

// ── POST /api/qa/suites/:id/run ──────────────────────────────────────────────
  .post('/suites/:id/run', async (c) => {
  const suiteId = c.req.param('id')
  const suite = await c.env.DB
    .prepare(`SELECT id FROM e2e_test_suites WHERE id = ?`)
    .bind(suiteId).first<{ id: string }>()
  if (!suite) return c.json({ error: 'suite not found' }, 404)

  c.executionCtx.waitUntil(
    runQAAgent(c.env, suiteId).catch(err => console.error('QA suite run error:', err)),
  )
  return c.json({ ok: true, message: `Suite ${suiteId} queued` })
})

// ── GET /api/qa/status ───────────────────────────────────────────────────────
  .get('/status', async (c) => {
  const [enabled, totalRow, passRow, failRow, lastRow] = await Promise.all([
    getSetting(c.env, 'qa_agent_enabled'),
    c.env.DB.prepare(`SELECT COUNT(*) as n FROM e2e_test_suites WHERE enabled = 1`).first<{ n: number }>(),
    c.env.DB.prepare(`SELECT COUNT(*) as n FROM e2e_test_suites WHERE enabled = 1 AND last_verdict = 'pass'`).first<{ n: number }>(),
    c.env.DB.prepare(`SELECT COUNT(*) as n FROM e2e_test_suites WHERE enabled = 1 AND last_verdict IN ('fail','error')`).first<{ n: number }>(),
    c.env.DB.prepare(`SELECT MAX(last_run_at) as last FROM e2e_test_suites WHERE enabled = 1`).first<{ last: string | null }>(),
  ])

  return c.json({
    enabled:       enabled !== 'false',
    total_suites:  totalRow?.n ?? 0,
    passing:       passRow?.n  ?? 0,
    failing:       failRow?.n  ?? 0,
    last_run_at:   lastRow?.last ?? null,
    schedule:      'Daily (same cron as Discovery Agent)',
  })
})

// ── POST /api/qa/config ──────────────────────────────────────────────────────
  .post('/config', async (c) => {
  let body: Record<string, unknown>
  try { body = await c.req.json() as Record<string, unknown> }
  catch { return c.json({ error: 'invalid JSON' }, 400) }

  if (typeof body.enabled === 'boolean') {
    await setSetting(c.env, 'qa_agent_enabled', body.enabled ? 'true' : 'false')
  }
  return c.json({ ok: true })
})

// ── GET /api/qa/results ──────────────────────────────────────────────────────
  .get('/results', async (c) => {
  const limit = Math.min(parseInt(c.req.query('limit') ?? '50'), 200)

  const rows = await c.env.DB
    .prepare(`
      SELECT r.id, r.suite_id, s.name as suite_name,
             r.status, r.total_steps, r.error, r.total_ms,
             r.started_at, r.completed_at
      FROM e2e_test_runs r
      JOIN e2e_test_suites s ON s.id = r.suite_id
      ORDER BY r.started_at DESC
      LIMIT ?
    `)
    .bind(limit)
    .all<Record<string, unknown>>()
    .catch(() => ({ results: [] }))

  return c.json({ results: rows.results ?? [], count: (rows.results ?? []).length })
})

// ── POST /api/qa/seed ────────────────────────────────────────────────────────
// Seeds a set of default suites — one deterministic health check per page.
  .post('/seed', async (c) => {
  let body: { site_url?: string } = {}
  try { body = await c.req.json() as typeof body } catch { /* */ }

  const base = (body.site_url ?? '').replace(/\/$/, '')
  if (!base) return c.json({ error: 'site_url is required' }, 400)

  const suites = [
    {
      name: 'Home page loads',
      goal: 'The home page loads without errors and shows the NEXUS dashboard',
      start_url: base,
      tags: ['deterministic'],
      max_steps: 3,
    },
    {
      name: 'Pipeline page loads',
      goal: 'The Pipeline page loads and shows the Kanban board',
      start_url: `${base}/pipeline`,
      tags: ['deterministic'],
      max_steps: 3,
    },
    {
      name: 'Brain page loads',
      goal: 'The Brain page loads and tabs are visible',
      start_url: `${base}/brain`,
      tags: ['deterministic'],
      max_steps: 3,
    },
    {
      name: 'Ops page loads',
      goal: 'The Ops page loads and shows agent control',
      start_url: `${base}/ops`,
      tags: ['deterministic'],
      max_steps: 3,
    },
    {
      name: 'Settings page loads',
      goal: 'The Settings page loads without a 404 or error',
      start_url: `${base}/settings`,
      tags: ['deterministic'],
      max_steps: 3,
    },
  ]

  const created: string[] = []
  for (const s of suites) {
    const id  = crypto.randomUUID()
    const now = new Date().toISOString()
    await c.env.DB
      .prepare(`
        INSERT OR IGNORE INTO e2e_test_suites
          (id, name, goal, start_url, tags, max_steps, enabled, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
      `)
      .bind(id, s.name, s.goal, s.start_url, JSON.stringify(s.tags), s.max_steps, now, now)
      .run()
      .catch(() => { /* ignore duplicates */ })
    created.push(s.name)
  }

  return c.json({ ok: true, seeded: created })
})
