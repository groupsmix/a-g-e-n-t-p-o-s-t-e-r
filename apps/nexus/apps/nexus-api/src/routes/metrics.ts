/**
 * /api/metrics — small KPI surface for the dashboard top bar (TASK-104).
 *
 * Always-visible KPIs:
 *   - tasks today        → COUNT(agent_tasks WHERE created_at >= midnight)
 *   - AI spend today     → SUM(actual_cost_usd)
 *   - active agents      → DISTINCT agent_id WHERE status IN ('queued','running')
 *   - revenue 24h        → Gumroad (if configured) sales_usd_cents within 24h
 *   - leads (new today)  → leads table count if it exists, else 0 / unconfigured
 *
 * Every field carries a `source` flag so the UI can render an honest dash
 * instead of inventing a zero when no provider is connected.
 */

import { Hono } from 'hono'
import type { Env } from '../env'
import { getSecret } from '../services/publishers'

export const metricsRoutes = new Hono<{ Bindings: Env }>()

interface Metric {
  value: number
  /** human-friendly label for the UI */
  display: string
  /** delta string like "+12% vs 24h" or null when not enough history */
  delta: string | null
  /** 'live' if computed from real data, 'unconfigured' if no provider, 'error' on failure */
  source: 'live' | 'unconfigured' | 'error'
  /** optional debug / explanation string surfaced as a tooltip */
  note?: string
}

interface SummaryResponse {
  generated_at: string
  tasks_today: Metric
  ai_spend_today: Metric
  active_agents: Metric
  revenue_24h: Metric
  leads_today: Metric
}

function midnightIsoUtc(daysBack = 0): string {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  d.setUTCDate(d.getUTCDate() - daysBack)
  return d.toISOString()
}

function fmtUsd(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`
  if (n >= 100) return `$${n.toFixed(0)}`
  return `$${n.toFixed(2)}`
}

function pctDelta(today: number, yesterday: number): string | null {
  if (yesterday === 0) return today > 0 ? '+new' : null
  const d = ((today - yesterday) / yesterday) * 100
  const sign = d >= 0 ? '+' : ''
  return `${sign}${d.toFixed(0)}%`
}

metricsRoutes.get('/summary', async (c) => {
  const todayStart = midnightIsoUtc(0)
  const yesterdayStart = midnightIsoUtc(1)
  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  // ── tasks today / yesterday + spend ────────────────────────────────
  let tasksToday = 0
  let tasksYesterday = 0
  let spendToday = 0
  let spendYesterday = 0
  let activeAgents = 0
  let tasksSource: Metric['source'] = 'live'

  try {
    const row = await c.env.DB.prepare(
      `SELECT
         SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS tt,
         SUM(CASE WHEN created_at >= ? AND created_at < ? THEN 1 ELSE 0 END) AS ty,
         COALESCE(SUM(CASE WHEN created_at >= ? THEN actual_cost_usd ELSE 0 END), 0) AS st,
         COALESCE(SUM(CASE WHEN created_at >= ? AND created_at < ? THEN actual_cost_usd ELSE 0 END), 0) AS sy
       FROM agent_tasks`,
    )
      .bind(todayStart, yesterdayStart, todayStart, todayStart, yesterdayStart, todayStart)
      .first<{ tt: number; ty: number; st: number; sy: number }>()
    if (row) {
      tasksToday = Number(row.tt ?? 0)
      tasksYesterday = Number(row.ty ?? 0)
      spendToday = Number(row.st ?? 0)
      spendYesterday = Number(row.sy ?? 0)
    }

    const agents = await c.env.DB.prepare(
      `SELECT COUNT(DISTINCT agent_id) AS n
       FROM agent_tasks
       WHERE status IN ('queued', 'running')
         AND agent_id IS NOT NULL`,
    ).first<{ n: number }>()
    activeAgents = Number(agents?.n ?? 0)
  } catch (err) {
    tasksSource = 'error'
  }

  // ── revenue (Gumroad if configured) ────────────────────────────────
  let revenueToday = 0
  let revenueYesterday = 0
  let revenueSource: Metric['source'] = 'unconfigured'
  let revenueNote: string | undefined

  try {
    const token = await getSecret(c.env, 'GUMROAD_ACCESS_TOKEN')
    if (token) {
      const sinceTs = Math.floor(new Date(last24h).getTime() / 1000)
      const res = await fetch(
        `https://api.gumroad.com/v2/sales?access_token=${encodeURIComponent(token)}&after=${sinceTs}`,
        { signal: AbortSignal.timeout(5000) },
      )
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean
        sales?: Array<{ price: number; created_at: string }>
      }
      if (data.success && Array.isArray(data.sales)) {
        const cutoff = new Date(todayStart).getTime()
        const yCutoff = new Date(yesterdayStart).getTime()
        for (const s of data.sales) {
          const t = new Date(s.created_at).getTime()
          const usd = Number(s.price) / 100
          if (t >= cutoff) revenueToday += usd
          else if (t >= yCutoff) revenueYesterday += usd
        }
        revenueSource = 'live'
      } else {
        revenueSource = 'error'
        revenueNote = 'Gumroad call failed'
      }
    } else {
      revenueNote = 'Connect Gumroad to track sales'
    }
  } catch (err) {
    revenueSource = 'error'
    revenueNote = err instanceof Error ? err.message : 'fetch error'
  }

  // ── leads (best-effort; table is created lazily by lead scraper) ───
  let leadsToday = 0
  let leadsYesterday = 0
  let leadsSource: Metric['source'] = 'unconfigured'

  try {
    const hasTable = await c.env.DB.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='leads' LIMIT 1`,
    ).first<{ name: string }>()
    if (hasTable) {
      const lead = await c.env.DB.prepare(
        `SELECT
           SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS lt,
           SUM(CASE WHEN created_at >= ? AND created_at < ? THEN 1 ELSE 0 END) AS ly
         FROM leads`,
      )
        .bind(todayStart, yesterdayStart, todayStart)
        .first<{ lt: number; ly: number }>()
      leadsToday = Number(lead?.lt ?? 0)
      leadsYesterday = Number(lead?.ly ?? 0)
      leadsSource = 'live'
    }
  } catch {
    leadsSource = 'error'
  }

  const out: SummaryResponse = {
    generated_at: new Date().toISOString(),
    tasks_today: {
      value: tasksToday,
      display: String(tasksToday),
      delta: pctDelta(tasksToday, tasksYesterday),
      source: tasksSource,
    },
    ai_spend_today: {
      value: spendToday,
      display: fmtUsd(spendToday),
      delta: pctDelta(spendToday, spendYesterday),
      source: tasksSource,
      note: 'sum of actual_cost_usd across agent_tasks today',
    },
    active_agents: {
      value: activeAgents,
      display: String(activeAgents),
      delta: null,
      source: tasksSource,
    },
    revenue_24h: {
      value: revenueToday,
      display: fmtUsd(revenueToday),
      delta: pctDelta(revenueToday, revenueYesterday),
      source: revenueSource,
      note: revenueNote,
    },
    leads_today: {
      value: leadsToday,
      display: String(leadsToday),
      delta: pctDelta(leadsToday, leadsYesterday),
      source: leadsSource,
    },
  }

  return c.json(out)
})
