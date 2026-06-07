/**
 * P&L roll-up. Pure function: revenue + cost entries → PnlReport.
 * Window is configurable; caller passes already-filtered entries when
 * they want a custom slice (e.g. MTD only).
 */

import type {
  CostEntry,
  PnlReport,
  PnlBySource,
  RevenueEntry,
} from '../types.js'

export function buildPnl(input: {
  revenue: RevenueEntry[]
  costs: CostEntry[]
  windowStartIso: string
  windowEndIso: string
}): PnlReport {
  const totalRevenue = sum(input.revenue.map((r) => r.amountUsd))
  const totalCost = sum(input.costs.map((c) => c.amountUsd))
  const net = totalRevenue - totalCost
  const margin = totalRevenue > 0 ? net / totalRevenue : 0

  const bySourceMap = new Map<string, PnlBySource>()
  for (const r of input.revenue) {
    const cur = bySourceMap.get(r.source) ?? {
      source: r.source,
      revenueUsd: 0,
      count: 0,
    }
    cur.revenueUsd += r.amountUsd
    cur.count += 1
    bySourceMap.set(r.source, cur)
  }

  const byCostMap = new Map<string, number>()
  for (const c of input.costs) {
    byCostMap.set(c.category, (byCostMap.get(c.category) ?? 0) + c.amountUsd)
  }

  return {
    windowStartIso: input.windowStartIso,
    windowEndIso: input.windowEndIso,
    totalRevenueUsd: round(totalRevenue, 2),
    totalCostUsd: round(totalCost, 2),
    netUsd: round(net, 2),
    marginPct: round(margin * 100, 2),
    bySource: Array.from(bySourceMap.values()).sort(
      (a, b) => b.revenueUsd - a.revenueUsd,
    ),
    byCostCategory: Array.from(byCostMap.entries())
      .map(([category, amountUsd]) => ({
        category,
        amountUsd: round(amountUsd, 2),
      }))
      .sort((a, b) => b.amountUsd - a.amountUsd),
  }
}

function sum(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0)
}

function round(n: number, dp: number): number {
  const f = 10 ** dp
  return Math.round(n * f) / f
}
