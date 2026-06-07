/**
 * ElevenLabs TTS — text → audio/mpeg bytes.
 */

import type { AudioBlob, TextToSpeech } from '../types'

export interface ElevenLabsConfig {
  apiKey: string
  baseUrl?: string
  /** Default voice id used when synthesise() is called without one. */
  defaultVoiceId?: string
  /** Model id, eleven_turbo_v2_5 is the current low-latency default. */
  model?: string
}

export class ElevenLabsTTS implements TextToSpeech {
  constructor(private cfg: ElevenLabsConfig, private fetcher: typeof fetch = fetch) {}
  async synthesise(text: string, opts?: { voice_id?: string }): Promise<AudioBlob> {
    const base = (this.cfg.baseUrl ?? 'https://api.elevenlabs.io').replace(/\/$/, '')
    const voiceId = opts?.voice_id ?? this.cfg.defaultVoiceId
    if (!voiceId) throw new Error('elevenlabs: voice_id required')
    const res = await this.fetcher(`${base}/v1/text-to-speech/${encodeURIComponent(voiceId)}`, {
      method: 'POST',
      headers: {
        'xi-api-key': this.cfg.apiKey,
        'content-type': 'application/json',
        accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: this.cfg.model ?? 'eleven_turbo_v2_5',
        voice_settings: { stability: 0.5, similarity_boost: 0.7 },
      }),
    })
    if (!res.ok) throw new Error(`elevenlabs ${res.status}`)
    const buf = new Uint8Array(await res.arrayBuffer())
    return { bytes: buf, mime: 'audio/mpeg' }
  }
}
