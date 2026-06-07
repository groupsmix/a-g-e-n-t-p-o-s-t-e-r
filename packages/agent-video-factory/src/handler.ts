/**
 * Video factory handler — registers under 'generate-video'.
 */

import type { VideoBrief, VideoReport } from './types.js'
import {
  runVideoFactory,
  type VideoFactoryDeps,
  type VideoFactoryInput,
} from './pipeline/video-factory.js'

export interface VideoFactoryPayload extends VideoFactoryInput {}

export interface VideoFactoryHandlerOutcome {
  data: VideoReport
  summary: string
  memories: Array<{ kind: 'fact'; content: string; meta?: Record<string, unknown> }>
  nextActions: Array<{ type: string; reason: string; payload?: Record<string, unknown> }>
  usage: { inputTokens: number; outputTokens: number }
}

export function createVideoFactoryHandler(deps: VideoFactoryDeps) {
  return {
    type: 'generate-video' as const,
    name: 'video-factory',
    description: 'Script → storyboard → Remotion render → upload. TASK-602.',
    async run(ctx: { payload: VideoFactoryPayload }): Promise<VideoFactoryHandlerOutcome> {
      const report = await runVideoFactory(ctx.payload, deps)
      const summary = report.upload?.ok
        ? `Rendered ${report.storyboard.scenes.length} scenes (${report.storyboard.durationSec}s) → ${report.upload.url}`
        : report.render.ok
          ? `Rendered ${report.storyboard.scenes.length} scenes (${report.storyboard.durationSec}s); upload pending`
          : `Render failed: ${report.render.error}`
      const memories: VideoFactoryHandlerOutcome['memories'] = report.upload?.ok
        ? [
            {
              kind: 'fact',
              content: `Video "${report.brief.topic}" published at ${report.upload.url}`,
              meta: { provider: report.upload.provider, scenes: report.storyboard.scenes.length },
            },
          ]
        : []
      const nextActions: VideoFactoryHandlerOutcome['nextActions'] = report.upload?.ok
        ? [
            {
              type: 'publish',
              reason: 'announce new video across channels',
              payload: { url: report.upload.url, title: report.brief.hook || report.brief.topic },
            },
          ]
        : []
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
