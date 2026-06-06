/**
 * YouTube adapter — Data API v3.
 *
 *   GET https://www.googleapis.com/youtube/v3/search?part=snippet
 *     &q={term}&type=video&order=date&publishedAfter={iso}&key={apiKey}
 *
 * Optionally enriches with `videos.list?part=statistics` so the
 * engagement signals (views, likes, comments) feed the virality score.
 *
 * The stats call is gated by `withStats: true` because it costs an
 * extra API quota point per video — the cron loop turns it off when
 * scanning gets noisy.
 */

import type { Mention, MentionSource } from '../types.js'

export interface YouTubeAdapterOptions {
  apiKey: string
  baseUrl?: string
  withStats?: boolean
  fetch?: typeof fetch
}

export function createYouTubeSource(opts: YouTubeAdapterOptions): MentionSource {
  const baseUrl = opts.baseUrl ?? 'https://www.googleapis.com/youtube/v3'
  const f = opts.fetch ?? globalThis.fetch
  const withStats = opts.withStats ?? true

  return {
    name: 'youtube',
    platform: 'youtube',
    async scan(input) {
      const fromIso = new Date(
        Date.now() - (input.sinceHours ?? 24) * 3600 * 1000,
      ).toISOString()
      const limit = input.maxResults ?? 25
      const all: Mention[] = []

      for (const term of input.terms) {
        const url =
          `${baseUrl}/search?part=snippet&type=video&order=date` +
          `&q=${encodeURIComponent(term)}` +
          `&publishedAfter=${encodeURIComponent(fromIso)}` +
          `&maxResults=${limit}&key=${opts.apiKey}`

        try {
          const res = await f(url, { signal: input.signal })
          if (!res.ok) continue
          const json = (await res.json()) as YTSearch
          const items = json.items ?? []
          if (!items.length) continue

          const ids = items.map((i) => i.id?.videoId).filter(Boolean) as string[]
          const stats = withStats && ids.length
            ? await fetchStats(f, baseUrl, opts.apiKey, ids, input.signal)
            : {}

          for (const item of items) {
            const vid = item.id?.videoId
            if (!vid) continue
            const s = item.snippet
            const stat = stats[vid] ?? {}
            all.push({
              id: vid,
              platform: 'youtube',
              url: `https://www.youtube.com/watch?v=${vid}`,
              title: s?.title ?? '(no title)',
              text: s?.description ?? '',
              author: s?.channelTitle,
              publishedAt: s?.publishedAt,
              engagement: {
                views: stat.viewCount,
                upvotes: stat.likeCount,
                comments: stat.commentCount,
              },
              matchedTerm: term,
            })
          }
        } catch {
          // skip
        }
      }
      return all
    },
  }
}

async function fetchStats(
  f: typeof fetch,
  baseUrl: string,
  apiKey: string,
  ids: string[],
  signal?: AbortSignal,
): Promise<Record<string, { viewCount?: number; likeCount?: number; commentCount?: number }>> {
  const url =
    `${baseUrl}/videos?part=statistics&id=${ids.join(',')}&key=${apiKey}`
  const res = await f(url, { signal })
  if (!res.ok) return {}
  const json = (await res.json()) as YTStats
  const out: Record<string, { viewCount?: number; likeCount?: number; commentCount?: number }> = {}
  for (const v of json.items ?? []) {
    if (!v.id) continue
    out[v.id] = {
      viewCount: numOrUndef(v.statistics?.viewCount),
      likeCount: numOrUndef(v.statistics?.likeCount),
      commentCount: numOrUndef(v.statistics?.commentCount),
    }
  }
  return out
}

function numOrUndef(v: string | number | undefined): number | undefined {
  if (v == null) return undefined
  const n = typeof v === 'string' ? Number.parseInt(v, 10) : v
  return Number.isFinite(n) ? n : undefined
}

interface YTSearch {
  items?: Array<{
    id?: { videoId?: string }
    snippet?: {
      title?: string
      description?: string
      channelTitle?: string
      publishedAt?: string
    }
  }>
}

interface YTStats {
  items?: Array<{
    id?: string
    statistics?: {
      viewCount?: string
      likeCount?: string
      commentCount?: string
    }
  }>
}
