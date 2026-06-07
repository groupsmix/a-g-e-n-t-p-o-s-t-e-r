/**
 * @posteragent/agent-podcast
 *
 * TASK-603 — Podcast agent. Script → TTS segments → assembled episode →
 * upload → RSS.
 */

export * from './pipeline/index.js'
export { createPodcastHandler } from './handler.js'
export type { PodcastPayload, PodcastHandlerOutcome } from './handler.js'
export type {
  PodcastBrief,
  ScriptSegment,
  SynthesisedSegment,
  PodcastEpisode,
  PodcastReport,
  UploadResult,
  FeedAppendResult,
  TtsClient,
  AudioUploader,
  RssPublisher,
} from './types.js'
