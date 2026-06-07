/**
 * Stability AI (SD3) provider — v2beta/stable-image/generate/sd3.
 */

import type { ImageAspect, ImageProvider } from '../types.js'

const ASPECT_MAP: Record<ImageAspect, string> = {
  '1:1': '1:1',
  '16:9': '16:9',
  '9:16': '9:16',
  '4:5': '4:5',
  '3:2': '3:2',
}

export interface StabilityConfig {
  apiKey: string
  baseUrl?: string
  fetch?: typeof fetch
}

export function createStabilityProvider(config: StabilityConfig): ImageProvider {
  const f = config.fetch ?? fetch
  const base = (config.baseUrl ?? 'https://api.stability.ai').replace(/\/$/, '')
  return {
    name: 'stability',
    async generate({ prompt, aspect, seed, negative }) {
      const form = new FormData()
      form.append('prompt', prompt)
      form.append('aspect_ratio', ASPECT_MAP[aspect] ?? '1:1')
      form.append('output_format', 'png')
      if (seed != null) form.append('seed', String(seed))
      if (negative) form.append('negative_prompt', negative)
      const res = await f(`${base}/v2beta/stable-image/generate/sd3`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${config.apiKey}`,
          accept: 'image/*',
        },
        body: form,
      })
      if (!res.ok) {
        const txt = await res.text().catch(() => '')
        throw new Error(`Stability HTTP ${res.status}: ${txt.slice(0, 200)}`)
      }
      const buf = new Uint8Array(await res.arrayBuffer())
      const b64 = typeof Buffer !== 'undefined'
        ? Buffer.from(buf).toString('base64')
        : btoa(String.fromCharCode(...buf))
      return {
        id: `stab_${aspect}_${seed ?? 0}`,
        prompt,
        aspect,
        imageBase64: b64,
        mime: 'image/png',
        provider: 'stability',
      }
    },
  }
}
