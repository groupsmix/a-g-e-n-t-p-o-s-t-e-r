/**
 * Top-level pipeline. Pure over injected sources.
 *
 *   fan-out quotes + revenue + costs (parallel)
 *     → buildPnl
 *     → forecastRevenue
 *     → checkBudget
 *     → detectFinanceAlerts
 *     → FinanceReport
 */

import type {
  AssetClass,
  CostLedger,
  FinanceConfig,
  FinanceReport,
  PriceSource,
  RevenueSource,
} from '../types.js'
import { DEFAULT_CONFIG } from '../types.js'
import { buildPnl } from './pnl.js'
import { forecastRevenue } from './forecast.js'
import { checkBudget } from './budget.js'
import { detectFinanceAlerts } from './alerter.js'

export interface AnalyseFinanceInput {
  /** Tracked tickers / pairs. */
  tickers: Array<{ symbol: string; assetClass: AssetClass }>
  priceSources: PriceSource[]
  revenueSources: RevenueSource[]
  costLedger?: CostLedger
  monthlyBudgetUsd: number
  config?: Partial<FinanceConfig>
  signal?: AbortSignal
  log?: {
    info(msg: string, meta?: Record<string, unknown>): void
    warn(msg: string, meta?: Record<string, unknown>): void
  }
}

export async function analyseFinance(
  input: AnalyseFinanceInput,
): Promise<FinanceReport> {
  const config: FinanceConfig = { ...DEFAULT_CONFIG, ...input.config }
  const startedAt = Date.now()
  const sinceMs = startedAt - config.lookbackDays * 86400_000
  const sinceIso = new Date(sinceMs).toISOString()

  // ── Prices (parallel by ticker, route to a compatible source) ──
  const pricesStart = Date.now()
  const quotes = (
    await Promise.all(
      input.tickers.map(async (t) => {
        const src = input.priceSources.find((s) => s.supports.includes(t.assetClass))
        if (!src) return undefined
        try {
          return await src.quote({
            symbol: t.symbol,
            assetClass: t.assetClass,
            signal: input.signal,
          })
        } catch (err) {
          input.log?.warn('price fetch failed', {
            symbol: t.symbol,
            error: (err as Error).message,
          })
          return undefined
        }
      }),
    )
  ).filter((q): q is NonNullable<typeof q> => !!q)
  const pricesMs = Date.now() - pricesStart

  // ── Revenue ────────────────────────────────────────────────────
  const revStart = Date.now()
  const revArrays = await Promise.all(
    input.revenueSources.map(async (rs) => {
      try {
        return await rs.fetchEntries({ sinceIso, signal: input.signal })
      } catch (err) {
        input.log?.warn('revenue fetch failed', {
          source: rs.name,
          error: (err as Error).message,
        })
        return []
      }
    }),
  )
  const revenue = dedupeRevenue(revArrays.flat())
  const revenueMs = Date.now() - revStart

  // ── Costs ──────────────────────────────────────────────────────
  const costStart = Date.now()
  let costs: Awaited<ReturnType<CostLedger['fetchEntries']>> = []
  if (input.costLedger) {
    try {
      costs = await input.costLedger.fetchEntries({ sinceIso, signal: input.signal })
    } catch (err) {
      input.log?.warn('cost fetch failed', { error: (err as Error).message })
    }
  }
  const costsMs = Date.now() - costStart

  // ── Analysis ───────────────────────────────────────────────────
  const analyseStart = Date.now()
  const pnl = buildPnl({
    revenue,
    costs,
    windowStartIso: sinceIso,
    windowEndIso: new Date(startedAt).toISOString(),
  })
  const forecast = forecastRevenue({ revenue, nowMs: startedAt })
  const budget = checkBudget({
    costs,
    monthlyBudgetUsd: input.monthlyBudgetUsd,
    config,
    nowMs: startedAt,
  })
  const alerts = detectFinanceAlerts({
    quotes,
    revenue,
    budget,
    config,
    nowMs: startedAt,
  })
  const analyseMs = Date.now() - analyseStart

  const totalMs = Date.now() - startedAt
  input.log?.info('finance: complete', {
    quotes: quotes.length,
    revenue: revenue.length,
    costs: costs.length,
    alerts: alerts.length,
    totalMs,
  })

  return {
    quotes,
    revenue,
    costs,
    pnl,
    forecast,
    budget,
    alerts,
    timings: { pricesMs, revenueMs, costsMs, analyseMs, totalMs },
  }
}

function dedupeRevenue<T extends { id: string }>(arr: T[]): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const r of arr) {
    if (seen.has(r.id)) continue
    seen.add(r.id)
    out.push(r)
  }
  return out
}
