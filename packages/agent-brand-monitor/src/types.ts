/**
 * @posteragent/agent-brand-monitor — types
 *
 * Provider-agnostic. The pipeline depends on MentionSource and
 * SentimentScorer interfaces only. Concrete adapters (Reddit, HN,
 * NewsAPI, YouTube, Anthropic classifier) live under ./adapters and
 * are wired at boot. Tests inject mocks of these interfaces.
 *
 * Pipeline shape:
 *
 *   Brand terms
 *     → scanMentions (fan-out across all sources, in parallel)
 *     → scoreSentiment (LLM batch classifier)
 *     → detectAlerts (negative spike · viral · competitor)
 *     → MonitorReport
 */

// ─── Mention sources ───────────────────────────────────────────────────

export type MentionPlatform =
  | 'reddit'
  | 'hackernews'
  | 'news'
  | 'youtube'
  | 'twitter'
  | 'other'

export interface Mention {
  /** Stable id; the scanner re-stamps to `m001`, `m002`... for citations. */
  id: string
  platform: MentionPlatform
  /** Direct URL to the mention itself (post / article / video / tweet). */
  url: string
  title: string
  /** Body / snippet / first chunk of the post. */
  text: string
  /** Who posted it, if known. */
  author?: string
  /** ISO timestamp of when the mention was made. */
  publishedAt?: string
  /** Engagement signals (upvotes, comments, views). Higher = more viral. */
  engagement?: {
    upvotes?: number
    comments?: number
    views?: number
    shares?: number
  }
  /** Brand term that matched (for multi-term sweeps). */
  matchedTerm?: string
}

export interface MentionSource {
  readonly name: string
  readonly platform: MentionPlatform
  scan(input: {
    /** Brand / product / competitor / topic terms to look for. */
    terms: string[]
    /** Look back this many hours from now. Default 24. */
    sinceHours?: number
    /** Cap per-call. Default 25. */
    maxResults?: number
    signal?: AbortSignal
  }): Promise<Mention[]>
}

// ─── Sentiment ─────────────────────────────────────────────────────────

export type SentimentLabel = 'positive' | 'neutral' | 'negative'

export interface SentimentScore {
  label: SentimentLabel
  /** 0..1 confidence the classifier had in the label. */
  confidence: number
  /** Optional short rationale, populated when the LLM returns one. */
  rationale?: string
}

export interface SentimentScorer {
  readonly name: string
  score(input: {
    mentions: Array<{ id: string; title: string; text: string }>
    /** Brand terms used to keep the model grounded on "what's being talked about". */
    brand?: string[]
    signal?: AbortSignal
  }): Promise<Record<string, SentimentScore>>
}

// ─── Alerts ────────────────────────────────────────────────────────────

export type AlertKind =
  | 'negative-spike'
  | 'viral-mention'
  | 'competitor-action'
  | 'first-mention'

export interface BrandAlert {
  kind: AlertKind
  severity: 'low' | 'medium' | 'high'
  /** Mentions that triggered the alert. Stable ids. */
  mentionIds: string[]
  /** Human-readable headline. */
  headline: string
  /** One-paragraph rationale for the dashboard / journal. */
  detail: string
}

// ─── Scored mention (after the sentiment pass) ────────────────────────

export interface ScoredMention extends Mention {
  sentiment: SentimentScore
  /** Synthetic 0..100 virality score derived from engagement signals. */
  virality: number
  /** True when this mention's matched term came from `competitors`, not `brand`. */
  isCompetitor: boolean
}

// ─── Report ────────────────────────────────────────────────────────────

export interface MonitorReport {
  brand: string[]
  competitors: string[]
  sinceHours: number
  mentions: ScoredMention[]
  alerts: BrandAlert[]
  summary: {
    total: number
    positive: number
    neutral: number
    negative: number
    byPlatform: Record<MentionPlatform, number>
    avgVirality: number
  }
  /** Wall-clock per stage. */
  timings: {
    scanMs: number
    sentimentMs: number
    alertMs: number
    totalMs: number
  }
  usage: {
    sentimentInputTokens: number
    sentimentOutputTokens: number
  }
}

// ─── Pipeline config ───────────────────────────────────────────────────

export interface MonitorConfig {
  /** Look-back window in hours. Default 24 for ad-hoc, 6 for cron. */
  sinceHours: number
  /** Max mentions retrieved per source per term. Default 25. */
  maxResultsPerSource: number
  /** Skip sentiment scoring when total mentions exceed this (cost guard). Default 200. */
  sentimentCap: number
  /** Per-stage hard timeouts in ms. */
  scanTimeoutMs: number
  sentimentTimeoutMs: number
  /** Trigger negative-spike alert when negatives in window ≥ this. Default 5. */
  negativeSpikeThreshold: number
  /** Trigger viral alert when a single mention's virality score ≥ this. Default 75. */
  viralThreshold: number
  /** Optional LLM model override for the classifier. */
  sentimentModel?: string
}

export const DEFAULT_CONFIG: MonitorConfig = {
  sinceHours: 24,
  maxResultsPerSource: 25,
  sentimentCap: 200,
  scanTimeoutMs: 25_000,
  sentimentTimeoutMs: 60_000,
  negativeSpikeThreshold: 5,
  viralThreshold: 75,
}
