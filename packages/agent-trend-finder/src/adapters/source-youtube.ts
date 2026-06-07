/**
 * YouTube TrendSource — Data API v3.
 *
 * For each niche we do:
 *   GET /search?part=snippet&type=video&order=viewCount
 *       &q={niche}&publishedAfter={iso}&regionCode={region}
 *   GET /videos?part=statistics,contentDetails&id={ids}
 *
 * Returns Video[] with full engagement + duration so the velocity and
 * gap-finder stages have everything they need.
 */

import type { TrendSource, Video } from '../types.js'

export interface YouTubeTrendOptions {
  apiKey: string
  baseUrl?: string
  fetch?: typeof fetch
}

export function createYouTubeTrendSource(opts: YouTubeTrendOptions): TrendSource {
  const baseUrl = opts.baseUrl ?? 'https://www.googleapis.com/youtube/v3'
  const f = opts.fetch ?? globalThis.fetch
  return {
    name: 'youtube',
    async fetchTrending(input) {
      const params = new URLSearchParams({
        part: 'snippet',
        type: 'video',
        order: 'viewCount',
        q: input.niche,
        regionCode: input.region ?? 'US',
        maxResults: String(input.maxResults ?? 50),
        key: opts.apiKey,
      })
      if (input.publishedAfter) params.set('publishedAfter', input.publishedAfter)

      let videos: Video[] = []
      try {
        const res = await f(`${baseUrl}/search?${params.toString()}`, {
          signal: input.signal,
        })
        if (!res.ok) return []
        const json = (await res.json()) as YTSearch
        const items = json.items ?? []
        videos = items
          .map((i): Video | undefined => {
            const vid = i.id?.videoId
            if (!vid) return undefined
            const s = i.snippet
            return {
              id: vid,
              url: `https://www.youtube.com/watch?v=${vid}`,
              title: s?.title ?? '(no title)',
              description: s?.description ?? '',
              channelId: s?.channelId,
              channelTitle: s?.channelTitle,
              publishedAt: s?.publishedAt,
              thumbnailUrl: s?.thumbnails?.high?.url ?? s?.thumbnails?.default?.url,
              niche: input.niche,
            }
          })
          .filter((v): v is Video => !!v)
      } catch {
        return []
      }

      if (!videos.length) return videos

      // Enrich with stats
      try {
        const ids = videos.map((v) => v.id).join(',')
        const statsRes = await f(
          `${baseUrl}/videos?part=statistics,contentDetails&id=${ids}&key=${opts.apiKey}`,
          { signal: input.signal },
        )
        if (statsRes.ok) {
          const sj = (await statsRes.json()) as YTStats
          const map = new Map<string, YTStats['items'][number] | undefined>()
          for (const v of sj.items ?? []) {
            if (v.id) map.set(v.id, v)
          }
          videos = videos.map((v) => {
            const x = map.get(v.id)
            if (!x) return v
            return {
              ...v,
              views: numOrUndef(x.statistics?.viewCount),
              likes: numOrUndef(x.statistics?.likeCount),
              comments: numOrUndef(x.statistics?.commentCount),
              durationSec: parseDuration(x.contentDetails?.duration),
            }
          })
        }
      } catch {
        // keep base videos
      }

      return videos
    },
  }
}

function numOrUndef(v: string | undefined): number | undefined {
  if (v == null) return undefined
  const n = Number.parseInt(v, 10)
  return Number.isFinite(n) ? n : undefined
}

/** Parse ISO 8601 duration (PT#H#M#S) into seconds. */
function parseDuration(iso: string | undefined): number | undefined {
  if (!iso) return undefined
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  if (!m) return undefined
  const h = Number(m[1] ?? 0)
  const min = Number(m[2] ?? 0)
  const s = Number(m[3] ?? 0)
  return h * 3600 + min * 60 + s
}

interface YTSearch {
  items?: Array<{
    id?: { videoId?: string }
    snippet?: {
      title?: string
      description?: string
      channelId?: string
      channelTitle?: string
      publishedAt?: string
      thumbnails?: {
        default?: { url?: string }
        high?: { url?: string }
      }
    }
  }>
}

interface YTStats {
  items: Array<{
    id?: string
    statistics?: {
      viewCount?: string
      likeCount?: string
      commentCount?: string
    }
    contentDetails?: {
      duration?: string
    }
  }>
}
