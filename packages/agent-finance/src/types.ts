/**
 * @posteragent/agent-finance — types
 *
 * Provider-agnostic. Depends on:
 *   - PriceSource (stocks + crypto quotes, configurable)
 *   - RevenueSource (Gumroad, Amazon Associates, Stripe, custom)
 *   - CostLedger (where the orchestrator has been writing AI spend rows)
 *
 * Pipeline:
 *   inputs (tickers + revenue sources + budgets)
 *     → fetchPrices (fan-out)
 *     → fetchRevenue (fan-out)
 *     → buildPnl (per-source roll-up + total)
 *     → forecastRevenue (linear + 3-week MA)
 *     → checkBudget (AI spend vs cap, runway)
 *     → detectAlerts (price moves, revenue dips, budget burn)
 *     → FinanceReport
 */

// ─── Prices ──────────────────────────────────────────────────────────

export type AssetClass = 'stock' | 'crypto' | 'fx' | 'commodity' | 'other'

export interface Quote {
  symbol: string
  assetClass: AssetClass
  /** Display name e.g. "Bitcoin" / "Apple Inc." */
  name?: string
  /** Spot price in `currency`. */
  price: number
  currency: string
  /** Day change in %. Optional. */
  changePct24h?: number
  /** ISO timestamp of the quote. */
  asOf: string
}

export interface PriceSource {
  readonly name: string
  readonly supports: AssetClass[]
  quote(input: {
    symbol: string
    assetClass: AssetClass
    signal?: AbortSignal
  }): Promise<Quote | undefined>
}

// ─── Revenue ─────────────────────────────────────────────────────────

export interface RevenueEntry {
  /** Stable id used for dedupe. */
  id: string
  source: string
  /** ISO date the revenue posted. */
  postedAt: string
  amountUsd: number
  /** "sale" | "commission" | "subscription" | "refund". */
  kind: string
  /** What was sold (product name, listing). */
  description?: string
}

export interface RevenueSource {
  readonly name: string
  fetchEntries(input: {
    /** ISO; default 90d ago. */
    sinceIso: string
    signal?: AbortSignal
  }): Promise<RevenueEntry[]>
}

// ─── Cost ledger ─────────────────────────────────────────────────────

export interface CostEntry {
  postedAt: string
  /** Per-model or per-agent label. */
  category: string
  amountUsd: number
  /** Optional ref back to the orchestrator task row. */
  taskId?: string
}

export interface CostLedger {
  readonly name: string
  fetchEntries(input: {
    sinceIso: string
    signal?: AbortSignal
  }): Promise<CostEntry[]>
}

// ─── P&L ────────────────────────────────────────────────────────────

export interface PnlBySource {
  source: string
  revenueUsd: number
  count: number
}

export interface PnlReport {
  /** ISO date the window opened on. */
  windowStartIso: string
  /** ISO date the window closed on. */
  windowEndIso: string
  totalRevenueUsd: number
  totalCostUsd: number
  /** revenue - cost. */
  netUsd: number
  /** net / revenue (0 if no revenue). */
  marginPct: number
  bySource: PnlBySource[]
  byCostCategory: Array<{ category: string; amountUsd: number }>
}

// ─── Forecast ────────────────────────────────────────────────────────

export interface RevenueForecast {
  /** Three weeks out, weekly buckets. */
  next4Weeks: Array<{
    weekStartIso: string
    forecastUsd: number
    /** ±this many dollars (90% interval). */
    plusMinus: number
  }>
  method: 'linear-3wk-ma'
  notes: string
}

// ─── Budget guard ────────────────────────────────────────────────────

export interface BudgetStatus {
  monthlyBudgetUsd: number
  spentMtdUsd: number
  /** spent / budget — 0..1+ */
  burnRatio: number
  /** Days until current burn rate would exhaust budget. */
  runwayDays: number
  status: 'ok' | 'warning' | 'over'
}

// ─── Alerts ──────────────────────────────────────────────────────────

export type FinanceAlertKind =
  | 'price-move'
  | 'revenue-dip'
  | 'budget-warning'
  | 'budget-exceeded'
  | 'affiliate-bump'

export interface FinanceAlert {
  kind: FinanceAlertKind
  severity: 'low' | 'medium' | 'high'
  headline: string
  detail: string
}

// ─── Report ──────────────────────────────────────────────────────────

export interface FinanceReport {
  quotes: Quote[]
  revenue: RevenueEntry[]
  costs: CostEntry[]
  pnl: PnlReport
  forecast: RevenueForecast
  budget: BudgetStatus
  alerts: FinanceAlert[]
  timings: {
    pricesMs: number
    revenueMs: number
    costsMs: number
    analyseMs: number
    totalMs: number
  }
}

// ─── Pipeline config ─────────────────────────────────────────────────

export interface FinanceConfig {
  /** Look back this many days for P&L + forecast. Default 90. */
  lookbackDays: number
  /** Alert when a tracked asset moves more than this % in 24h. Default 8. */
  priceMoveThresholdPct: number
  /** Alert when weekly revenue drops more than this % WoW. Default 30. */
  revenueDipThresholdPct: number
  /** Budget warning at this fraction of the cap. Default 0.8. */
  budgetWarningRatio: number
  /** Per-source timeouts. */
  priceTimeoutMs: number
  revenueTimeoutMs: number
}

export const DEFAULT_CONFIG: FinanceConfig = {
  lookbackDays: 90,
  priceMoveThresholdPct: 8,
  revenueDipThresholdPct: 30,
  budgetWarningRatio: 0.8,
  priceTimeoutMs: 15_000,
  revenueTimeoutMs: 30_000,
}
