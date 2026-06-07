/**
 * Analyser — derives trends and per-platform rollups from snapshot
 * history. Pure functions; no I/O beyond the SnapshotStore reads.
 *
 * Trend rules per post:
 *   rising  : impressions Δ% > +20% between latest two snapshots
 *   falling : impressions Δ% < -20%
 *   flat    : everything else with a prior snapshot
 *   new     : only one snapshot in history
 *
 * Engagement rate is (likes + comments + shares) / impressions, capped
 * at 0 when impressions is 0 (avoid NaN).
 */

import type {
  AnalyticsReport,
  Platform,
  PlatformRollup,
  PostTrend,
  SnapshotStore,
  AnalyticsSnapshot,
} from '../types'

const PLATFORMS: Platform[] = [
  'x',
  'linkedin',
  'instagram',
  'tiktok',
  'youtube',
  'newsletter',
  'blog',
]

const RISE_THRESHOLD = 20
const FALL_THRESHOLD = -20

export function engagementRate(s: AnalyticsSnapshot): number {
  const { impressions, likes, comments, shares } = s.metrics
  if (impressions <= 0) return 0
  return (likes + comments + shares) / impressions
}

export function classifyTrend(pair: AnalyticsSnapshot[]): PostTrend {
  // pair sorted ascending; latest is pair.at(-1)
  const latest = pair[pair.length - 1]!
  const prior = pair.length > 1 ? pair[pair.length - 2]! : null
  let kind: PostTrend['kind'] = 'new'
  let deltaPct: number | null = null
  if (prior) {
    const a = prior.metrics.impressions
    const b = latest.metrics.impressions
    deltaPct = a === 0 ? (b > 0 ? 100 : 0) : ((b - a) / a) * 100
    if (deltaPct > RISE_THRESHOLD) kind = 'rising'
    else if (deltaPct < FALL_THRESHOLD) kind = 'falling'
    else kind = 'flat'
  }
  return {
    platform: latest.platform,
    post_id: latest.post_id,
    kind,
    impressions_delta_pct: deltaPct,
    engagement_rate: engagementRate(latest),
    latest,
  }
}

export async function buildReport(
  store: SnapshotStore,
  opts?: { windowDays?: number; now?: () => Date },
): Promise<AnalyticsReport> {
  const windowDays = opts?.windowDays ?? 7
  const now = opts?.now?.() ?? new Date()
  const since = new Date(now.getTime() - windowDays * 86_400_000).toISOString()

  const by_platform: PlatformRollup[] = []
  const trends: PostTrend[] = []

  for (const platform of PLATFORMS) {
    const snaps = await store.rangeByPlatform(platform, since)
    if (snaps.length === 0) {
      by_platform.push({
        platform,
        posts: 0,
        total_impressions: 0,
        total_likes: 0,
        total_comments: 0,
        total_shares: 0,
        avg_engagement_rate: 0,
        top_post: null,
      })
      continue
    }
    // Keep only the latest snapshot per post for totals (don't double-count
    // across daily snapshots — counts are cumulative on most platforms).
    const latestByPost = new Map<string, AnalyticsSnapshot>()
    for (const s of snaps) {
      const prev = latestByPost.get(s.post_id)
      if (!prev || s.captured_at > prev.captured_at) latestByPost.set(s.post_id, s)
    }
    let imp = 0
    let likes = 0
    let comments = 0
    let shares = 0
    let erSum = 0
    const postTrends: PostTrend[] = []
    for (const post_id of latestByPost.keys()) {
      const pair = await store.latestPair(platform, post_id)
      const t = classifyTrend(pair)
      postTrends.push(t)
      imp += t.latest.metrics.impressions
      likes += t.latest.metrics.likes
      comments += t.latest.metrics.comments
      shares += t.latest.metrics.shares
      erSum += t.engagement_rate
    }
    postTrends.sort((a, b) => b.latest.metrics.impressions - a.latest.metrics.impressions)
    trends.push(...postTrends)
    by_platform.push({
      platform,
      posts: latestByPost.size,
      total_impressions: imp,
      total_likes: likes,
      total_comments: comments,
      total_shares: shares,
      avg_engagement_rate: latestByPost.size === 0 ? 0 : erSum / latestByPost.size,
      top_post: postTrends[0] ?? null,
    })
  }

  trends.sort((a, b) => b.latest.metrics.impressions - a.latest.metrics.impressions)

  return {
    generated_at: now.toISOString(),
    window_days: windowDays,
    by_platform,
    trends: trends.slice(0, 100),
  }
}
