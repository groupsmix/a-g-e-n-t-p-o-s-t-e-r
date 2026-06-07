/**
 * OpenAI TTS adapter (audio.speech).
 *
 * Returns base64 mp3 + estimated duration. We don't probe duration
 * from the binary (would need ffprobe); we estimate from word count
 * and let the publisher correct it post-encode if needed.
 */

import type { TtsClient } from '../types.js'

export interface OpenAiTtsConfig {
  apiKey: string
  model?: string
  baseUrl?: string
  fetch?: typeof fetch
}

export function createOpenAiTts(config: OpenAiTtsConfig): TtsClient {
  const f = config.fetch ?? fetch
  const base = (config.baseUrl ?? 'https://api.openai.com').replace(/\/$/, '')
  const model = config.model ?? 'tts-1'
  return {
    async synth({ voice, text }) {
      const res = await f(`${base}/v1/audio/speech`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${config.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ model, voice, input: text, format: 'mp3' }),
      })
      if (!res.ok) {
        const txt = await res.text().catch(() => '')
        throw new Error(`OpenAI TTS HTTP ${res.status}: ${txt.slice(0, 200)}`)
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
