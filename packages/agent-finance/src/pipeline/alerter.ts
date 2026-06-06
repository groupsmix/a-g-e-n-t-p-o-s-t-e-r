/**
 * Finance alerter: emits FinanceAlert[] from quotes + revenue + budget.
 */

import type {
  BudgetStatus,
  FinanceAlert,
  FinanceConfig,
  Quote,
  RevenueEntry,
} from '../types.js'

export function detectFinanceAlerts(input: {
  quotes: Quote[]
  revenue: RevenueEntry[]
  budget: BudgetStatus
  config: FinanceConfig
  nowMs?: number
}): FinanceAlert[] {
  const { quotes, revenue, budget, config } = input
  const now = input.nowMs ?? Date.now()
  const alerts: FinanceAlert[] = []

  // ── Price moves ──────────────────────────────────────────────────
  for (const q of quotes) {
    if (q.changePct24h == null) continue
    if (Math.abs(q.changePct24h) >= config.priceMoveThresholdPct) {
      alerts.push({
        kind: 'price-move',
        severity:
          Math.abs(q.changePct24h) >= config.priceMoveThresholdPct * 2
            ? 'high'
            : 'medium',
        headline:
          `${q.symbol} moved ${q.changePct24h > 0 ? '+' : ''}` +
          `${q.changePct24h.toFixed(1)}% in 24h`,
        detail:
          `${q.name ?? q.symbol} is at ${q.price.toFixed(2)} ${q.currency} ` +
          `as of ${q.asOf}.`,
      })
    }
  }

  // ── Revenue dip (WoW) ────────────────────────────────────────────
  const thisWeek = sumWindow(revenue, now - 7 * 86400_000, now)
  const lastWeek = sumWindow(revenue, now - 14 * 86400_000, now - 7 * 86400_000)
  if (lastWeek > 0) {
    const dropPct = ((lastWeek - thisWeek) / lastWeek) * 100
    if (dropPct >= config.revenueDipThresholdPct) {
      alerts.push({
        kind: 'revenue-dip',
        severity: dropPct >= 60 ? 'high' : 'medium',
        headline: `Revenue down ${dropPct.toFixed(0)}% week-over-week`,
        detail: `This week $${thisWeek.toFixed(2)} vs last week $${lastWeek.toFixed(2)}.`,
      })
    }
  }

  // ── Affiliate bump ───────────────────────────────────────────────
  const affThisWeek = revenue
    .filter((r) => /amazon|gumroad|affiliate|commission/i.test(r.source))
    .filter((r) => {
      const t = Date.parse(r.postedAt)
      return !Number.isNaN(t) && t >= now - 7 * 86400_000
    })
    .reduce((a, r) => a + r.amountUsd, 0)
  if (affThisWeek > 0 && lastWeek > 0 && affThisWeek > lastWeek * 1.5) {
    alerts.push({
      kind: 'affiliate-bump',
      severity: 'low',
      headline: `Affiliate revenue spike: $${affThisWeek.toFixed(2)} this week`,
      detail: `Up >50% vs last week's overall revenue. Worth investigating which products are converting.`,
    })
  }

  // ── Budget ───────────────────────────────────────────────────────
  if (budget.status === 'over') {
    alerts.push({
      kind: 'budget-exceeded',
      severity: 'high',
      headline: `AI spend over monthly budget (${(budget.burnRatio * 100).toFixed(0)}%)`,
      detail:
        `Spent $${budget.spentMtdUsd} of $${budget.monthlyBudgetUsd}. ` +
        `Pause non-essential agents or raise the cap.`,
    })
  } else if (budget.status === 'warning') {
    alerts.push({
      kind: 'budget-warning',
      severity: 'medium',
      headline: `AI spend at ${(budget.burnRatio * 100).toFixed(0)}% of budget`,
      detail:
        `Spent $${budget.spentMtdUsd} of $${budget.monthlyBudgetUsd}. ` +
        `Runway at current rate: ${budget.runwayDays} days.`,
    })
  }

  return alerts
}

function sumWindow(rev: RevenueEntry[], from: number, to: number): number {
  let total = 0
  for (const r of rev) {
    const t = Date.parse(r.postedAt)
    if (Number.isNaN(t)) continue
    if (t >= from && t < to) total += r.amountUsd
  }
  return total
}
