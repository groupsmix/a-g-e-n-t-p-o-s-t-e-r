/**
 * Whisper STT — hits the OpenAI audio.transcriptions endpoint. Works
 * with WAV / MP3 / M4A / WEBM.
 */

import type { AudioBlob, SpeechToText, Transcript } from '../types'

export interface WhisperConfig {
  apiKey: string
  model?: string
  baseUrl?: string
}

export class WhisperSTT implements SpeechToText {
  constructor(private cfg: WhisperConfig, private fetcher: typeof fetch = fetch) {}
  async transcribe(blob: AudioBlob): Promise<Transcript> {
    const base = (this.cfg.baseUrl ?? 'https://api.openai.com').replace(/\/$/, '')
    const form = new FormData()
    form.append('model', this.cfg.model ?? 'whisper-1')
    form.append('response_format', 'verbose_json')
    form.append('file', new Blob([new Uint8Array(blob.bytes)], { type: blob.mime }), 'audio')
    const res = await this.fetcher(`${base}/v1/audio/transcriptions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.cfg.apiKey}` },
      body: form,
    })
    if (!res.ok) throw new Error(`whisper ${res.status}`)
    const json = (await res.json()) as { text: string; language?: string; duration?: number }
    return { text: json.text, language: json.language, duration_seconds: json.duration }
  }
}
