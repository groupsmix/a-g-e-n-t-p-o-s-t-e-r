/**
 * Top-level orchestrator: segment → synth → assemble → upload → RSS.
 */

import type {
  AudioUploader,
  PodcastBrief,
  PodcastReport,
  RssPublisher,
  TtsClient,
} from '../types.js'
import { segmentScript } from './segmenter.js'
import { synthSegments } from './synth.js'
import { assembleEpisode, type AssemblerOptions } from './assembler.js'

export interface PodcastDeps {
  tts?: TtsClient
  uploader?: AudioUploader
  rss?: RssPublisher
  assembler?: AssemblerOptions
}

const DEFAULT_VOICES = { host: 'alloy', guest: 'verse', default: 'alloy' }

export async function runPodcast(
  brief: PodcastBrief,
  deps: PodcastDeps = {},
): Promise<PodcastReport> {
  const segs = segmentScript(brief.script)
  const synth = await synthSegments(segs, brief.voices ?? DEFAULT_VOICES, deps.tts)
  const episode = await assembleEpisode(brief, synth, deps.assembler ?? {})

  let upload
  if (deps.uploader) {
    try {
      upload = await deps.uploader.upload({
        title: brief.title,
        audioBase64: episode.finalAudioBase64,
        mime: episode.finalMime,
      })
    } catch (err) {
      upload = { ok: false, provider: 'unknown', error: err instanceof Error ? err.message : String(err) }
    }
  }

  let feed
  if (upload?.ok && deps.rss) {
    try {
      feed = await deps.rss.append({
        show: brief.show,
        episode: {
          title: brief.title,
          description: brief.description ?? '',
          audioUrl: upload.url ?? '',
          durationSec: episode.totalDurationSec,
          artworkUrl: brief.artworkUrl,
          episodeNumber: brief.episodeNumber,
        },
      })
    } catch (err) {
      feed = { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  return { brief, episode, upload, feed }
}
