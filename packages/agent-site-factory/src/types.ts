/**
 * Site Factory types (TASK-501).
 *
 * Flow:  niche → bucket spec → CMS bucket created → seed articles
 *        generated → published → Next.js project deployed → cron set.
 *
 * Each stage emits a typed result so failures degrade gracefully:
 * if the deploy stage fails we still keep the bucket + articles.
 */

export interface SiteBrief {
  /** Primary topic / niche of the site. */
  niche: string
  /** Audience persona — informs tone. */
  audience?: string
  /** Brand voice descriptor. */
  voice?: string
  /** Number of seed articles to generate. Default 10. */
  seedCount?: number
  /** Recurring cadence for new posts in days. Default 7. */
  cadenceDays?: number
}

export interface BucketSpec {
  slug: string
  title: string
  description: string
  objectTypes: Array<{ slug: string; title: string }>
}

export interface SeedArticle {
  slug: string
  title: string
  excerpt: string
  markdown: string
  tags: string[]
}

export interface PublishedArticle extends SeedArticle {
  id: string
  publishedAt: string
  url?: string
}

export interface DeployedSite {
  url?: string
  inspectorUrl?: string
  provider: 'vercel' | 'cloudflare-pages' | 'dry-run'
  ok: boolean
  error?: string
}

export interface CronSchedule {
  expression: string         // e.g. "0 9 * * 1" — Mon 09:00 UTC
  taskType: string           // 'write' or 'site-factory-refresh'
  payload: Record<string, unknown>
}

export interface SiteFactoryReport {
  brief: SiteBrief
  bucket: BucketSpec
  articles: PublishedArticle[]
  deploy: DeployedSite
  cron: CronSchedule
}

// ── Client interfaces ───────────────────────────────────────────────────────

export interface LLMClient {
  complete(args: {
    system?: string
    messages: Array<{ role: 'user' | 'assistant'; content: string }>
    maxTokens?: number
    temperature?: number
    json?: boolean
  }): Promise<{ content: string; inputTokens?: number; outputTokens?: number }>
}

export interface CmsClient {
  /** Create a bucket if it does not exist. Returns the resolved slug. */
  ensureBucket(spec: BucketSpec): Promise<{ slug: string }>
  /** Upload a single article; returns the CMS-assigned id + url. */
  createArticle(
    bucketSlug: string,
    article: SeedArticle,
  ): Promise<{ id: string; url?: string }>
}

export interface SiteDeployClient {
  deploy(args: {
    bucketSlug: string
    bucket: BucketSpec
  }): Promise<DeployedSite>
}

export interface SchedulerClient {
  schedule(s: CronSchedule): Promise<{ ok: boolean; id?: string; error?: string }>
}
