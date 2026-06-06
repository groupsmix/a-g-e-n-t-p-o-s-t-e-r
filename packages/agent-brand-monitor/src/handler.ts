/**
 * Orchestrator handler — registered for AgentTaskType 'brand-monitor'.
 *
 *   import { createBrandMonitorHandler } from '@posteragent/agent-brand-monitor'
 *   import { createRedditSource, createHackerNewsSource,
 *            createAnthropicSentiment } from '@posteragent/agent-brand-monitor/adapters'
 *
 *   const handler = createBrandMonitorHandler({
 *     scorer: createAnthropicSentiment({ apiKey: env.ANTHROPIC_API_KEY }),
 *     sources: [createRedditSource(), createHackerNewsSource()],
 *   })
 *   registry.override(handler)
 *
 * Payload shape (task.payload):
 *   {
 *     brand: string[]              // required
 *     competitors?: string[]
 *     config?: Partial<MonitorConfig>
 *   }
 *
 * Returns a MonitorReport plus:
 *   - one memory per alert (so the journal can render alerts later)
 *   - nextActions:
 *       - "Reply to viral mention X" for each viral alert
 *       - "Investigate negative spike" when one fires
 */

import type {
  MentionSource,
  MonitorConfig,
  MonitorReport,
  SentimentScorer,
} from './types.js'
import { monitor } from './pipeline/monitor.js'

export interface BrandMonitorHandlerDeps {
  sources: MentionSource[]
  scorer?: SentimentScorer
  config?: Partial<MonitorConfig>
}

export interface BrandMonitorPayload {
  brand: string[]
  competitors?: string[]
  config?: Partial<MonitorConfig>
}

export interface BrandMonitorOutcome {
  data: MonitorReport
  summary: string
  memories: Array<{
    type: 'fact' | 'event' | 'preference' | 'project' | 'identity'
    content: string
    tags?: string[]
  }>
  nextActions: string[]
  usage: {
    model?: string
    inputTokens: number
    outputTokens: number
  }
}

export function createBrandMonitorHandler(deps: BrandMonitorHandlerDeps) {
  if (!deps.sources?.length) {
    throw new Error('createBrandMonitorHandler(): at least one source is required')
  }

  return {
    type: 'brand-monitor' as const,
    name: 'Brand Monitor Agent',
    description:
      'Scans Reddit, HackerNews, Google News, YouTube (and any registered source) for brand + competitor mentions; runs LLM sentiment; emits alerts for negative spikes, viral mentions, and competitor actions.',
    async run(ctx: {
      task: { id: string; payload: BrandMonitorPayload }
      log?: {
        info(msg: string, meta?: Record<string, unknown>): void
        warn(msg: string, meta?: Record<string, unknown>): void
      }
      signal?: AbortSignal
    }): Promise<BrandMonitorOutcome> {
      const brand = (ctx.task.payload?.brand ?? []).filter(Boolean)
      const competitors = (ctx.task.payload?.competitors ?? []).filter(Boolean)
      if (!brand.length) {
        throw new Error('brand-monitor handler: payload.brand[] is required')
      }

      const report = await monitor({
        brand,
        competitors,
        sources: deps.sources,
        scorer: deps.scorer,
        config: { ...deps.config, ...ctx.task.payload?.config },
        signal: ctx.signal,
        log: ctx.log,
      })

      const a = report.alerts
      const negSpike = a.filter((x) => x.kind === 'negative-spike').length
      const viral = a.filter((x) => x.kind === 'viral-mention').length
      const compAction = a.filter((x) => x.kind === 'competitor-action').length

      const summary =
        `Monitored ${brand.join(', ')} (${report.sinceHours}h): ` +
        `${report.summary.total} mentions ` +
        `[+${report.summary.positive} /${report.summary.neutral} -${report.summary.negative}], ` +
        `${report.alerts.length} alerts (${negSpike} negative-spike, ${viral} viral, ${compAction} competitor).`

      const memories = report.alerts.map((alert) => ({
        type: 'event' as const,
        content: alert.headline + ' — ' + alert.detail,
        tags: [
          'brand-monitor',
          alert.kind,
          alert.severity,
          ...brand.map((b) => b.toLowerCase()),
        ],
      }))

      const nextActions: string[] = []
      for (const alert of report.alerts) {
        if (alert.kind === 'negative-spike') {
          nextActions.push('Investigate negative-sentiment spike and draft a response plan')
        } else if (alert.kind === 'viral-mention') {
          nextActions.push(`Reply / engage with viral mention (${alert.mentionIds.join(', ')})`)
        } else if (alert.kind === 'competitor-action') {
          nextActions.push(`Review competitor action (${alert.mentionIds.join(', ')}) and decide on counter-content`)
        }
      }
      if (!nextActions.length) {
        nextActions.push('No alerts. Next sweep in 6h.')
      }

      return {
        data: report,
        summary,
        memories,
        nextActions,
        usage: {
          model: deps.config?.sentimentModel,
          inputTokens: report.usage.sentimentInputTokens,
          outputTokens: report.usage.sentimentOutputTokens,
        },
      }
    },
  }
}
