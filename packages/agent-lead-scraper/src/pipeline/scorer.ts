/**
 * Scorer — turns RawLead → Lead by computing intent, recency,
 * audience-fit and engagement components and rolling them into a
 * total in [0, 100].
 *
 * Weights (sum to 100):
 *   keyword_intent  40
 *   recency         25
 *   audience_fit    20
 *   engagement      15
 *
 * Bands:
 *   hot   ≥ 70
 *   warm  ≥ 40
 *   cold  otherwise
 */

import type { IntentLevel, Lead, LeadScore, RawLead } from '../types'

const W = { keyword_intent: 40, recency: 25, audience_fit: 20, engagement: 15 }

/** Phrases that read as direct buying intent. */
const HOT_PHRASES = [
  'looking for',
  'recommend',
  'recommendation',
  'any tool',
  'best tool',
  'i need',
  'i want',
  'is there',
  'how do i',
  'willing to pay',
  'paid solution',
  'hire',
  'budget for',
]

const WARM_PHRASES = [
  'tried',
  'using',
  'switched from',
  'alternative to',
  'better than',
  'frustrated with',
  'hate that',
  "doesn't work",
  'wish there was',
]

/** Tokens hinting the author is a real prospect (founder, marketer, etc). */
const AUDIENCE_TOKENS = [
  'founder',
  'ceo',
  'cto',
  'indie',
  'maker',
  'agency',
  'consultant',
  'pm',
  'product manager',
  'marketer',
  'creator',
  'startup',
  'saas',
]

const HALF_LIFE_HOURS = 48

function scoreKeywordIntent(text: string): number {
  const lower = text.toLowerCase()
  let hot = 0
  for (const p of HOT_PHRASES) if (lower.includes(p)) hot += 1
  let warm = 0
  for (const p of WARM_PHRASES) if (lower.includes(p)) warm += 1
  const raw = hot * 30 + warm * 10
  return Math.min(100, raw)
}

function scoreRecency(postedAt: string, now: Date): number {
  const then = new Date(postedAt).getTime()
  if (Number.isNaN(then)) return 0
  const hours = Math.max(0, (now.getTime() - then) / 3_600_000)
  // exponential half-life decay
  const value = 100 * Math.pow(0.5, hours / HALF_LIFE_HOURS)
  return Math.round(value)
}

function scoreAudienceFit(raw: RawLead): number {
  const blob = `${raw.author_bio ?? ''} ${JSON.stringify(raw.extra ?? {})}`.toLowerCase()
  let hits = 0
  for (const t of AUDIENCE_TOKENS) if (blob.includes(t)) hits += 1
  return Math.min(100, hits * 25)
}

function scoreEngagement(raw: RawLead): number {
  const e = raw.extra ?? {}
  const upvotes = Number(e.upvotes ?? e.score ?? e.likes ?? 0)
  const replies = Number(e.comments ?? e.replies ?? 0)
  // log-scaled so a viral thread doesn't dominate
  const raw01 = Math.log10(1 + upvotes) * 30 + Math.log10(1 + replies) * 40
  return Math.min(100, Math.round(raw01))
}

function intentBand(total: number): IntentLevel {
  if (total >= 70) return 'hot'
  if (total >= 40) return 'warm'
  return 'cold'
}

export function fingerprint(raw: RawLead): string {
  // tiny FNV-1a so we don't pull a crypto dep
  const s = `${raw.source}|${raw.source_id}`
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = (h * 16777619) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

export function scoreLead(raw: RawLead, now: Date = new Date()): LeadScore {
  const components = {
    keyword_intent: scoreKeywordIntent(raw.text),
    recency: scoreRecency(raw.posted_at, now),
    audience_fit: scoreAudienceFit(raw),
    engagement: scoreEngagement(raw),
  }
  const total = Math.round(
    (components.keyword_intent * W.keyword_intent +
      components.recency * W.recency +
      components.audience_fit * W.audience_fit +
      components.engagement * W.engagement) /
      100,
  )
  return { total, intent: intentBand(total), components }
}

export function toLead(raw: RawLead, now: Date = new Date()): Lead {
  return {
    ...raw,
    score: scoreLead(raw, now),
    suggested_reply: null,
    fingerprint: fingerprint(raw),
  }
}
