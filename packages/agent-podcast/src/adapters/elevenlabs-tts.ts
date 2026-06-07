/**
 * ElevenLabs TTS adapter. voice param should be the ElevenLabs voiceId.
 */

import type { TtsClient } from '../types.js'

export interface ElevenLabsConfig {
  apiKey: string
  modelId?: string
  baseUrl?: string
  fetch?: typeof fetch
}

export function createElevenLabsTts(config: ElevenLabsConfig): TtsClient {
  const f = config.fetch ?? fetch
  const base = (config.baseUrl ?? 'https://api.elevenlabs.io').replace(/\/$/, '')
  const modelId = config.modelId ?? 'eleven_multilingual_v2'
  return {
    async synth({ voice, text }) {
      const res = await f(`${base}/v1/text-to-speech/${encodeURIComponent(voice)}`, {
        method: 'POST',
        headers: {
          'xi-api-key': config.apiKey,
          'content-type': 'application/json',
          accept: 'audio/mpeg',
        },
        body: JSON.stringify({ text, model_id: modelId }),
      })
      if (!res.ok) {
        const txt = await res.text().catch(() => '')
        throw new Error(`ElevenLabs HTTP ${res.status}: ${txt.slice(0, 200)}`)
      }
      const buf = new Uint8Array(await res.arrayBuffer())
      const audioBase64 =
        typeof Buffer !== 'undefined'
          ? Buffer.from(buf).toString('base64')
          : btoa(String.fromCharCode(...buf))
      const words = text.split(/\s+/).filter(Boolean).length
      return {
        audioBase64,
        durationSec: +(words / 2.5).toFixed(2),
        mime: 'audio/mpeg',
      }
    },
  }
}
