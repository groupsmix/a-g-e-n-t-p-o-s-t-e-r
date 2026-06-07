/**
 * Image-gen handler — registers on 'generate-image'.
 */

import type { ImageBrief, ImageReport } from './types.js'
import { runImageGen, type ImageGenDeps } from './pipeline/image-gen.js'

export interface ImageGenPayload extends ImageBrief {}

export interface ImageGenHandlerOutcome {
  data: ImageReport
  summary: string
  memories: Array<{ kind: 'fact'; content: string; meta?: Record<string, unknown> }>
  nextActions: Array<{ type: string; reason: string; payload?: Record<string, unknown> }>
  usage: { inputTokens: number; outputTokens: number }
}

export function createImageGenHandler(deps: ImageGenDeps) {
  return {
    type: 'generate-image' as const,
    name: 'image-gen',
    description: 'Prompt → image batches (DALL·E / Stability). TASK-604.',
    async run(ctx: { payload: ImageGenPayload }): Promise<ImageGenHandlerOutcome> {
      const report = await runImageGen(ctx.payload, deps)
      const ok = report.images.length
      const summary = `Generated ${ok} image(s) (${report.failures.length} failed) — provider chain ${deps.provider?.name ?? 'dry-run'}.`
      return {
        data: report,
        summary,
        memories: [],
        nextActions: [],
        usage: { inputTokens: 0, outputTokens: 0 },
      }
    },
  }
}
