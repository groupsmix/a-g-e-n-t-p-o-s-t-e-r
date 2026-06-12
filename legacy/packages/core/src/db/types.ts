/**
 * Audit #42: These types SHOULD be generated via:
 *   npx supabase gen types typescript --project-id YOUR_PROJECT_ID > packages/core/src/db/types.ts
 *
 * Until the CI step for auto-generation is wired up, they are maintained
 * manually. When the Supabase schema changes, re-run the command above and
 * commit the diff.
 */

export type ContentQueueStatus =
  | "pending"
  | "generating"
  | "ready"
  | "publishing"
  | "published"
  | "failed";

export interface ContentQueueRow {
  id: string;
  type: string;
  status: ContentQueueStatus;
  niche: string;
  topic: string;
  keywords: string[];
  platform_targets: string[];
  source_url: string | null;
  metadata: Record<string, unknown>;
  error: string | null;
  retry_count: number;
  created_at: string;
  scheduled_at: string | null;
  published_at: string | null;
  // Migration 001 (T-38): idempotency + lock columns.
  run_id: string | null;
  batch_id: string | null;
  claim_token: string | null;
  claimed_at: string | null;
  attempt_count: number;
  last_error: string | null;
  next_retry_at: string | null;
  idempotency_key: string | null;
}

export type PublishedPostStatus = "published" | "failed";
export type PublishedPostPlatform =
  | "tiktok"
  | "instagram_feed"
  | "instagram_reels"
  | "instagram_story"
  | "youtube_shorts"
  | "youtube"
  | "twitter"
  | "linkedin"
  | "pinterest"
  | "threads";

export interface PublishedPostRow {
  id: string;
  content_queue_id: string | null;
  platform: PublishedPostPlatform;
  platform_post_id: string | null;
  platform_url: string | null;
  caption: string | null;
  hashtags: string[];
  status: PublishedPostStatus | null;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  click_throughs: number;
  metadata: Record<string, unknown>;
  published_at: string;
  last_stats_updated_at: string | null;
}

export type SiteStatus = "building" | "live" | "paused" | "archived";
export type AffiliateProgram = "amazon" | "impact" | "shareasale" | "gumroad" | "custom";

export interface SiteRow {
  id: string;
  niche: string;
  domain: string | null;
  vercel_project_id: string | null;
  cosmic_bucket_slug: string | null;
  status: SiteStatus;
  affiliate_program: AffiliateProgram | null;
  affiliate_tag: string | null;
  monthly_views: number;
  monthly_revenue_cents: number;
  created_at: string;
  deployed_at: string | null;
}

export interface RevenueEventRow {
  id: string;
  source: "amazon" | "adsense" | "gumroad" | "impact" | "shareasale" | "direct";
  site_id: string | null;
  published_post_id: string | null;
  amount_cents: number;
  currency: string;
  description: string | null;
  event_date: string;
  created_at: string;
}
