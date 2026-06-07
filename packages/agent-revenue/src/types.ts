/**
 * Revenue tracker contracts (TASK-901).
 *
 * Every revenue event from any source (Gumroad webhook, Amazon CSV
 * import, affiliate poll, AdSense report, direct entry) is normalised
 * into a RevenueEvent before it hits storage so the rest of the
 * system has one shape to work with.
 *
 * Attribution lives in `attribution`: a free-form referring URL,
 * platform, and content_id when we can resolve it from utm params or
 * affiliate sub-IDs. The aggregator pivots on that.
 */

export type RevenueSource =
  | 'gumroad'
  | 'amazon'
  | 'affiliate'
  | 'adsense'
  | 'youtube'
  | 'tiktok'
  | 'newsletter'
  | 'direct'
  | 'other'

export interface RevenueAttribution {
  /** Original referring URL if we got one. */
  referring_url?: string
  /** Resolved publishing platform — 'x', 'linkedin', 'youtube', etc. */
  platform?: string
  /** Resolved publisher content/post id if we could match the link. */
  content_id?: string
  /** Free-form campaign tag (utm_campaign, affiliate sub-id, etc.). */
  campaign?: string
}

export interface RevenueEvent {
  /** Stable id — usually FNV-1a over (source|external_id) so dedupe is free. */
  id: string
  source: RevenueSource
  /** Source's own id for the sale (Gumroad sale_id, Amazon order_id, …). */
  external_id: string
  amount_usd_cents: number
  currency: string
  product_id?: string | null
  buyer_email?: string | null
  description?: string | null
  occurred_at: string
  attribution: RevenueAttribution
  /** Raw payload from the source, for audit. */
  raw?: Record<string, unknown>
}

export interface RevenueAdapter {
  source: RevenueSource
  /** Pull events that have occurred since the given cursor (inclusive). */
  fetchSince(since: Date, now: Date): Promise<RevenueEvent[]>
}

export interface RevenueStore {
  /** Insert events; existing IDs are ignored (dedupe). Returns inserted count. */
  upsert(events: RevenueEvent[]): Promise<number>
  /** Read events in a window for aggregation. */
  list(opts: {
    since: string
    until: string
    source?: RevenueSource
  }): Promise<RevenueEvent[]>
  /** Last successful fetch cursor per source. */
  getCursor(source: RevenueSource): Promise<string | null>
  setCursor(source: RevenueSource, atIso: string): Promise<void>
}

export interface RevenueAggregate {
  window_start: string
  window_end: string
  total_usd_cents: number
  by_source: Array<{ source: RevenueSource; total_usd_cents: number; count: number }>
  by_platform: Array<{ platform: string; total_usd_cents: number; count: number }>
  by_product: Array<{ product_id: string; total_usd_cents: number; count: number }>
  top_content: Array<{ content_id: string; platform?: string; total_usd_cents: number; count: number }>
  unattributed_usd_cents: number
}

export interface RevenueRunResult {
  generated_at: string
  fetched: number
  inserted: number
  errors: number
  adapters: Array<{ source: RevenueSource; fetched: number; inserted: number; error?: string }>
}
