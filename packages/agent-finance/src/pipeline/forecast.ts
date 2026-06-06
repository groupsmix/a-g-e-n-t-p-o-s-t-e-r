/**
 * Revenue forecast. Approach: 3-week moving average of weekly revenue
 * with a linear trend overlay, then projected 4 weeks forward.
 *
 * For low-volume single-owner businesses this beats fancier models
 * because it's interpretable. Confidence interval is ±1 std-dev of
 * the residuals.
 */

import type { RevenueEntry, RevenueForecast } from '../types.js'

export function forecastRevenue(input: {
  revenue: RevenueEntry[]
  /** Reference "now" for forecasting. Defaults to Date.now(). */
  nowMs?: number
}): RevenueForecast {
  const now = input.nowMs ?? Date.now()
  // Bucket into past 12 weeks (or fewer if data is short).
  const buckets = bucketWeekly(input.revenue, now, 12)
  const totals = buckets.map((b) => b.total)
  const ma = movingAverage(totals, 3)

  // Linear trend over the moving average
  const { slope, intercept } = linearFit(ma)
  const lastIdx = ma.length - 1
  const projections: number[] = []
  for (let k = 1; k <= 4; k++) {
    const x = lastIdx + k
    projections.push(Math.max(0, intercept + slope * x))
  }

  const stdDev = std(ma)
  const next4Weeks = projections.map((forecast, i) => ({
    weekStartIso: new Date(now + (i + 1) * 7 * 86400 * 1000).toISOString().slice(0, 10),
    forecastUsd: round(forecast, 2),
    plusMinus: round(stdDev || forecast * 0.2, 2),
  }))

  return {
    next4Weeks,
    method: 'linear-3wk-ma',
    notes:
      `Based on ${buckets.length} historical weekly buckets, ` +
      `3-week MA, slope=${round(slope, 2)}/wk, σ=${round(stdDev, 2)}.`,
  }
}

function bucketWeekly(
  entries: RevenueEntry[],
  nowMs: number,
  weeks: number,
): Array<{ weekStartMs: number; total: number }> {
  const oneWeek = 7 * 86400 * 1000
  const buckets: Array<{ weekStartMs: number; total: number }> = []
  for (let i = weeks - 1; i >= 0; i--) {
    const start = nowMs - (i + 1) * oneWeek
    const end = nowMs - i * oneWeek
    let total = 0
    for (const e of entries) {
      const t = Date.parse(e.postedAt)
      if (Number.isNaN(t)) continue
      if (t >= start && t < end) total += e.amountUsd
    }
    buckets.push({ weekStartMs: start, total })
  }
  return buckets
}

function movingAverage(arr: number[], window: number): number[] {
  if (arr.length === 0) return []
  const out: number[] = []
  for (let i = 0; i < arr.length; i++) {
    const start = Math.max(0, i - window + 1)
    const slice = arr.slice(start, i + 1)
    out.push(slice.reduce((a, b) => a + b, 0) / slice.length)
  }
  return out
}

function linearFit(ys: number[]): { slope: number; intercept: number } {
  if (ys.length < 2) return { slope: 0, intercept: ys[0] ?? 0 }
  const n = ys.length
  const xs = ys.map((_, i) => i)
  const meanX = xs.reduce((a, b) => a + b, 0) / n
  const meanY = ys.reduce((a, b) => a + b, 0) / n
  let num = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (ys[i] - meanY)
    den += (xs[i] - meanX) ** 2
  }
  const slope = den === 0 ? 0 : num / den
  const intercept = meanY - slope * meanX
  return { slope, intercept }
}

function std(nums: number[]): number {
  if (nums.length < 2) return 0
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length
  const variance =
    nums.reduce((acc, x) => acc + (x - mean) ** 2, 0) / (nums.length - 1)
  return Math.sqrt(variance)
}

function round(n: number, dp: number): number {
  const f = 10 ** dp
  return Math.round(n * f) / f
}
