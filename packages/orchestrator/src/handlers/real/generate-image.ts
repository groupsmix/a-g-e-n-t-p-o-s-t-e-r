/**
 * Real `generate-image` handler — wraps the Replicate-backed
 * `@repo/generators` image pipeline.
 *
 * Dep injection: we don't import @repo/generators directly here (keeps
 * the orchestrator package tree-shake friendly when the runtime doesn't
 * ship Replicate). The boot code passes a `generateImage` function.
 *
 * Payload:
 *   { topic: string,
 *     niche: string,
 *     style?: PosterStyle,        // default 'bold_typographic'
 *     aspectRatio?: AspectRatio,  // default '1:1'
 *     model?: ImageModel,         // default 'flux-schnell'
 *     numOutputs?: number,
 *     colorScheme?: string,
 *     hasText?: boolean,
 *     brandName?: string }
 *
 * Output `data`: { urls: string[], prompt: string, model: ImageModel }.
 */

import type { AgentContext, AgentHandler, HandlerOutcome } from '../../types.js'

export type PosterStyle =
  | 'modern_flat'
  | 'dark_luxury'
  | 'bright_viral'
  | 'minimalist'
  | 'bold_typographic'
  | 'photo_realistic'

export type AspectRatio = '1:1' | '9:16' | '16:9' | '4:5'
export type ImageModel = 'flux-1.1-pro' | 'sdxl' | 'flux-dev' | 'flux-schnell'

export interface GenerateImagePayload {
  topic: string
  niche: string
  style?: PosterStyle
  aspectRatio?: AspectRatio
  model?: ImageModel
  numOutputs?: number
  colorScheme?: string
  hasText?: boolean
  brandName?: string
}

export interface GenerateImageData {
  urls: string[]
  prompt: string
  model: ImageModel
}

/**
 * Build the prompt + negative prompt + dimensions. Same logic as
 * `@repo/generators/image/prompt-builder` — duplicated thin so the
 * orchestrator doesn't transitively pull in Replicate types.
 */
function buildPrompt(p: GenerateImagePayload): { prompt: string; negativePrompt: string; width: number; height: number } {
  const styleDesc: Record<PosterStyle, string> = {
    modern_flat: 'flat design, clean geometric shapes, modern illustration, bold colors, minimal',
    dark_luxury: 'dark background, gold accents, luxury aesthetic, premium feel, high contrast',
    bright_viral: 'bright vivid colors, eye-catching, high saturation, dynamic composition, social media ready',
    minimalist: 'white background, minimal elements, lots of whitespace, elegant typography, simple',
    bold_typographic: 'typography-focused, bold text layout, graphic design, editorial',
    photo_realistic: 'photorealistic, high detail, professional photography, studio lighting, 8K quality',
  }
  const dims: Record<AspectRatio, { width: number; height: number }> = {
    '1:1': { width: 1024, height: 1024 },
    '9:16': { width: 768, height: 1344 },
    '16:9': { width: 1344, height: 768 },
    '4:5': { width: 896, height: 1120 },
  }
  const style = p.style ?? 'bold_typographic'
  const aspect = p.aspectRatio ?? '1:1'
  const noText = p.hasText ? '' : ', no text, no words, no letters'
  const color = p.colorScheme ? `, color palette ${p.colorScheme}` : ''
  const prompt = `${p.niche} content about "${p.topic}", ${styleDesc[style]}${color}${noText}, professional quality, trending on social media`
  return {
    prompt,
    negativePrompt: 'blurry, low quality, watermark, ugly, distorted, amateur, pixelated, overexposed, underexposed',
    ...dims[aspect],
  }
}

export interface ImageClient {
  generate(params: {
    prompt: string
    negativePrompt?: string
    width: number
    height: number
    model: ImageModel
    numOutputs?: number
  }): Promise<string[]>
}

export interface GenerateImageHandlerDeps {
  image: ImageClient
  defaultModel?: ImageModel
}

export function createGenerateImageHandler(
  deps: GenerateImageHandlerDeps,
): AgentHandler<GenerateImagePayload, GenerateImageData> {
  return {
    type: 'generate-image',
    name: 'Image Generator',
    description: 'Generate posters / thumbnails / IG carousel covers via Replicate (Flux / SDXL).',

    async run(ctx: AgentContext<GenerateImagePayload>): Promise<HandlerOutcome<GenerateImageData>> {
      const payload = ctx.task.payload
      if (!payload.topic || !payload.niche) {
        throw new Error('generate-image: payload.topic and payload.niche are required')
      }
      const model = payload.model ?? deps.defaultModel ?? 'flux-schnell'
      const built = buildPrompt(payload)

      const urls = await deps.image.generate({
        ...built,
        model,
        numOutputs: payload.numOutputs ?? 1,
      })

      return {
        data: { urls, prompt: built.prompt, model },
        summary: `Generated ${urls.length} image(s) for "${payload.topic}" (${model}, ${payload.aspectRatio ?? '1:1'})`,
        memories: [
          {
            type: 'event',
            content: `Generated image for ${payload.niche}/${payload.topic} via ${model}`,
            tags: ['image', model, payload.niche],
          },
        ],
        nextActions: ['Use the generated image in a publish task'],
        usage: { model },
      }
    },
  }
}
