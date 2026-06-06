/**
 * Orchestrator handler — registered for AgentTaskType 'financial-analysis'.
 *
 *   const handler = createFinanceHandler({
 *     priceSources: [
 *       createCoinGeckoPriceSource(),
 *       createFinnhubPriceSource({ apiKey: env.FINNHUB_API_KEY }),
 *     ],
 *     revenueSources: [
 *       createGumroadRevenueSource({ accessToken: env.GUMROAD_TOKEN }),
 *       createAmazonAssociatesSource({ fetchEarningsCsv: ... }),
 *     ],
 *     costLedger: createD1CostLedger({ db: env.DB }),
 *     monthlyBudgetUsd: 200,
 *   })
 *   registry.override(handler)
 *
 * Payload:
 *   { tickers?: Array<{symbol, assetClass}>, config?: Partial<FinanceConfig> }
 */

import type {
  AssetClass,
  CostLedger,
  FinanceConfig,
  FinanceReport,
  PriceSource,
  RevenueSource,
} from './types.js'
import { analyseFinance } from './pipeline/finance.js'

export interface FinanceHandlerDeps {
  priceSources: PriceSource[]
  revenueSources: RevenueSource[]
  costLedger?: CostLedger
  /** Default tickers if payload omits them. */
  defaultTickers?: Array<{ symbol: string; assetClass: AssetClass }>
  monthlyBudgetUsd: number
  config?: Partial<FinanceConfig>
}

export interface FinancePayload {
  tickers?: Array<{ symbol: string; assetClass: AssetClass }>
  monthlyBudgetUsd?: number
  config?: Partial<FinanceConfig>
}

export interface FinanceOutcome {
  data: FinanceReport
  summary: string
  memories: Array<{
    type: 'fact' | 'event' | 'preference' | 'project' | 'identity'
    content: string
    tags?: string[]
  }>
  nextActions: string[]
  usage: { model?: string; inputTokens: number; outputTokens: number }
}

export function createFinanceHandler(deps: FinanceHandlerDeps) {
  return {
    type: 'financial-analysis' as const,
    name: 'Financial Analysis Agent',
    description:
      'Quotes tracked tickers, rolls up revenue from Gumroad / Amazon Associates / Stripe, ' +
      'computes P&L vs AI spend, forecasts revenue 4 weeks ahead, watches the AI budget.',
    async run(ctx: {
      task: { id: string; payload: FinancePayload }
      log?: {
        info(msg: string, meta?: Record<string, unknown>): void
        warn(msg: string, meta?: Record<string, unknown>): void
      }
      signal?: AbortSignal
    }): Promise<FinanceOutcome> {
      const tickers = ctx.task.payload?.tickers ?? deps.defaultTickers ?? []
      const report = await analyseFinance({
        tickers,
        priceSources: deps.priceSources,
        revenueSources: deps.revenueSources,
        costLedger: deps.costLedger,
        monthlyBudgetUsd:
          ctx.task.payload?.monthlyBudgetUsd ?? deps.monthlyBudgetUsd,
        config: { ...deps.config, ...ctx.task.payload?.config },
        signal: ctx.signal,
        log: ctx.log,
      })

      const summary =
        `Finance: revenue $${report.pnl.totalRevenueUsd}, ` +
        `cost $${report.pnl.totalCostUsd}, ` +
        `net $${report.pnl.netUsd} (${report.pnl.marginPct}% margin). ` +
        `Budget ${report.budget.status} (${(report.budget.burnRatio * 100).toFixed(0)}%). ` +
        `${report.alerts.length} alerts.`

      const memories = [
        {
          type: 'fact' as const,
          content:
            `P&L (${report.pnl.windowStartIso.slice(0, 10)} → ` +
            `${report.pnl.windowEndIso.slice(0, 10)}): ` +
            `rev $${report.pnl.totalRevenueUsd}, ` +
            `cost $${report.pnl.totalCostUsd}, ` +
            `net $${report.pnl.netUsd}.`,
          tags: ['finance', 'pnl', 'snapshot'],
        },
        ...report.alerts.map((a) => ({
          type: 'event' as const,
          content: `${a.headline} — ${a.detail}`,
          tags: ['finance', 'alert', a.kind, a.severity],
        })),
      ]

      const nextActions: string[] = []
      if (report.budget.status === 'over') {
        nextActions.push('Pause non-essential agents; AI spend over budget.')
      } else if (report.budget.status === 'warning') {
        nextActions.push('Investigate model usage; budget warning.')
      }
      for (const a of report.alerts) {
        if (a.kind === 'revenue-dip') {
          nextActions.push('Investigate revenue dip; queue a content+publish push.')
        } else if (a.kind === 'price-move') {
          nextActions.push(`Watch ${a.headline.split(' ')[0]} — large 24h move.`)
        } else if (a.kind === 'affiliate-bump') {
          nextActions.push('Lean into affiliate winners; queue content amplification.')
        }
      }
      if (!nextActions.length) {
        nextActions.push('Finance steady. No immediate action.')
      }

      return {
        data: report,
        summary,
        memories,
        nextActions,
        usage: { inputTokens: 0, outputTokens: 0 },
      }
    },
  }
}
