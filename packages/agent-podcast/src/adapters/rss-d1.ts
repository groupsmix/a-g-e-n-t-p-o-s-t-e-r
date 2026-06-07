/**
 * RSS publisher backed by a tiny D1 table of episodes + an HTTP
 * endpoint that renders the feed.  We don't write XML here — the
 * dashboard's /api/rss/[show] route is the authoritative renderer.
 * This adapter just inserts the episode row.
 */

import type { RssPublisher, FeedAppendResult } from '../types.js'

export interface RssD1Config {
  d1: {
    prepare: (query: string) => {
      bind: (...args: unknown[]) => {
        run: () => Promise<{ success?: boolean; error?: string }>
      }
    }
  }
  /** Base URL of the dashboard that renders the RSS XML. */
  feedBaseUrl?: string
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `ep_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

export function createRssD1Publisher(config: RssD1Config): RssPublisher {
  return {
    async append({ show, episode }): Promise<FeedAppendResult> {
      const guid = uuid()
      try {
        const r = await config.d1
          .prepare(
            `INSERT INTO podcast_episodes
             (guid, show, title, description, audio_url, duration_sec, artwork_url, episode_number, published_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
          )
          .bind(
            guid,
            show,
            episode.title,
            episode.description,
            episode.audioUrl,
            episode.durationSec,
            episode.artworkUrl ?? null,
            episode.episodeNumber ?? null,
          )
          .run()
        if (r.error) return { ok: false, error: r.error }
        return {
          ok: true,
          guid,
          feedUrl: config.feedBaseUrl
            ? `${config.feedBaseUrl.replace(/\/$/, '')}/${encodeURIComponent(show)}`
            : undefined,
        }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    },
  }
}
