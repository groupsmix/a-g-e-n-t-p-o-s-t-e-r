import { describe, it, expect } from 'vitest'
import { buildPnl } from './pnl.js'
import { forecastRevenue } from './forecast.js'
import { checkBudget } from './budget.js'
import { detectFinanceAlerts } from './alerter.js'
import { DEFAULT_CONFIG } from '../types.js'

describe('buildPnl', () => {
  it('rolls up revenue, costs, margin', () => {
    const pnl = buildPnl({
      revenue: [
        { id: '1', source: 'gumroad', postedAt: '2026-05-01', amountUsd: 100, kind: 'sale' },
        { id: '2', source: 'gumroad', postedAt: '2026-05-02', amountUsd: 50, kind: 'sale' },
        { id: '3', source: 'amazon-associates', postedAt: '2026-05-03', amountUsd: 20, kind: 'commission' },
      ],
      costs: [
        { postedAt: '2026-05-04', category: 'claude-opus', amountUsd: 30 },
        { postedAt: '2026-05-05', category: 'claude-opus', amountUsd: 20 },
      ],
      windowStartIso: '2026-05-01',
      windowEndIso: '2026-05-31',
    })
    expect(pnl.totalRevenueUsd).toBe(170)
    expect(pnl.totalCostUsd).toBe(50)
    expect(pnl.netUsd).toBe(120)
    expect(pnl.bySource[0].source).toBe('gumroad')
    expect(pnl.byCostCategory[0].category).toBe('claude-opus')
  })

  it('handles zero revenue without dividing by zero', () => {
    const pnl = buildPnl({
      revenue: [],
      costs: [{ postedAt: '2026-05-01', category: 'x', amountUsd: 10 }],
      windowStartIso: '2026-05-01',
      windowEndIso: '2026-05-31',
    })
    expect(pnl.marginPct).toBe(0)
  })
})

describe('forecastRevenue', () => {
  it('produces 4 weekly buckets', () => {
    const now = Date.parse('2026-06-01')
    const revenue = Array.from({ length: 30 }, (_, i) => ({
      id: String(i),
      source: 'gumroad',
      postedAt: new Date(now - i * 86400_000).toISOString(),
      amountUsd: 10 + i,
      kind: 'sale',
    }))
    const f = forecastRevenue({ revenue, nowMs: now })
    expect(f.next4Weeks).toHaveLength(4)
    for (const w of f.next4Weeks) {
      expect(w.forecastUsd).toBeGreaterThanOrEqual(0)
      expect(w.plusMinus).toBeGreaterThanOrEqual(0)
    }
  })

  it('handles empty revenue', () => {
    const f = forecastRevenue({ revenue: [] })
    expect(f.next4Weeks).toHaveLength(4)
    expect(f.next4Weeks.every((w) => w.forecastUsd === 0)).toBe(true)
  })
})

describe('checkBudget', () => {
  it('marks ok when under warning ratio', () => {
    const nowMs = Date.parse('2026-06-10T00:00:00Z')
    const b = checkBudget({
      costs: [{ postedAt: '2026-06-01', category: 'x', amountUsd: 10 }],
      monthlyBudgetUsd: 1000,
      config: DEFAULT_CONFIG,
      nowMs,
    })
    expect(b.status).toBe('ok')
  })

  it('marks over when spend exceeds budget', () => {
    const nowMs = Date.parse('2026-06-10T00:00:00Z')
    const b = checkBudget({
      costs: [{ postedAt: '2026-06-05', category: 'x', amountUsd: 250 }],
      monthlyBudgetUsd: 200,
      config: DEFAULT_CONFIG,
      nowMs,
    })
    expect(b.status).toBe('over')
  })
})

describe('detectFinanceAlerts', () => {
  it('fires price-move when threshold breached', () => {
    const alerts = detectFinanceAlerts({
      quotes: [{ symbol: 'BTC', assetClass: 'crypto', price: 70000, currency: 'USD', changePct24h: 12, asOf: '2026-06-01' }],
      revenue: [],
      budget: { monthlyBudgetUsd: 1000, spentMtdUsd: 10, burnRatio: 0.01, runwayDays: 99, status: 'ok' },
      config: DEFAULT_CONFIG,
    })
    expect(alerts.some((a) => a.kind === 'price-move')).toBe(true)
  })

  it('fires revenue-dip', () => {
    const now = Date.now()
    const recent = (offset: number, amt: number) => ({
      id: String(offset + amt),
      source: 'gumroad',
      postedAt: new Date(now - offset * 86400_000).toISOString(),
      amountUsd: amt,
      kind: 'sale',
    })
    const alerts = detectFinanceAlerts({
      quotes: [],
      revenue: [
        recent(10, 200),
        recent(11, 200),
        recent(1, 50),
      ],
      budget: { monthlyBudgetUsd: 1000, spentMtdUsd: 10, burnRatio: 0.01, runwayDays: 99, status: 'ok' },
      config: DEFAULT_CONFIG,
    })
    expect(alerts.some((a) => a.kind === 'revenue-dip')).toBe(true)
  })

  it('fires budget-exceeded', () => {
    const alerts = detectFinanceAlerts({
      quotes: [],
      revenue: [],
      budget: { monthlyBudgetUsd: 100, spentMtdUsd: 200, burnRatio: 2, runwayDays: 0, status: 'over' },
      config: DEFAULT_CONFIG,
    })
    expect(alerts.some((a) => a.kind === 'budget-exceeded')).toBe(true)
  })
})
