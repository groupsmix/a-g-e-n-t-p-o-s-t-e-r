/**
 * Lead scraper contracts (TASK-800).
 *
 * A "lead" is a person who showed buying intent in a public channel:
 * complained about a missing tool, asked for a recommendation, or
 * announced a need. The scraper produces RawLead records from each
 * source; the scorer turns them into scored Lead records the CRM
 * pipeline can act on.
 */

export type LeadSource =
  | 'reddit'
  | 'x'
  | 'linkedin'
  | 'youtube'
  | 'producthunt'
  | 'hackernews'

export interface RawLead {
  source: LeadSource
  /** Stable per-source identifier (post / comment id). */
  source_id: string
  /** Original author handle / username. */
  author: string
  /** Short author bio when the source surfaces one. */
  author_bio?: string
  /** Verbatim text the scraper matched on. */
  text: string
  /** Permalink back to the original post or comment. */
  url: string
  /** ISO timestamp the source published it (UTC). */
  posted_at: string
  /** Hits on the trigger keywords / phrases. */
  matched_terms: string[]
  /** Free-form per-source extras (subreddit, score, etc). */
  extra?: Record<string, string | number | boolean>
}

export type IntentLevel = 'hot' | 'warm' | 'cold'

export interface LeadScore {
  /** Aggregate score in [0, 100]. */
  total: number
  intent: IntentLevel
  /** Breakdown so the UI can explain the score. */
  components: {
    keyword_intent: number   // direct buying-intent phrases
    recency: number          // exponential decay
    audience_fit: number     // bio / role / subreddit signal
    engagement: number       // upvotes / replies if exposed
  }
}

export interface Lead extends RawLead {
  score: LeadScore
  /** Suggested first-touch reply (template-driven, optional LLM). */
  suggested_reply: string | null
  /** dedupe hash over source + source_id. */
  fingerprint: string
}

export interface ScrapeQuery {
  /** Search terms to match across sources. Required. */
  terms: string[]
  /** Optional negative terms — leads whose text contains any of these are dropped. */
  excludeTerms?: string[]
  /** Cap results per source. Defaults to 25. */
  limitPerSource?: number
  /** Restrict to posts newer than this ISO timestamp. */
  sinceIso?: string
}

export interface LeadSourceAdapter {
  source: LeadSource
  fetch(query: ScrapeQuery): Promise<RawLead[]>
}

export interface LeadStore {
  /** Upsert by fingerprint. New rows return inserted=true. */
  upsert(lead: Lead): Promise<{ inserted: boolean }>
  /** Read recent leads, newest first. */
  list(opts?: { limit?: number; intent?: IntentLevel }): Promise<Lead[]>
}

export interface ScrapeResult {
  attempted_sources: number
  raw_count: number
  unique_count: number
  scored: Lead[]
  errors: Array<{ source: LeadSource; error: string }>
}
