/**
 * Stage 2 — synthesise each segment via the injected TTS client.
 *
 * Failure mode: a per-segment TTS failure inserts a silence-padded
 * placeholder so the episode still assembles end-to-end (the worker
 * can flag and retry).
 */

import type { ScriptSegment, SynthesisedSegment, TtsClient } from '../types.js'

function silence(durationSec: number): SynthesisedSegment['audioBase64'] {
  // Placeholder marker — real renderer should sub in actual silence.
  return `silence:${durationSec.toFixed(2)}`
}

function approxDuration(text: string): number {
  // ~150 words/min = ~2.5 wps
  const words = text.split(/\s+/).filter(Boolean).length
  return Math.max(1, +(words / 2.5).toFixed(2))
}

export async function synthSegments(
  segments: ScriptSegment[],
  voices: Record<string, string>,
  tts?: TtsClient,
): Promise<SynthesisedSegment[]> {
  const out: SynthesisedSegment[] = []
  for (const s of segments) {
    const voiceId = voices[s.voice] ?? voices.default ?? voices.host ?? 'default'
    if (!tts) {
      out.push({
        ...s,
        audioBase64: silence(approxDuration(s.text)),
        durationSec: approxDuration(s.text),
        mime: 'audio/mpeg',
      })
      continue
    }
    try {
      const r = await tts.synth({ voice: voiceId, text: s.text })
      out.push({ ...s, ...r })
    } catch {
      out.push({
        ...s,
        audioBase64: silence(approxDuration(s.text)),
        durationSec: approxDuration(s.text),
        mime: 'audio/mpeg',
      })
    }
  }
  return out
}
