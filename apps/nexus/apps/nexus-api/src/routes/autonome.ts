/**
 * /api/autonome — read + manual-trigger for the Autonome loop.
 *
 *   GET  /goals          → list goals (returns empty array if table missing)
 *   POST /goals          → upsert a goal
 *   DEL  /goals/:id      → disable a goal (sets enabled=0; we don't
 *                          hard-delete so historical runs keep their context)
 *   GET  /runs           → recent autonome_runs entries
 *   POST /run            → manually kick a tick (also called by cron)
 */

import { Hono } from 'hono'
import type { Env } from '../env'
import {
  D1GoalSource,
  D1ProgressSource,
  D1TaskEnqueuer,
  D1AutonomeRunStore,
  DefaultPlanner,
  ConsoleNotificationSink,
  runAutonome,
} from '@posteragent/agent-autonome'

export const autonomeRoutes = new Hono<{ Bindings: Env }>()

autonomeRoutes.get('/goals', async (c) => {
  try {
    const src = new D1GoalSource(c.env.DB)
    const goals = await src.list()
    return c.json({ source: 'live' as const, goals })
  } catch (err) {
    return c.json({
      source: 'unconfigured' as const,
      goals: [],
      note: err instanceof Error ? err.message : String(err),
    })
  }
})

autonomeRoutes.post('/goals', async (c) => {
  try {
    const body = (await c.req.json()) as {
      id?: string
      title: string
      metric: string
      target: number
      period: string
      tags?: string[]
      enabled?: boolean
    }
    const id = body.id ?? crypto.randomUUID()
    await c.env.DB.prepare(
      `INSERT INTO goals (id, title, metric, target, period, tags, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
       ON CONFLICT(id) DO UPDATE SET
         title=excluded.title, metric=excluded.metric, target=excluded.target,
         period=excluded.period, tags=excluded.tags, enabled=excluded.enabled,
         updated_at=datetime('now')`,
    )
      .bind(
        id,
        body.title,
        body.metric,
        body.target,
        body.period,
        body.tags ? JSON.stringify(body.tags) : null,
        body.enabled === false ? 0 : 1,
      )
      .run()
    return c.json({ ok: true, id })
  } catch (err) {
    return c.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500)
  }
})

autonomeRoutes.delete('/goals/:id', async (c) => {
  try {
    await c.env.DB.prepare(`UPDATE goals SET enabled = 0, updated_at = datetime('now') WHERE id = ?`)
      .bind(c.req.param('id'))
      .run()
    return c.json({ ok: true })
  } catch (err) {
    return c.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500)
  }
})

autonomeRoutes.get('/runs', async (c) => {
  const limit = Math.min(parseInt(c.req.query('limit') ?? '20', 10) || 20, 100)
  try {
    const rows = await c.env.DB.prepare(
      `SELECT id, generated_at, result_json FROM autonome_runs
        ORDER BY generated_at DESC LIMIT ?`,
    )
      .bind(limit)
      .all<{ id: number; generated_at: string; result_json: string }>()
    const runs = (rows.results ?? []).map((r) => ({
      id: r.id,
      generated_at: r.generated_at,
      result: JSON.parse(r.result_json),
    }))
    return c.json({ runs })
  } catch (err) {
    return c.json({ runs: [], note: err instanceof Error ? err.message : String(err) })
  }
})

export async function runAutonomeTick(env: Env): Promise<void> {
  const goals = new D1GoalSource(env.DB)
  const progress = new D1ProgressSource(env.DB)
  const enqueuer = new D1TaskEnqueuer(env.DB)
  const planner = new DefaultPlanner()
  const notifier = new ConsoleNotificationSink()
  const store = new D1AutonomeRunStore(env.DB)
  const result = await runAutonome({ goals, progress, planner, enqueuer, notifier })
  await store.record({ generated_at: result.generated_at, result }).catch(() => undefined)
}

autonomeRoutes.post('/run', async (c) => {
  try {
    await runAutonomeTick(c.env)
    return c.json({ ok: true })
  } catch (err) {
    return c.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500)
  }
})
