/**
 * OpenAI Images (DALL·E 3 / gpt-image-1) provider.
 */

import type { ImageAspect, ImageProvider } from '../types.js'

const SIZE_FOR_ASPECT: Record<ImageAspect, string> = {
  '1:1': '1024x1024',
  '16:9': '1792x1024',
  '9:16': '1024x1792',
  '4:5': '1024x1280',
  '3:2': '1536x1024',
}

export interface OpenAiImagesConfig {
  apiKey: string
  model?: string
  baseUrl?: string
  fetch?: typeof fetch
}

interface ImagesResponse {
  data?: Array<{ b64_json?: string; url?: string }>
  error?: { message?: string }
}

export function createOpenAiImagesProvider(config: OpenAiImagesConfig): ImageProvider {
  const f = config.fetch ?? fetch
  const base = (config.baseUrl ?? 'https://api.openai.com').replace(/\/$/, '')
  const model = config.model ?? 'gpt-image-1'
  return {
    name: 'openai',
    async generate({ prompt, aspect, seed }) {
      const size = SIZE_FOR_ASPECT[aspect] ?? '1024x1024'
      const res = await f(`${base}/v1/images/generations`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${config.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          prompt,
          size,
          n: 1,
          response_format: 'b64_json',
          ...(seed != null ? { seed } : {}),
        }),
      })
      const data = (await res.json().catch(() => ({}))) as ImagesResponse
      if (!res.ok || data.error) throw new Error(data.error?.message ?? `OpenAI images HTTP ${res.status}`)
      const b64 = data.data?.[0]?.b64_json
      if (!b64) throw new Error('openai images: no b64_json in response')
      const [w, h] = size.split('x').map((n) => parseInt(n, 10))
      return {
        id: `oai_${aspect}_${seed ?? 0}`,
        prompt,
        aspect,
        imageBase64: b64,
        mime: 'image/png',
        provider: 'openai',
        width: w,
        height: h,
      }
    },
  }
}
