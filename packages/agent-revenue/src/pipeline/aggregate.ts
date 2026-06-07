/**
 * Aggregator — pivots a list of RevenueEvents into a RevenueAggregate
 * for the dashboard. Used by /api/revenue/summary.
 */

import type { RevenueAggregate, RevenueEvent, RevenueSource } from '../types'

export function aggregate(
  events: RevenueEvent[],
  windowStart: string,
  windowEnd: string,
): RevenueAggregate {
  const bySource = new Map<RevenueSource, { total: number; count: number }>()
  const byPlatform = new Map<string, { total: number; count: number }>()
  const byProduct = new Map<string, { total: number; count: number }>()
  const byContent = new Map<string, { platform?: string; total: number; count: number }>()
  let total = 0
  let unattributed = 0

  for (const e of events) {
    total += e.amount_usd_cents
    const src = bySource.get(e.source) ?? { total: 0, count: 0 }
    src.total += e.amount_usd_cents
    src.count += 1
    bySource.set(e.source, src)

    if (e.attribution.platform) {
      const p = byPlatform.get(e.attribution.platform) ?? { total: 0, count: 0 }
      p.total += e.amount_usd_cents
      p.count += 1
      byPlatform.set(e.attribution.platform, p)
    } else {
      unattributed += e.amount_usd_cents
    }
    if (e.product_id) {
      const pr = byProduct.get(e.product_id) ?? { total: 0, count: 0 }
      pr.total += e.amount_usd_cents
      pr.count += 1
      byProduct.set(e.product_id, pr)
    }
    if (e.attribution.content_id) {
      const c = byContent.get(e.attribution.content_id) ?? {
        platform: e.attribution.platform,
        total: 0,
        count: 0,
      }
      c.total += e.amount_usd_cents
      c.count += 1
      byContent.set(e.attribution.content_id, c)
    }
  }

  const sortByTotal = <T extends { total_usd_cents: number }>(arr: T[]): T[] =>
    arr.sort((a, b) => b.total_usd_cents - a.total_usd_cents)

  return {
    window_start: windowStart,
    window_end: windowEnd,
    total_usd_cents: total,
    by_source: sortByTotal(
      Array.from(bySource.entries()).map(([source, v]) => ({
        source,
        total_usd_cents: v.total,
        count: v.count,
      })),
    ),
    by_platform: sortByTotal(
      Array.from(byPlatform.entries()).map(([platform, v]) => ({
        platform,
        total_usd_cents: v.total,
        count: v.count,
      })),
    ),
    by_product: sortByTotal(
      Array.from(byProduct.entries()).map(([product_id, v]) => ({
        product_id,
        total_usd_cents: v.total,
        count: v.count,
      })),
    ),
    top_content: sortByTotal(
      Array.from(byContent.entries()).map(([content_id, v]) => ({
        content_id,
        platform: v.platform,
        total_usd_cents: v.total,
        count: v.count,
      })),
    ).slice(0, 20),
    unattributed_usd_cents: unattributed,
  }
}
