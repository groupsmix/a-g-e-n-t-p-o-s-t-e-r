/**
 * Budget guard. Computes MTD spend vs monthly cap, current daily burn
 * rate, and the number of days of runway left at that rate.
 */

import type { BudgetStatus, CostEntry, FinanceConfig } from '../types.js'

export function checkBudget(input: {
  costs: CostEntry[]
  monthlyBudgetUsd: number
  config: FinanceConfig
  nowMs?: number
}): BudgetStatus {
  const now = input.nowMs ?? Date.now()
  const monthStart = startOfMonth(now)
  const daysInMonth = daysOfMonth(now)
  const daysElapsed = Math.max(1, Math.ceil((now - monthStart) / 86400_000))

  let spent = 0
  for (const c of input.costs) {
    const t = Date.parse(c.postedAt)
    if (Number.isNaN(t)) continue
    if (t >= monthStart && t <= now) spent += c.amountUsd
  }

  const burnPerDay = spent / daysElapsed
  const remaining = Math.max(0, input.monthlyBudgetUsd - spent)
  const runwayDays = burnPerDay > 0 ? remaining / burnPerDay : Infinity
  const burnRatio = input.monthlyBudgetUsd > 0 ? spent / input.monthlyBudgetUsd : 0

  let status: BudgetStatus['status'] = 'ok'
  if (burnRatio >= 1) status = 'over'
  else if (burnRatio >= input.config.budgetWarningRatio) status = 'warning'

  return {
    monthlyBudgetUsd: round(input.monthlyBudgetUsd, 2),
    spentMtdUsd: round(spent, 2),
    burnRatio: round(burnRatio, 4),
    runwayDays: Number.isFinite(runwayDays)
      ? round(Math.min(runwayDays, daysInMonth - daysElapsed + 1), 1)
      : daysInMonth - daysElapsed + 1,
    status,
  }
}

function startOfMonth(ms: number): number {
  const d = new Date(ms)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)
}

function daysOfMonth(ms: number): number {
  const d = new Date(ms)
  return new Date(d.getUTCFullYear(), d.getUTCMonth() + 1, 0).getUTCDate()
}

function round(n: number, dp: number): number {
  const f = 10 ** dp
  return Math.round(n * f) / f
}
