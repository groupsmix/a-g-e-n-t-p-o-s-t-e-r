/**
 * Multi-platform Publisher types (TASK-700).
 *
 * One PublishJob, many platforms. Each platform has its own adapter
 * (Adapter implements PublishAdapter). The pipeline:
 *   normaliseJob → routeByPlatform → publishAll → recordResults.
 *
 * Drafts from agent-writer plug in directly: WriterDraft.parts
 * become a thread on X, a single post on LinkedIn/IG, the body of a
 * newsletter, etc. The publisher doesn't rewrite content — it only
 * routes + retries.
 */

export type Platform =
  | 'x'
  | 'linkedin'
  | 'instagram'
  | 'tiktok'
  | 'youtube'
  | 'newsletter'
  | 'blog'

export interface MediaRef {
  /** http(s) URL or data: URL. */
  url: string
  mime: string
  /** Used for accessibility on X/IG. */
  alt?: string
}

export interface PublishJob {
  platform: Platform
  /** Headline / subject / first part / video title. */
  title: string
  /** Ordered body parts; the adapter slices according to platform. */
  parts: string[]
  /** Optional media references — image(s) for X/IG/LI, video for TT/YT. */
  media?: MediaRef[]
  /** Schedule for later (ISO). If absent, publish now. */
  publishAt?: string
  /** Free-form metadata: hashtags, subject, preview, audience, etc. */
  meta?: Record<string, unknown>
  /** Idempotency key — adapters skip duplicates. */
  idempotencyKey?: string
  /** Status override for drafts/approvals. */
  status?: string
}

export interface PublishResult {
  ok: boolean
  platform: Platform
  postId?: string
  url?: string
  error?: string
  /** Set when the platform queued for later instead of publishing now. */
  scheduled?: boolean
}

export interface PublishReport {
  results: PublishResult[]
  /** Jobs whose platform had no registered adapter. */
  unrouted: PublishJob[]
}

// ── Adapter contract ────────────────────────────────────────────────────────

export interface PublishAdapter {
  platform: Platform
  publish(job: PublishJob): Promise<PublishResult>
}

// ── Scheduler contract (optional persistence) ───────────────────────────────

export interface JobStore {
  enqueue(job: PublishJob): Promise<void>
  dueNow(now: Date): Promise<PublishJob[]>
  markDone(job: PublishJob, result: PublishResult): Promise<void>
}
