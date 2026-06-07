/**
 * Wire contracts for the analytics aggregator (TASK-702).
 *
 * A "snapshot" is the metrics for one post on one platform at one
 * moment in time. We accumulate snapshots and derive trends by
 * diffing the latest pair per (platform, post_id).
 */

export type Platform =
  | 'x'
  | 'linkedin'
  | 'instagram'
  | 'tiktok'
  | 'youtube'
  | 'newsletter'
  | 'blog'

export interface PostMetrics {
  /** Raw view / impression count. */
  impressions: number
  likes: number
  comments: number
  shares: number
  /** Plays for video; opens for newsletter; reads for blog. */
  plays_or_opens: number
  /** Click-throughs where the platform exposes them; -1 = unknown. */
  clicks: number
}

export interface AnalyticsSnapshot {
  platform: Platform
  post_id: string
  /** ISO timestamp the snapshot was taken (UTC). */
  captured_at: string
  /** ISO timestamp the underlying post was published (UTC). */
  published_at: string | null
  metrics: PostMetrics
  /** Free-form per-platform breadcrumbs (e.g. retweetCount, video_view_time_ms). */
  extra?: Record<string, number | string>
}

/**
 * Any platform adapter must implement this. Adapters may throw on
 * auth failure; the collector swallows per-post errors so one bad
 * platform never tanks the whole run.
 */
export interface AnalyticsAdapter {
  platform: Platform
  fetch(postId: string, publishedAt: string | null): Promise<PostMetrics>
}

export interface PublishedPostRef {
  platform: Platform
  post_id: string
  published_at: string | null
  /** Original publish_jobs idempotency key — preserved for joins. */
  job_id: string
}

export interface SnapshotStore {
  /** Insert a snapshot. Implementations dedupe by (platform, post_id, captured_at). */
  insert(s: AnalyticsSnapshot): Promise<void>
  /**
   * Latest two snapshots for a post in chronological order.
   * Used by the analyser to compute deltas.
   */
  latestPair(platform: Platform, postId: string): Promise<AnalyticsSnapshot[]>
  /** All snapshots for a platform within a captured-at window. */
  rangeByPlatform(
    platform: Platform,
    sinceIso: string,
  ): Promise<AnalyticsSnapshot[]>
}

export type TrendKind = 'rising' | 'falling' | 'flat' | 'new'

export interface PostTrend {
  platform: Platform
  post_id: string
  kind: TrendKind
  /** Percent change in impressions between the latest pair (null if no prior). */
  impressions_delta_pct: number | null
  /** Engagement rate this snapshot ((likes + comments + shares) / impressions). */
  engagement_rate: number
  latest: AnalyticsSnapshot
}

export interface PlatformRollup {
  platform: Platform
  posts: number
  total_impressions: number
  total_likes: number
  total_comments: number
  total_shares: number
  avg_engagement_rate: number
  top_post: PostTrend | null
}

export interface AnalyticsReport {
  generated_at: string
  window_days: number
  by_platform: PlatformRollup[]
  trends: PostTrend[]
}

export interface CollectorConfig {
  /** How many days back to scan publish_jobs.done for posts to refresh. */
  windowDays?: number
  /** Cap total work per run. */
  maxPostsPerRun?: number
  /** Per-post fetch timeout. */
  fetchTimeoutMs?: number
}
