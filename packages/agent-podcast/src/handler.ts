/**
 * Podcast handler — task type 'generate-video' is video-only, so the
 * podcast piggybacks on 'write' with payload.kind='podcast' (consistent
 * with the multi-tenant 'write' dispatch we use for docs/products).
 */

import type { PodcastBrief, PodcastReport } from './types.js'
import { runPodcast, type PodcastDeps } from './pipeline/podcast.js'

export interface PodcastPayload extends PodcastBrief {
  kind?: 'podcast'
}

export interface PodcastHandlerOutcome {
  data: PodcastReport
  summary: string
  memories: Array<{ kind: 'fact'; content: string; meta?: Record<string, unknown> }>
  nextActions: Array<{ type: string; reason: string; payload?: Record<string, unknown> }>
  usage: { inputTokens: number; outputTokens: number }
}

export function createPodcastHandler(deps: PodcastDeps) {
  return {
    type: 'write' as const,
    name: 'podcast',
    description: 'Script → TTS → assemble → upload → RSS. TASK-603.',
    async run(ctx: { payload: PodcastPayload }): Promise<PodcastHandlerOutcome> {
      const report = await runPodcast(ctx.payload, deps)
      const summary = report.feed?.ok
        ? `Published episode "${report.brief.title}" (${report.episode.totalDurationSec.toFixed(0)}s) — feed updated`
        : report.upload?.ok
          ? `Uploaded episode "${report.brief.title}" — RSS append pending`
          : `Assembled episode "${report.brief.title}" — upload pending`
      return {
        data: report,
        summary,
        memories: report.feed?.ok
          ? [{ kind: 'fact', content: `Podcast episode "${report.brief.title}" published`, meta: { guid: report.feed.guid } }]
          : [],
        nextActions: report.feed?.ok
          ? [{ type: 'publish', reason: 'announce new episode', payload: { title: report.brief.title, audioUrl: report.upload?.url } }]
          : [],
        usage: { inputTokens: 0, outputTokens: 0 },
      }
    },
  }
}
