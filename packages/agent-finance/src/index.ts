/**
 * @posteragent/agent-finance
 *
 * TASK-404 — Financial Analysis Agent.
 *
 * Tracks stock + crypto prices, rolls up revenue from Gumroad / Amazon
 * Associates / Stripe / any RevenueSource, builds P&L, forecasts
 * revenue 4 weeks ahead, and guards the AI spend budget. Alerts on
 * large price moves, revenue dips, affiliate spikes, and budget burn.
 */

export { analyseFinance } from './pipeline/finance.js'
export type { AnalyseFinanceInput } from './pipeline/finance.js'

export {
  buildPnl,
  forecastRevenue,
  checkBudget,
  detectFinanceAlerts,
} from './pipeline/index.js'

export { createFinanceHandler } from './handler.js'
export type { FinanceHandlerDeps, FinancePayload, FinanceOutcome } from './handler.js'

export type {
  AssetClass,
  Quote,
  PriceSource,
  RevenueEntry,
  RevenueSource,
  CostEntry,
  CostLedger,
  PnlReport,
  PnlBySource,
  RevenueForecast,
  BudgetStatus,
  FinanceAlertKind,
  FinanceAlert,
  FinanceReport,
  FinanceConfig,
} from './types.js'

export { DEFAULT_CONFIG } from './types.js'
