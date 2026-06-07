/**
 * Real `generate-video` handler — drives the Remotion compositions in
 * `@repo/generators/video`. As with generate-image, we inject the
 * renderer instead of importing it directly (Remotion brings in webpack
 * + chromium and shouldn't be loaded in environments that just want to
 * dispatch tasks).
 *
 * Payload:
 *   { composition: VideoComposition,
 *     props: Record<string, unknown>,
 *     outputPath?: string,
 *     codec?: 'h264'|'h265' }
 */

import type { AgentContext, AgentHandler, HandlerOutcome } from '../../types.js'

export type VideoComposition =
  | 'CountdownList'
  | 'FinanceTip'
  | 'MotivationalQuote'
  | 'NewsBreaker'
  | 'PosterSlideshow'
  | 'ProductShowcase'
  | 'RedditStory'
  | 'ShortVideo'

export interface GenerateVideoPayload {
  composition: VideoComposition
  props: Record<string, unknown>
  outputPath?: string
  codec?: 'h264' | 'h265' | 'vp8' | 'vp9'
}

export interface GenerateVideoData {
  videoPath: string
  composition: VideoComposition
}

export interface VideoRenderer {
  render(params: {
    compositionId: string
    props: Record<string, unknown>
    outputPath?: string
    codec?: 'h264' | 'h265' | 'vp8' | 'vp9'
  }): Promise<string>
}

export interface GenerateVideoHandlerDeps {
  renderer: VideoRenderer
}

const COMPOSITIONS: ReadonlyArray<VideoComposition> = [
  'CountdownList',
  'FinanceTip',
  'MotivationalQuote',
  'NewsBreaker',
  'PosterSlideshow',
  'ProductShowcase',
  'RedditStory',
  'ShortVideo',
]

export function createGenerateVideoHandler(
  deps: GenerateVideoHandlerDeps,
): AgentHandler<GenerateVideoPayload, GenerateVideoData> {
  return {
    type: 'generate-video',
    name: 'Video Renderer',
    description: 'Render short-form videos (TikTok / Reels / YT Shorts) via 8 Remotion compositions.',

    async run(ctx: AgentContext<GenerateVideoPayload>): Promise<HandlerOutcome<GenerateVideoData>> {
      const payload = ctx.task.payload
      if (!COMPOSITIONS.includes(payload.composition)) {
        throw new Error(
          `generate-video: unknown composition "${payload.composition}". Valid: ${COMPOSITIONS.join(', ')}`,
        )
      }

      const videoPath = await deps.renderer.render({
        compositionId: payload.composition,
        props: payload.props,
        outputPath: payload.outputPath,
        codec: payload.codec ?? 'h264',
      })

      return {
        data: { videoPath, composition: payload.composition },
        summary: `Rendered ${payload.composition} -> ${videoPath}`,
        memories: [
          {
            type: 'event',
            content: `Rendered ${payload.composition} video`,
            tags: ['video', payload.composition],
          },
        ],
        nextActions: ['Upload the rendered video and queue a publish task'],
        usage: {},
      }
    },
  }
}
