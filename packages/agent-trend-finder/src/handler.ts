/**
 * Orchestrator handler. Registered for AgentTaskType 'analyse' with
 * payload.kind === 'youtube-trends', so the registry can dispatch
 * multiple analyser flavours through one task type.
 *
 *   const handler = createTrendFinderHandler({
 *     source: createYouTubeTrendSource({ apiKey: env.YOUTUBE_API_KEY }),
 *     transcripts: createYouTubeTranscriptSource(),
 *     llm: createAnthropicLLM({ apiKey: env.ANTHROPIC_API_KEY }),
 *   })
 *   registry.override(handler)
 *
 * Payload:
 *   { niches: string[], config?: Partial<TrendConfig> }
 *
 * Returns a TrendReport plus:
 *   - one 'event' memory per brief, so the writer agent can pick them up
 *   - nextActions including queued 'write' task descriptors per brief
 */

import type {
  LLMClient,
  TranscriptSource,
  TrendConfig,
  TrendReport,
  TrendSource,
} from './types.js'
import { analyseTrends } from './pipeline/trends.js'

export interface TrendFinderHandlerDeps {
  source: TrendSource
  transcripts?: TranscriptSource
  llm?: LLMClient
  config?: Partial<TrendConfig>
}

export interface TrendFinderPayload {
  niches: string[]
  config?: Partial<TrendConfig>
  /** Discriminator for the 'analyse' task type. */
  kind?: 'youtube-trends'
}

export interface TrendFinderOutcome {
  data: TrendReport
  summary: string
  memories: Array<{
    type: 'fact' | 'event' | 'preference' | 'project' | 'identity'
    content: string
    tags?: string[]
  }>
  nextActions: string[]
  usage: { model?: string; inputTokens: number; outputTokens: number }
}

export function createTrendFinderHandler(deps: TrendFinderHandlerDeps) {
  return {
    type: 'analyse' as const,
    name: 'YouTube Trend Analyser',
    description:
      'Fetches trending videos per niche, mines title / hook / thumbnail patterns, surfaces under-served topics, and writes content briefs queue-ready for the Writer agent.',
    async run(ctx: {
      task: { id: string; payload: TrendFinderPayload }
      log?: {
        info(msg: string, meta?: Record<string, unknown>): void
        warn(msg: string, meta?: Record<string, unknown>): void
      }
      signal?: AbortSignal
    }): Promise<TrendFinderOutcome> {
      const niches = (ctx.task.payload?.niches ?? []).filter(Boolean)
      if (!niches.length) {
        throw new Error('trend-finder handler: payload.niches[] is required')
      }
      const report = await analyseTrends({
        niches,
        source: deps.source,
        transcripts: deps.transcripts,
        llm: deps.llm,
        config: { ...deps.config, ...ctx.task.payload?.config },
        signal: ctx.signal,
        log: ctx.log,
      })

      const summary =
        `Trend analysis on ${niches.join(', ')}: ${report.videos.length} videos, ` +
        `${report.clusters.length} clusters, ${report.gaps.length} gaps, ` +
        `${report.briefs.length} content briefs generated.`

      const memories = report.briefs.map((b) => ({
        type: 'event' as const,
        content:
          `Content brief: ${b.workingTitle} (niche: ${b.niche}, format: ${b.format}). ` +
          `Hook: ${b.hook} Differentiator: ${b.differentiator}`,
        tags: ['trend-finder', 'content-brief', b.niche, b.format],
      }))

      const nextActions = report.briefs.map(
        (b) =>
          `Queue 'write' task: ${b.workingTitle} (${b.format}, niche=${b.niche})`,
      )
      if (!nextActions.length) {
        nextActions.push('No high-confidence gaps in this window. Re-scan in 24h.')
      }

      return {
        data: report,
        summary,
        memories,
        nextActions,
        usage: {
          model: deps.config?.briefModel ?? deps.config?.clusterModel,
          inputTokens: report.usage.clusterInputTokens + report.usage.briefInputTokens,
          outputTokens: report.usage.clusterOutputTokens + report.usage.briefOutputTokens,
        },
      }
    },
  }
}
