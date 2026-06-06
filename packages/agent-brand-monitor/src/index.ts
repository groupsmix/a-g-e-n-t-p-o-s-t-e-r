/**
 * @posteragent/agent-brand-monitor
 *
 * TASK-402 — Brand Monitor Agent.
 * Reddit / HackerNews / Google News / YouTube (+ pluggable sources)
 * mention scanner with LLM sentiment + alert detection.
 *
 * Public surface:
 *
 *   import { monitor } from '@posteragent/agent-brand-monitor'
 *   import { createBrandMonitorHandler } from '@posteragent/agent-brand-monitor'
 *   import {
 *     createRedditSource,
 *     createHackerNewsSource,
 *     createNewsSource,
 *     createYouTubeSource,
 *     createAnthropicSentiment,
 *   } from '@posteragent/agent-brand-monitor/adapters'
 *
 *   const handler = createBrandMonitorHandler({
 *     sources: [
 *       createRedditSource(),
 *       createHackerNewsSource(),
 *       createNewsSource({ apiKey: env.NEWS_API_KEY }),
 *       createYouTubeSource({ apiKey: env.YOUTUBE_API_KEY }),
 *     ],
 *     scorer: createAnthropicSentiment({ apiKey: env.ANTHROPIC_API_KEY }),
 *   })
 *   registry.override(handler)
 *
 * Runs ad-hoc from the dashboard, or every 6h via the proactivity cron.
 */

export { monitor } from './pipeline/monitor.js'
export type { MonitorInput } from './pipeline/monitor.js'

export { scanMentions } from './pipeline/scanner.js'
export { scoreMentions, heuristicSentiment, computeVirality } from './pipeline/scorer.js'
export { detectAlerts } from './pipeline/alerter.js'

export { createBrandMonitorHandler } from './handler.js'
export type {
  BrandMonitorHandlerDeps,
  BrandMonitorPayload,
  BrandMonitorOutcome,
} from './handler.js'

export type {
  Mention,
  MentionPlatform,
  MentionSource,
  SentimentLabel,
  SentimentScore,
  SentimentScorer,
  ScoredMention,
  AlertKind,
  BrandAlert,
  MonitorReport,
  MonitorConfig,
} from './types.js'

export { DEFAULT_CONFIG } from './types.js'
