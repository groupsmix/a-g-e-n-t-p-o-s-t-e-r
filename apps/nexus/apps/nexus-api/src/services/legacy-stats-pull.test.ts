import { describe, it, expect, vi } from 'vitest'
import {
  runLegacyStatsPull,
  pullTikTokStats,
  pullInstagramStats,
  loadRecentPublishedPosts,
  type PublishedPostRow,
} from './legacy-stats-pull'
import type { Env } from '../env'

// ============================================================
// Legacy stats-pull tests (audit §2.2 port of run-pull-stats.ts).
// The invariants that matter:
//  1. No credentials → clean no-op, never a throw (the cron lane ships
//     before the secrets do).
//  2. Platform tokens are individually optional.
//  3. Per-post API failures are swallowed; the run keeps going.
//  4. Supabase writes carry absolute snapshot values (idempotent — safe to
//     parallel-run against the legacy Actions cron).
// ============================================================

const CREDS = { url: 'https://example.supabase.co', serviceRoleKey: 'sk-test' }

function makeEnv(overrides: Record<string, string> = {}): Env {
  return overrides as unknown as Env
}

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response
}

const POSTS: PublishedPostRow[] = [
  { id: 'p1', platform: 'tiktok', platform_post_id: 'tt-1', status: 'published' },
  { id: 'p2', platform: 'instagram_reels', platform_post_id: 'ig-1', status: 'published' },
  { id: 'p3', platform: 'tiktok', platform_post_id: null, status: 'published' },
]

describe('runLegacyStatsPull configuration gating', () => {
  it('no-ops without Supabase credentials and never calls fetch', async () => {
    const fetchSpy = vi.fn()
    const result = await runLegacyStatsPull(makeEnv(), fetchSpy as unknown as typeof fetch)
    expect(result.configured).toBe(false)
    expect(result.checked).toBe(0)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('pulls posts but skips platforms whose tokens are missing', async () => {
    const fetchSpy = vi.fn(async (url: RequestInfo | URL) => {
      const u = String(url)
      if (u.includes('/rest/v1/published_posts?select=')) return jsonResponse(POSTS)
      throw new Error(`unexpected fetch: ${u}`)
    })
    const env = makeEnv({
      SUPABASE_URL: CREDS.url,
      SUPABASE_SERVICE_ROLE_KEY: CREDS.serviceRoleKey,
      // No TIKTOK_ACCESS_TOKEN / INSTAGRAM_ACCESS_TOKEN
    })
    const result = await runLegacyStatsPull(env, fetchSpy as unknown as typeof fetch)
    expect(result.configured).toBe(true)
    expect(result.checked).toBe(3)
    expect(result.tiktokUpdated).toBe(0)
    expect(result.instagramUpdated).toBe(0)
    // Only the Supabase select — no platform API calls
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})

describe('loadRecentPublishedPosts', () => {
  it('queries published posts with status filter and auth headers', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse(POSTS))
    const posts = await loadRecentPublishedPosts(CREDS, fetchSpy as unknown as typeof fetch)
    expect(posts).toHaveLength(3)
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain('/rest/v1/published_posts')
    expect(url).toContain('status=eq.published')
    expect(url).toContain('published_at=gte.')
    expect((init.headers as Record<string, string>).apikey).toBe('sk-test')
  })

  it('throws on a non-OK Supabase response (caught by the cron wrapper)', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse({ message: 'nope' }, false, 401))
    await expect(
      loadRecentPublishedPosts(CREDS, fetchSpy as unknown as typeof fetch),
    ).rejects.toThrow('Supabase select failed: 401')
  })
})

describe('pullTikTokStats', () => {
  it('updates only tiktok posts with a platform_post_id, with snapshot values', async () => {
    const patches: Array<{ url: string; body: Record<string, unknown> }> = []
    const fetchSpy = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url)
      if (u.includes('open.tiktokapis.com')) {
        return jsonResponse({
          data: { videos: [{ view_count: 100, like_count: 10, comment_count: 2, share_count: 1 }] },
        })
      }
      if (init?.method === 'PATCH') {
        patches.push({ url: u, body: JSON.parse(String(init.body)) })
        return jsonResponse(null)
      }
      throw new Error(`unexpected fetch: ${u}`)
    })

    const updated = await pullTikTokStats(CREDS, 'tt-token', POSTS, fetchSpy as unknown as typeof fetch)
    expect(updated).toBe(1) // p3 has no platform_post_id, p2 is instagram
    expect(patches).toHaveLength(1)
    expect(patches[0].url).toContain('id=eq.p1')
    expect(patches[0].body.views).toBe(100)
    expect(patches[0].body.likes).toBe(10)
    expect(patches[0].body.last_stats_updated_at).toBeTruthy()
  })

  it('swallows per-post API failures and continues', async () => {
    const fetchSpy = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).includes('open.tiktokapis.com')) throw new Error('network down')
      return jsonResponse(null)
    })
    const updated = await pullTikTokStats(CREDS, 'tt-token', POSTS, fetchSpy as unknown as typeof fetch)
    expect(updated).toBe(0) // failed, but did not throw
  })

  it('skips posts when the API responds non-OK', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse({}, false, 429))
    const updated = await pullTikTokStats(CREDS, 'tt-token', POSTS, fetchSpy as unknown as typeof fetch)
    expect(updated).toBe(0)
  })
})

describe('pullInstagramStats', () => {
  it('maps insight metrics onto the published_posts columns', async () => {
    const patches: Array<Record<string, unknown>> = []
    const fetchSpy = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url)
      if (u.includes('graph.facebook.com')) {
        return jsonResponse({
          data: [
            { name: 'impressions', values: [{ value: 500 }] },
            { name: 'likes', values: [{ value: 50 }] },
            { name: 'saved', values: [{ value: 5 }] },
          ],
        })
      }
      if (init?.method === 'PATCH') {
        patches.push(JSON.parse(String(init.body)))
        return jsonResponse(null)
      }
      throw new Error(`unexpected fetch: ${u}`)
    })

    const updated = await pullInstagramStats(CREDS, 'ig-token', POSTS, fetchSpy as unknown as typeof fetch)
    expect(updated).toBe(1) // only p2 matches instagram*
    expect(patches[0].views).toBe(500)
    expect(patches[0].likes).toBe(50)
    expect(patches[0].saves).toBe(5)
    expect(patches[0].comments).toBe(0) // missing metric defaults to 0
  })

  it('matches platforms by instagram prefix (reels, stories, …)', async () => {
    const posts: PublishedPostRow[] = [
      { id: 'a', platform: 'instagram', platform_post_id: 'x', status: 'published' },
      { id: 'b', platform: 'instagram_stories', platform_post_id: 'y', status: 'published' },
      { id: 'c', platform: 'youtube', platform_post_id: 'z', status: 'published' },
    ]
    const fetchSpy = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).includes('graph.facebook.com')) return jsonResponse({ data: [] })
      if (init?.method === 'PATCH') return jsonResponse(null)
      throw new Error('unexpected')
    })
    const updated = await pullInstagramStats(CREDS, 'ig-token', posts, fetchSpy as unknown as typeof fetch)
    expect(updated).toBe(2) // a + b, not youtube
  })
})
