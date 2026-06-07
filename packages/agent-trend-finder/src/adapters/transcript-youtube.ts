/**
 * YouTube transcript adapter — best-effort, uses the timedtext endpoint
 * which is what yt-dlp wraps under the hood. Public, no auth, often
 * works for English captions; returns empty string when caption track
 * is missing or auth-gated.
 *
 * For higher reliability, swap in `yt-dlp --write-auto-subs` via a
 * worker shell — same TranscriptSource interface.
 */

import type { TranscriptSource } from '../types.js'

export interface YouTubeTranscriptOptions {
  language?: string
  fetch?: typeof fetch
}

export function createYouTubeTranscriptSource(
  opts: YouTubeTranscriptOptions = {},
): TranscriptSource {
  const f = opts.fetch ?? globalThis.fetch
  const lang = opts.language ?? 'en'
  return {
    name: 'youtube-timedtext',
    async fetchTranscript(input) {
      const url =
        `https://www.youtube.com/api/timedtext?v=${input.videoId}` +
        `&lang=${lang}&fmt=json3`
      try {
        const res = await f(url, { signal: input.signal })
        if (!res.ok) return ''
        const text = await res.text()
        if (!text) return ''
        try {
          const json = JSON.parse(text) as TimedJson3
          const events = json.events ?? []
          return events
            .map((e) =>
              (e.segs ?? [])
                .map((s) => s.utf8 ?? '')
                .join(''),
            )
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim()
        } catch {
          return ''
        }
      } catch {
        return ''
      }
    },
  }
}

interface TimedJson3 {
  events?: Array<{
    segs?: Array<{ utf8?: string }>
  }>
}
