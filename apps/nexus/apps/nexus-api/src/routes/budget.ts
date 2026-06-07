/**
 * /api/budget — caps CRUD, usage rollups, pre-flight approval.
 *
 *   GET  /caps                 → list active caps
 *   POST /caps                 → upsert a cap
 *   GET  /usage?since=&task_type=&model=
 *   GET  /summary?period=day|week|month
 *   POST /approve              → pre-flight approve a task
 *   POST /usage                → record a run's actuals (called by the orchestrator)
 */

import { Hono } from 'hono'
import type { Env } from '../env'
import {
  BudgetGuard,
  D1BudgetStore,
  estimateCost,
  listModels,
} from '@posteragent/agent-budget'

export const budgetRoutes = new Hono<{ Bindings: Env }>()

budgetRoutes.get('/caps', async (c) => {
  try {
    const store = new D1BudgetStore(c.env.DB)
    return c.json({ source: 'live' as const, caps: await store.caps() })
  } catch (err) {
    return c.json({ source: 'unconfigured' as const, caps: [], note: err instanceof Error ? err.message : String(err) })
  }
})

budgetRoutes.post('/caps', async (c) => {
  try {
    const body = (await c.req.json()) as {
      scope: 'global' | 'task_type' | 'model'
      match?: string
      period: 'day' | 'week' | 'month'
      limit_usd: number
      warn_at?: number
      enabled?: boolean
    }
    const store = new D1BudgetStore(c.env.DB)
    await store.setCap({
      scope: body.scope,
      match: body.match,
      period: body.period,
      limit_usd: body.limit_usd,
      warn_at: body.warn_at,
      enabled: body.enabled !== false,
    })
    return c.json({ ok: true })
  } catch (err) {
    return c.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500)
  }
})

budgetRoutes.get('/usage', async (c) => {
  const since = c.req.query('since') ?? new Date(Date.now() - 7 * 86_400_000).toISOString()
  const until = c.req.query('until') ?? new Date().toISOString()
  const model = c.req.query('model')
  const taskType = c.req.query('task_type')
  try {
    const store = new D1BudgetStore(c.env.DB)
    const rows = await store.listUsage({ since, until, model, task_type: taskType })
    return c.json({ usage: rows })
  } catch (err) {
    return c.json({ usage: [], note: err instanceof Error ? err.message : String(err) })
  }
})

budgetRoutes.get('/summary', async (c) => {
  const period = c.req.query('period') ?? 'day'
  try {
    const store = new D1BudgetStore(c.env.DB)
    const now = new Date()
    const start = new Date(now)
    if (period === 'day') start.setUTCHours(0, 0, 0, 0)
    else if (period === 'week') {
      start.setUTCHours(0, 0, 0, 0)
      const dow = (start.getUTCDay() + 6) % 7
      start.setUTCDate(start.getUTCDate() - dow)
    } else {
      start.setUTCHours(0, 0, 0, 0)
      start.setUTCDate(1)
    }
    const rows = await store.listUsage({ since: start.toISOString(), until: now.toISOString() })
    const byModel = new Map<string, { count: number; cost: number }>()
    const byTask = new Map<string, { count: number; cost: number }>()
    let total = 0
    for (const u of rows) {
      total += u.cost_usd
      const m = byModel.get(u.model) ?? { count: 0, cost: 0 }
      m.count += 1; m.cost += u.cost_usd; byModel.set(u.model, m)
      const t = byTask.get(u.task_type) ?? { count: 0, cost: 0 }
      t.count += 1; t.cost += u.cost_usd; byTask.set(u.task_type, t)
    }
    return c.json({
      source: 'live' as const,
      period,
      total_usd: total,
      by_model: Array.from(byModel.entries()).map(([model, v]) => ({ model, ...v })).sort((a, b) => b.cost - a.cost),
      by_task_type: Array.from(byTask.entries()).map(([task_type, v]) => ({ task_type, ...v })).sort((a, b) => b.cost - a.cost),
      models: listModels(),
    })
  } catch (err) {
    return c.json({ source: 'unconfigured' as const, period, total_usd: 0, by_model: [], by_task_type: [], models: listModels(), note: err instanceof Error ? err.message : String(err) })
  }
})

budgetRoutes.post('/approve', async (c) => {
  try {
    const body = (await c.req.json()) as { task_type: string; model?: string; input_tokens?: number; output_tokens?: number }
    const store = new D1BudgetStore(c.env.DB)
    const guard = new BudgetGuard({ store })
    return c.json(await guard.approve(body))
  } catch (err) {
    return c.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500)
  }
})

budgetRoutes.post('/usage', async (c) => {
  try {
    const body = (await c.req.json()) as {
      task_id: string; task_type: string; model: string;
      input_tokens: number; output_tokens: number; cost_usd: number;
      occurred_at?: string
    }
    const store = new D1BudgetStore(c.env.DB)
    await store.recordUsage({ ...body, occurred_at: body.occurred_at ?? new Date().toISOString() })
    return c.json({ ok: true })
  } catch (err) {
    return c.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500)
  }
})

// Convenience: stateless estimate that doesn't touch D1.
budgetRoutes.post('/estimate', async (c) => {
  try {
    const body = (await c.req.json()) as { task_type: string; model?: string; input_tokens?: number; output_tokens?: number }
    return c.json(estimateCost(body))
  } catch (err) {
    return c.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500)
  }
})
