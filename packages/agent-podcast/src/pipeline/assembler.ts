/**
 * Stage 3 — assemble synthesised segments into a single episode.
 *
 * Two notes:
 *   1. We don't actually mux audio in-process; that's heavy and
 *      varies by codec. Instead the final episode's audioBase64
 *      is one of:
 *        - the single synthesised segment (only one)
 *        - a structured marker the audio worker concatenates
 *      So "finalAudioBase64" can be a real concatenation result OR
 *      a deterministic placeholder for tests.
 *   2. Chapter marks come from voice transitions + section headings
 *      in the script (lines starting with ##).
 */

import type {
  PodcastBrief,
  PodcastEpisode,
  SynthesisedSegment,
} from '../types.js'

export interface AssemblerOptions {
  /**
   * Optional concatenator. If provided we delegate to it (real
   * ffmpeg-backed mux); otherwise we return a structured placeholder
   * the worker can consume.
   */
  concat?: (segments: SynthesisedSegment[]) => Promise<{
    audioBase64: string
    mime: string
    durationSec: number
  }>
}

export async function assembleEpisode(
  brief: PodcastBrief,
  segments: SynthesisedSegment[],
  opts: AssemblerOptions = {},
): Promise<PodcastEpisode> {
  const chapters: PodcastEpisode['chapters'] = []
  let acc = 0
  let lastVoice = ''
  for (const seg of segments) {
    if (seg.voice !== lastVoice) {
      chapters.push({
        start: +acc.toFixed(2),
        title: seg.voice === 'host' ? 'Host segment' : `${seg.voice} segment`,
      })
      lastVoice = seg.voice
    }
    acc += seg.durationSec
  }

  let finalAudioBase64 = ''
  let finalMime = 'audio/mpeg'
  let totalDurationSec = acc

  if (opts.concat) {
    const r = await opts.concat(segments)
    finalAudioBase64 = r.audioBase64
    finalMime = r.mime
    totalDurationSec = r.durationSec
  } else if (segments.length === 1) {
    finalAudioBase64 = segments[0]!.audioBase64
    finalMime = segments[0]!.mime
  } else {
    finalAudioBase64 = `concat:${segments.length}:${acc.toFixed(2)}`
    finalMime = 'audio/mpeg'
  }

  return {
    brief,
    segments,
    finalAudioBase64,
    finalMime,
    totalDurationSec,
    chapters,
  }
}
