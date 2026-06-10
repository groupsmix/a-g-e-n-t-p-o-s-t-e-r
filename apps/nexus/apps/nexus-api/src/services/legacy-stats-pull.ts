import { createLogger } from '@posteragent/logger/workers'
import type { Env } from '../env'
import { getSecret } from './publishers'

// ============================================================
// Legacy stats-pull — Workers port of apps/runner/src/run-pull-stats.ts
// (audit §2.2, weeks 3–4 item 11).
//
// The legacy GitHub Actions cron (stats-pull.yml, every 6h) pulls TikTok and
// Instagram engagement numbers for posts published by the LEGACY pipeline
// and writes them to Supabase `published_posts`. The NEXUS analytics
// collector (TASK-702) only covers posts published through NEXUS's own
// publish_jobs in D1 — so this job is ported 1:1, not absorbed.
//
// Differences from the legacy runner, on purpose:
//  - Talks to Supabase via PostgREST over fetch (no supabase-js — keeps the
//    Worker dependency-free and bundle-small).
//  - Caps posts per run (MAX_POSTS_PER_RUN) to stay well inside the Workers
//    subrequest budget. The 7-day window means real volume is far below it.
//  - Fail-soft per post (same as legacy), fail-soft per platform, and a
//    clean no-op when credentials are not configured — so the cron lane is
//    safe to ship before the secrets are set.
//
// Parallel-run: updates are idempotent snapshots (absolute counts, not
// increments), so this running alongside the legacy Actions cron is safe —
// last writer wins with the same data. After one clean week, delete
// stats-pull.yml and the legacy runner (see
// docs/runbooks/legacy-cron-retirement.md).
// ============================================================

const logger = createLogger({ service: 'nexus-api', module: 'legacy-stats-pull' })

const WINDOW_DAYS = 7
const MAX_POSTS_PER_RUN = 100

export interface PublishedPostRow {
  id: string
  platform: string
  platform_post_id: string | null
  status: string | null
}

export interface LegacyStatsPullResult {
  configured: boolean
  checked: number
  tiktokUpdated: number
  instagramUpdated: number
}

interface SupabaseCreds {
  url: string
  serviceRoleKey: string
}

// ── Supabase via PostgREST ──────────────────────────────────

function supabaseHeaders(creds: SupabaseCreds): Record<string, string> {
  return {
    apikey: creds.serviceRoleKey,
    Authorization: `Bearer ${creds.serviceRoleKey}`,
    'Content-Type': 'application/json',
  }
}

export async function loadRecentPublishedPosts(
  creds: SupabaseCreds,
  fetchFn: typeof fetch = fetch,
): Promise<PublishedPostRow[]> {
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const url =
    `${creds.url}/rest/v1/published_posts` +
    `?select=id,platform,platform_post_id,status` +
    `&published_at=gte.${encodeURIComponent(since)}` +
    `&status=eq.published` +
    `&limit=${MAX_POSTS_PER_RUN}`
  const res = await fetchFn(url, { headers: supabaseHeaders(creds) })
  if (!res.ok) {
    throw new Error(`Supabase select failed: ${res.status} ${await res.text()}`)
  }
  return (await res.json()) as PublishedPostRow[]
}

async function updatePostStats(
  creds: SupabaseCreds,
  postId: string,
  patch: Record<string, number | string>,
  fetchFn: typeof fetch,
): Promise<boolean> {
  const res = await fetchFn(
    `${creds.url}/rest/v1/published_posts?id=eq.${encodeURIComponent(postId)}`,
    {
      method: 'PATCH',
      headers: { ...supabaseHeaders(creds), Prefer: 'return=minimal' },
      body: JSON.stringify(patch),
    },
  )
  return res.ok
}

// ── TikTok ──────────────────────────────────────────────────

export async function pullTikTokStats(
  creds: SupabaseCreds,
  accessToken: string,
  posts: PublishedPostRow[],
  fetchFn: typeof fetch = fetch,
): Promise<number> {
  const tiktokPosts = posts.filter((p) => p.platform === 'tiktok' && p.platform_post_id)
  let updated = 0

  for (const post of tiktokPosts) {
    try {
      const res = await fetchFn('https://open.tiktokapis.com/v2/video/query/', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filters: { video_ids: [post.platform_post_id] },
          fields: ['view_count', 'like_count', 'comment_count', 'share_count'],
        }),
      })
      if (!res.ok) continue

      const data = (await res.json()) as {
        data?: {
          videos?: Array<{
            view_count?: number
            like_count?: number
            comment_count?: number
            share_count?: number
          }>
        }
      }
      const video = data?.data?.videos?.[0]
      if (!video) continue

      const ok = await updatePostStats(
        creds,
        post.id,
        {
          views: video.view_count ?? 0,
          likes: video.like_count ?? 0,
          comments: video.comment_count ?? 0,
          shares: video.share_count ?? 0,
          last_stats_updated_at: new Date().toISOString(),
        },
        fetchFn,
      )
      if (ok) updated += 1
    } catch (err) {
      logger.warn('TikTok stats pull failed for post', {
        postId: post.id,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return updated
}

// ── Instagram ───────────────────────────────────────────────

export async function pullInstagramStats(
  creds: SupabaseCreds,
  accessToken: string,
  posts: PublishedPostRow[],
  fetchFn: typeof fetch = fetch,
): Promise<number> {
  const igPosts = posts.filter(
    (p) => p.platform.startsWith('instagram') && p.platform_post_id,
  )
  let updated = 0

  for (const post of igPosts) {
    try {
      const res = await fetchFn(
        `https://graph.facebook.com/v19.0/${post.platform_post_id}/insights` +
          `?metric=impressions,reach,likes,comments,shares,saved` +
          `&access_token=${encodeURIComponent(accessToken)}`,
      )
      if (!res.ok) continue

      const data = (await res.json()) as {
        data?: Array<{ name: string; values?: Array<{ value?: number }> }>
      }
      const metrics: Record<string, number> = {}
      for (const m of data?.data ?? []) {
        metrics[m.name] = m.values?.[0]?.value ?? 0
      }

      const ok = await updatePostStats(
        creds,
        post.id,
        {
          views: metrics.impressions ?? 0,
          likes: metrics.likes ?? 0,
          comments: metrics.comments ?? 0,
          shares: metrics.shares ?? 0,
          saves: metrics.saved ?? 0,
          last_stats_updated_at: new Date().toISOString(),
        },
        fetchFn,
      )
      if (ok) updated += 1
    } catch (err) {
      logger.warn('Instagram stats pull failed for post', {
        postId: post.id,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return updated
}

// ── Entry point (cron + manual trigger) ─────────────────────

export async function runLegacyStatsPull(
  env: Env,
  fetchFn: typeof fetch = fetch,
): Promise<LegacyStatsPullResult> {
  const [supabaseUrl, serviceRoleKey, tiktokToken, instagramToken] = await Promise.all([
    getSecret(env, 'SUPABASE_URL'),
    getSecret(env, 'SUPABASE_SERVICE_ROLE_KEY'),
    getSecret(env, 'TIKTOK_ACCESS_TOKEN'),
    getSecret(env, 'INSTAGRAM_ACCESS_TOKEN'),
  ])

  if (!supabaseUrl || !serviceRoleKey) {
    // Not an error: the cron lane ships before the secrets do. Once
    // SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are set via
    // `wrangler secret put`, the next tick starts pulling for real.
    logger.info('Legacy stats pull skipped — Supabase credentials not configured')
    return { configured: false, checked: 0, tiktokUpdated: 0, instagramUpdated: 0 }
  }

  const creds: SupabaseCreds = { url: supabaseUrl.replace(/\/$/, ''), serviceRoleKey }
  const posts = await loadRecentPublishedPosts(creds, fetchFn)
  if (posts.length === 0) {
    logger.info('Legacy stats pull: no recent posts to update')
    return { configured: true, checked: 0, tiktokUpdated: 0, instagramUpdated: 0 }
  }

  const [tiktokUpdated, instagramUpdated] = await Promise.all([
    tiktokToken
      ? pullTikTokStats(creds, tiktokToken, posts, fetchFn)
      : Promise.resolve(0),
    instagramToken
      ? pullInstagramStats(creds, instagramToken, posts, fetchFn)
      : Promise.resolve(0),
  ])

  logger.info('Legacy stats pull complete', {
    checked: posts.length,
    tiktokUpdated,
    instagramUpdated,
    tiktokConfigured: Boolean(tiktokToken),
    instagramConfigured: Boolean(instagramToken),
  })

  return { configured: true, checked: posts.length, tiktokUpdated, instagramUpdated }
}
