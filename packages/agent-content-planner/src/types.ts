/**
 * Content Planner types (TASK-600).
 *
 * Pipeline:
 *   gatherSignals (trends + monitor + research) →
 *   rankIdeas (relevance × novelty × velocity × brand-fit) →
 *   slotIntoCalendar (7-day grid with cadence rules) →
 *   emitWriteTasks (next-actions feed Writer/Publisher).
 */

export type Platform = 'blog' | 'x' | 'linkedin' | 'instagram' | 'tiktok' | 'youtube' | 'newsletter'

export interface Signal {
  /** what the signal is "about" — used for clustering. */
  topic: string
  /** signal source — controls weighting. */
  source: 'trend' | 'monitor' | 'research' | 'past-winner' | 'manual'
  /** higher = more interesting; orchestrator-set 0..1. */
  score: number
  /** epoch ms; recent signals weigh more. */
  observedAt: number
  /** human note for the journal. */
  note?: string
  /** optional link the writer should reference. */
  url?: string
}

export interface BrandProfile {
  niche: string
  /** Platforms in priority order; calendar fills these first. */
  platforms: Platform[]
  /** Posts per week target per platform. */
  cadence: Partial<Record<Platform, number>>
  audience?: string
  voice?: string
}

export interface ContentIdea {
  id: string
  topic: string
  /** Why it's worth writing — short phrase. */
  angle: string
  /** Suggested platforms; planner constrains by brand cadence. */
  platforms: Platform[]
  /** Composite 0..1 score. */
  score: number
  /** Source signals that triggered it. */
  fromSignals: Signal[]
}

export interface ScheduledPost {
  ideaId: string
  platform: Platform
  /** UTC ISO date, e.g. "2026-06-08T09:00:00Z" */
  publishAt: string
  /** Suggested format hint for the Writer agent. */
  format: 'thread' | 'post' | 'video' | 'newsletter' | 'long-form'
}

export interface ContentCalendar {
  brand: BrandProfile
  weekStart: string
  ideas: ContentIdea[]
  schedule: ScheduledPost[]
}

// ── Clients ─────────────────────────────────────────────────────────────────

export interface LLMClient {
  complete(args: {
    system?: string
    messages: Array<{ role: 'user' | 'assistant'; content: string }>
    maxTokens?: number
    temperature?: number
    json?: boolean
  }): Promise<{ content: string; inputTokens?: number; outputTokens?: number }>
}

export interface SignalSource {
  /** Returns recently observed signals from one source. */
  fetch(since: Date): Promise<Signal[]>
}
