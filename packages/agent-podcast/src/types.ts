/**
 * Podcast Agent types (TASK-603).
 *
 * Pipeline:
 *   parseScript → segmentByVoice → synthSegments (TTS)
 *   → assembleEpisode (timeline + chapter marks)
 *   → uploadAudio + appendToRssFeed
 *
 * Multi-voice via simple [Host]/[Guest] tags or single-voice plain text.
 */

export interface PodcastBrief {
  /** Show name e.g. "PosterAgent Daily". */
  show: string
  /** Episode title. */
  title: string
  /** Optional episode number. */
  episodeNumber?: number
  /** Long-form script. Lines like "[Host]: ..." mark voices. */
  script: string
  /** Voices keyed by tag name; default 'host'. */
  voices?: Record<string, string>
  /** Show description (used for RSS). */
  description?: string
  /** Episode artwork URL. */
  artworkUrl?: string
}

export interface ScriptSegment {
  voice: string
  text: string
}

export interface SynthesisedSegment extends ScriptSegment {
  /** TTS output as base64-encoded mp3 (or wav). */
  audioBase64: string
  durationSec: number
  mime: string
}

export interface PodcastEpisode {
  brief: PodcastBrief
  segments: SynthesisedSegment[]
  /** Concatenated final audio for upload. */
  finalAudioBase64: string
  finalMime: string
  totalDurationSec: number
  chapters: Array<{ start: number; title: string }>
}

export interface UploadResult {
  ok: boolean
  url?: string
  id?: string
  provider: string
  error?: string
}

export interface FeedAppendResult {
  ok: boolean
  feedUrl?: string
  guid?: string
  error?: string
}

export interface PodcastReport {
  brief: PodcastBrief
  episode: PodcastEpisode
  upload?: UploadResult
  feed?: FeedAppendResult
}

// ── Clients ─────────────────────────────────────────────────────────────────

export interface TtsClient {
  synth(args: { voice: string; text: string }): Promise<{
    audioBase64: string
    durationSec: number
    mime: string
  }>
}

export interface AudioUploader {
  upload(args: {
    title: string
    audioBase64: string
    mime: string
  }): Promise<UploadResult>
}

export interface RssPublisher {
  append(args: {
    show: string
    episode: {
      title: string
      description: string
      audioUrl: string
      durationSec: number
      artworkUrl?: string
      episodeNumber?: number
    }
  }): Promise<FeedAppendResult>
}
