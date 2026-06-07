/**
 * @posteragent/agent-trend-finder
 *
 * TASK-403 — YouTube Trend Analyser.
 *
 *   import { analyseTrends, createTrendFinderHandler }
 *     from '@posteragent/agent-trend-finder'
 *   import {
 *     createYouTubeTrendSource,
 *     createYouTubeTranscriptSource,
 *     createAnthropicLLM,
 *   } from '@posteragent/agent-trend-finder/adapters'
 *
 *   const handler = createTrendFinderHandler({
 *     source: createYouTubeTrendSource({ apiKey: env.YOUTUBE_API_KEY }),
 *     transcripts: createYouTubeTranscriptSource(),
 *     llm: createAnthropicLLM({ apiKey: env.ANTHROPIC_API_KEY }),
 *   })
 *   registry.override(handler)
 */

export { analyseTrends } from './pipeline/trends.js'
export type { TrendInput } from './pipeline/trends.js'

export {
  fetchTrending,
  extractTitlePatterns,
  extractHooks,
  extractThumbnailPatterns,
  extractVelocity,
  clusterTopics,
  findGaps,
  generateBriefs,
} from './pipeline/index.js'

export { createTrendFinderHandler } from './handler.js'
export type {
  TrendFinderHandlerDeps,
  TrendFinderPayload,
  TrendFinderOutcome,
} from './handler.js'

export type {
  Video,
  TrendSource,
  TranscriptSource,
  LLMClient,
  TitlePattern,
  HookStyle,
  ThumbnailPattern,
  VelocityMetric,
  TopicCluster,
  ContentGap,
  ContentBrief,
  TrendReport,
  TrendConfig,
} from './types.js'

export { DEFAULT_CONFIG } from './types.js'
