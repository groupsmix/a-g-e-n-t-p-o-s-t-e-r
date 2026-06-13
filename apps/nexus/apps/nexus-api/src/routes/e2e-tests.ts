/**
 * /api/e2e-tests — E2E Test Suite Management
 *
 * Stores test suites and run history. The actual browser execution
 * is driven by the existing /api/browser-agent/run SSE endpoint —
 * the dashboard page connects to that SSE stream and saves step results here.
 *
 *   GET    /api/e2e-tests/suites              list suites
 *   POST   /api/e2e-tests/suites              create suite
 *   GET    /api/e2e-tests/suites/:id          get suite
 *   PUT    /api/e2e-tests/suites/:id          update suite
 *   DELETE /api/e2e-tests/suites/:id          delete suite
 *
 *   POST   /api/e2e-tests/suites/:id/runs     create a run record
 *   GET    /api/e2e-tests/suites/:id/runs     list runs for suite
 *   GET    /api/e2e-tests/runs/:runId         get run + steps
 *   PATCH  /api/e2e-tests/runs/:runId         update run (status, answer, error, total_ms)
 *   POST   /api/e2e-tests/runs/:runId/steps   append a step event
 *   DELETE /api/e2e-tests/runs/:runId         delete run
 */

import { Hono } from 'hono'
import type { Env } from '../env'

export const e2eTestRoutes = new Hono<{ Bindings: Env }>()

// ── Suites ────────────────────────────────────────────────────────────────────
e2eTestRoutes.get('/suites', async (c) => {
  const rows = await c.env.DB
    .prepare('SELECT * FROM e2e_test_suites ORDER BY updated_at DESC')
    .all<Record<string, unknown>>()
  return c.json({ suites: rows.results ?? [] })
})

e2eTestRoutes.post('/suites', async (c) => {
  let body: Record<string, unknown> = {}
  try { body = await c.req.json() } catch { return c.json({ error: 'invalid JSON' }, 400) }
  const { name, description, goal, start_url, tags, max_steps } = body as {
    name?: string; description?: string; goal?: string; start_url?: string
    tags?: string[]; max_steps?: number
  }
  if (!name || !goal) return c.json({ error: 'name and goal are required' }, 400)

  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  await c.env.DB
    .prepare('INSERT INTO e2e_test_suites (id, name, description, goal, start_url, tags, max_steps, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, name, description ?? null, goal, start_url ?? null, tags ? JSON.stringify(tags) : null, max_steps ?? 15, now, now)
    .run()
  return c.json({ id, name, goal, created_at: now }, 201)
})

e2eTestRoutes.get('/suites/:id', async (c) => {
  const row = await c.env.DB
    .prepare('SELECT * FROM e2e_test_suites WHERE id = ? LIMIT 1')
    .first<Record<string, unknown>>(c.req.param('id'))
  if (!row) return c.json({ error: 'not found' }, 404)
  if (row.tags && typeof row.tags === 'string') try { row.tags = JSON.parse(row.tags as string) } catch { /* leave */ }
  return c.json({ suite: row })
})

e2eTestRoutes.put('/suites/:id', async (c) => {
  let body: Record<string, unknown> = {}
  try { body = await c.req.json() } catch { return c.json({ error: 'invalid JSON' }, 400) }
  const now = new Date().toISOString()
  await c.env.DB
    .prepare('UPDATE e2e_test_suites SET name=COALESCE(?,name), description=COALESCE(?,description), goal=COALESCE(?,goal), start_url=COALESCE(?,start_url), tags=COALESCE(?,tags), max_steps=COALESCE(?,max_steps), enabled=COALESCE(?,enabled), updated_at=? WHERE id=?')
    .bind(body.name ?? null, body.description ?? null, body.goal ?? null, body.start_url ?? null,
      body.tags ? JSON.stringify(body.tags) : null, body.max_steps ?? null, body.enabled ?? null, now, c.req.param('id'))
    .run()
  return c.json({ ok: true })
})

e2eTestRoutes.delete('/suites/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM e2e_test_suites WHERE id = ?').bind(c.req.param('id')).run()
  return c.json({ ok: true })
})

// ── Runs ──────────────────────────────────────────────────────────────────────
e2eTestRoutes.post('/suites/:id/runs', async (c) => {
  const suite = await c.env.DB
    .prepare('SELECT * FROM e2e_test_suites WHERE id = ? LIMIT 1')
    .first<{ id: string; goal: string; start_url: string | null }>(c.req.param('id'))
  if (!suite) return c.json({ error: 'suite not found' }, 404)

  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  await c.env.DB
    .prepare('INSERT INTO e2e_test_runs (id, suite_id, status, goal, start_url, started_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id, suite.id, 'running', suite.goal, suite.start_url ?? null, now)
    .run()
  await c.env.DB.prepare('UPDATE e2e_test_suites SET last_run_at=?, updated_at=? WHERE id=?').bind(now, now, suite.id).run()
  return c.json({ id, suite_id: suite.id, status: 'running', started_at: now }, 201)
})

e2eTestRoutes.get('/suites/:id/runs', async (c) => {
  const rows = await c.env.DB
    .prepare('SELECT id, status, total_steps, answer, error, total_ms, started_at, completed_at FROM e2e_test_runs WHERE suite_id = ? ORDER BY started_at DESC LIMIT 20')
    .bind(c.req.param('id'))
    .all<Record<string, unknown>>()
  return c.json({ runs: rows.results ?? [] })
})

e2eTestRoutes.get('/runs/:runId', async (c) => {
  const run = await c.env.DB
    .prepare('SELECT * FROM e2e_test_runs WHERE id = ? LIMIT 1')
    .first<Record<string, unknown>>(c.req.param('runId'))
  if (!run) return c.json({ error: 'not found' }, 404)
  const steps = await c.env.DB
    .prepare('SELECT * FROM e2e_test_run_steps WHERE run_id = ? ORDER BY step_index ASC')
    .bind(c.req.param('runId'))
    .all<Record<string, unknown>>()
  return c.json({ run, steps: steps.results ?? [] })
})

e2eTestRoutes.patch('/runs/:runId', async (c) => {
  let body: Record<string, unknown> = {}
  try { body = await c.req.json() } catch { return c.json({ error: 'invalid JSON' }, 400) }
  const now = new Date().toISOString()

  await c.env.DB
    .prepare('UPDATE e2e_test_runs SET status=COALESCE(?,status), answer=COALESCE(?,answer), error=COALESCE(?,error), total_ms=COALESCE(?,total_ms), total_steps=COALESCE(?,total_steps), completed_at=COALESCE(?,completed_at) WHERE id=?')
    .bind(body.status ?? null, body.answer ?? null, body.error ?? null, body.total_ms ?? null, body.total_steps ?? null,
      body.status && ['pass','fail','error','cancelled'].includes(body.status as string) ? now : null,
      c.req.param('runId'))
    .run()

  // Update suite's last_verdict
  if (body.status && ['pass','fail','error'].includes(body.status as string)) {
    const run = await c.env.DB.prepare('SELECT suite_id FROM e2e_test_runs WHERE id=? LIMIT 1').first<{ suite_id: string }>(c.req.param('runId'))
    if (run) await c.env.DB.prepare('UPDATE e2e_test_suites SET last_verdict=?, updated_at=? WHERE id=?').bind(body.status, now, run.suite_id).run()
  }
  return c.json({ ok: true })
})

e2eTestRoutes.post('/runs/:runId/steps', async (c) => {
  let body: Record<string, unknown> = {}
  try { body = await c.req.json() } catch { return c.json({ error: 'invalid JSON' }, 400) }
  const id = crypto.randomUUID()
  await c.env.DB
    .prepare('INSERT INTO e2e_test_run_steps (id, run_id, step_index, event_type, thought, action_type, page_title, page_url, message, screenshot_url, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, c.req.param('runId'), body.step_index ?? 0, body.event_type ?? 'action',
      body.thought ?? null, body.action_type ?? null, body.page_title ?? null,
      body.page_url ?? null, body.message ?? null, body.screenshot_url ?? null, body.error ?? null)
    .run()
  return c.json({ ok: true, id }, 201)
})

e2eTestRoutes.delete('/runs/:runId', async (c) => {
  await c.env.DB.prepare('DELETE FROM e2e_test_runs WHERE id = ?').bind(c.req.param('runId')).run()
  return c.json({ ok: true })
})
