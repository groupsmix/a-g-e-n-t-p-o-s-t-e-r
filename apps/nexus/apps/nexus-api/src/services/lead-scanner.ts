// ============================================================
// lead-scanner.ts — TASK-801
// ============================================================
// Intent-mining lead scanner. Given a list of search terms, fetches recent
// posts/comments from public sources (Reddit JSON, HN Algolia), scores each
// one for buyer intent, deduplicates by SHA-1 fingerprint of source+id, and
// upserts into the `leads` table (created in migration 027).
//
// Why these sources:
//   * Reddit JSON API — public, free, returns posts directly. No scraping,
//     no auth required for read-only access. Subreddit + keyword search via
//     the .json suffix.
//   * HN Algolia API — public, free, full-text search across all HN content.
//
// Skipped intentionally:
//   * Quora — no public API, aggressive anti-bot, would need browser
//     rendering. Add later via the BROWSER binding if the operator wants it.
//   * Twitter/X — read API is now paid-only.
//
// The intent scoring is deliberately simple and explainable (term matching +
// language-signal heuristics). It is NOT an LLM call per lead — that would
// burn budget on the long tail. Operators see the score breakdown and can
// override via the dashboard.
// ============================================================

import type { D1Database } from '@cloudflare/workers-types'

// ── Types ────────────────────────────────────────────────────

export type LeadIntent = 'asking' | 'comparing' | 'frustrated' | 'buying' | 'other'

export interface LeadInput {
  source: string          // 'reddit' | 'hn' | future sources
  source_id: string       // stable id from the source
  author: string
  author_bio?: string | null
  text: string
  url: string
  posted_at: string       // ISO timestamp
  extra?: Record<string, unknown> | null
}

export interface ScoredLead extends LeadInput {
  fingerprint: string
  matched_terms: string[]
  score_total: number
  score_intent: LeadIntent
  score_components: Record<string, number>
  suggested_reply?: string | null
}

export interface ScanResult {
  scanned: number
  inserted: number
  skipped: number   // already in db (dedup)
  filtered: number  // didn't match any term
  errors: string[]
}

// ── Intent-signal heuristics ─────────────────────────────────
//
// Each bucket contributes a weighted points value if matched. Weights chosen
// so a strong buying-intent signal outscores a frustration vent.

const SIGNALS: Array<{
  kind: LeadIntent
  // Match either by phrase substring (case-insensitive) or regex.
  patterns: RegExp[]
  weight: number
}> = [
  {
    kind: 'buying',
    weight: 40,
    patterns: [
      /\b(any(one)? recommend|recommendations? for|looking to (buy|pay|hire)|where can i (buy|find|get)|need to purchase|willing to pay)\b/i,
      /\b(budget (of|is)|i('| a)?m ready to (buy|pay)|how much (does|do you charge))\b/i,
    ],
  },
  {
    kind: 'comparing',
    weight: 25,
    patterns: [
      /\b(vs\.?|versus|compared to|alternative(s)? to|instead of)\b/i,
      /\b(which (one|tool|service) is better|differences between)\b/i,
    ],
  },
  {
    kind: 'asking',
    weight: 18,
    patterns: [
      /\b(how (do|can|should) i|what('| i)?s the best|any (tips|advice|help) (on|with|for))\b/i,
      /\b(can someone explain|need help with|stuck on|trying to figure out)\b/i,
      /\?\s*$/,
    ],
  },
  {
    kind: 'frustrated',
    weight: 12,
    patterns: [
      /\b(hate|frustrated|annoying|broken|doesn'?t work|stopped working|why (does|is)|sick of)\b/i,
    ],
  },
]

const NEGATIVE_PATTERNS: RegExp[] = [
  // Memes, jokes, off-topic
  /\b(lol+|haha|jk|\/s|\/sarcasm|meme)\b/i,
  // Self-promo (we don't want to "lead" on competitors plugging themselves)
  /\b(check out my|i (built|launched|made))\b/i,
]

// ── Term matching ────────────────────────────────────────────

function matchTerms(text: string, terms: string[]): string[] {
  const lower = text.toLowerCase()
  const hits: string[] = []
  for (const t of terms) {
    const term = t.trim()
    if (!term) continue
    if (lower.includes(term.toLowerCase())) hits.push(term)
  }
  return hits
}

// ── Fingerprint (SHA-1, hex). Avoids crypto.subtle awkwardness inline. ──

async function fingerprint(source: string, sourceId: string): Promise<string> {
  const data = new TextEncoder().encode(`${source}::${sourceId}`)
  const buf = await crypto.subtle.digest('SHA-1', data)
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// ── Scoring ──────────────────────────────────────────────────

export function scoreText(
  text: string,
  matchedTerms: string[],
): { total: number; intent: LeadIntent; components: Record<string, number> } {
  const components: Record<string, number> = {}
  let intent: LeadIntent = 'other'
  let intentWeight = 0
  let total = 0

  // Base from term matches. More matches = more on-topic.
  const termPoints = Math.min(matchedTerms.length, 5) * 10
  if (termPoints > 0) {
    components.terms = termPoints
    total += termPoints
  }

  for (const sig of SIGNALS) {
    for (const re of sig.patterns) {
      if (re.test(text)) {
        components[sig.kind] = (components[sig.kind] ?? 0) + sig.weight
        total += sig.weight
        if (sig.weight > intentWeight) {
          intent = sig.kind
          intentWeight = sig.weight
        }
        break
      }
    }
  }

  // Penalties
  let penalty = 0
  for (const re of NEGATIVE_PATTERNS) {
    if (re.test(text)) penalty += 15
  }
  if (penalty > 0) {
    components.penalty = -penalty
    total -= penalty
  }

  // Length: very short or very long posts deprioritised.
  const len = text.length
  if (len < 30) {
    components.too_short = -10
    total -= 10
  } else if (len > 4000) {
    components.too_long = -5
    total -= 5
  }

  return { total: Math.max(0, Math.round(total)), intent, components }
}

// ── Source: Reddit ───────────────────────────────────────────
//
// Uses the public .json endpoint. No auth needed for read-only. We respect
// the operator's User-Agent string so we don't get throttled.

interface RedditChild {
  kind: string
  data: {
    id: string
    name?: string
    title?: string
    selftext?: string
    body?: string                // comments
    author: string
    subreddit: string
    permalink: string
    created_utc: number
  }
}

export async function fetchReddit(
  subreddits: string[],
  terms: string[],
  opts: { limit?: number; sort?: 'new' | 'hot'; userAgent?: string } = {},
): Promise<LeadInput[]> {
  const limit = Math.min(opts.limit ?? 25, 100)
  const sort = opts.sort ?? 'new'
  const ua = opts.userAgent ?? 'posteragent-leadscanner/0.1 (+https://github.com/groupsmix/a-g-e-n-t-p-o-s-t-e-r)'

  const out: LeadInput[] = []
  for (const sub of subreddits) {
    const cleaned = sub.replace(/^r\//, '').trim()
    if (!cleaned) continue
    const url = `https://www.reddit.com/r/${encodeURIComponent(cleaned)}/${sort}.json?limit=${limit}`
    let res: Response
    try {
      res = await fetch(url, { headers: { 'User-Agent': ua, Accept: 'application/json' } })
    } catch {
      continue
    }
    if (!res.ok) continue
    const json = await res.json().catch(() => null) as { data?: { children?: RedditChild[] } } | null
    const children = json?.data?.children ?? []
    for (const child of children) {
      const d = child.data
      const text = `${d.title ?? ''}\n${d.selftext ?? d.body ?? ''}`.trim()
      if (!text) continue
      // Only keep posts that touch the search terms (term filter is the
      // primary on-topic gate; scoring further ranks them).
      if (matchTerms(text, terms).length === 0) continue
      out.push({
        source: 'reddit',
        source_id: d.name ?? d.id,
        author: d.author,
        text,
        url: `https://www.reddit.com${d.permalink}`,
        posted_at: new Date(d.created_utc * 1000).toISOString(),
        extra: { subreddit: d.subreddit },
      })
    }
  }
  return out
}

// ── Source: HN Algolia ───────────────────────────────────────

interface HNHit {
  objectID: string
  author: string
  title?: string | null
  story_text?: string | null
  comment_text?: string | null
  url?: string | null
  created_at: string
  _tags?: string[]
}

export async function fetchHN(
  terms: string[],
  opts: { limit?: number } = {},
): Promise<LeadInput[]> {
  const limit = Math.min(opts.limit ?? 25, 100)
  const out: LeadInput[] = []
  // Algolia OR-syntax for any term. URL-encoded.
  const q = terms.filter(Boolean).map((t) => `"${t}"`).join(' OR ')
  if (!q) return out
  const url = `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(q)}&hitsPerPage=${limit}&tags=(story,comment)`
  let res: Response
  try {
    res = await fetch(url, { headers: { Accept: 'application/json' } })
  } catch {
    return out
  }
  if (!res.ok) return out
  const json = await res.json().catch(() => null) as { hits?: HNHit[] } | null
  for (const h of json?.hits ?? []) {
    const text = (h.title ?? '') + '\n' + (h.story_text ?? h.comment_text ?? '')
    if (!text.trim()) continue
    if (matchTerms(text, terms).length === 0) continue
    const isComment = (h._tags ?? []).includes('comment')
    out.push({
      source: 'hn',
      source_id: h.objectID,
      author: h.author,
      text: text.trim(),
      url: h.url ?? `https://news.ycombinator.com/item?id=${h.objectID}`,
      posted_at: h.created_at,
      extra: { kind: isComment ? 'comment' : 'story' },
    })
  }
  return out
}

// ── Score + dedupe + persist ─────────────────────────────────

export async function ingestLeads(
  db: D1Database,
  inputs: LeadInput[],
  terms: string[],
): Promise<ScanResult> {
  const result: ScanResult = { scanned: inputs.length, inserted: 0, skipped: 0, filtered: 0, errors: [] }

  for (const lead of inputs) {
    const matched = matchTerms(lead.text, terms)
    if (matched.length === 0) {
      result.filtered++
      continue
    }
    const { total, intent, components } = scoreText(lead.text, matched)
    const fp = await fingerprint(lead.source, lead.source_id)

    try {
      const insert = await db
        .prepare(
          `INSERT OR IGNORE INTO leads
             (fingerprint, source, source_id, author, author_bio, text, url,
              posted_at, matched_terms, extra, score_total, score_intent,
              score_components, suggested_reply, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new')`,
        )
        .bind(
          fp,
          lead.source,
          lead.source_id,
          lead.author,
          lead.author_bio ?? null,
          lead.text,
          lead.url,
          lead.posted_at,
          JSON.stringify(matched),
          lead.extra ? JSON.stringify(lead.extra) : null,
          total,
          intent,
          JSON.stringify(components),
          null,
        )
        .run()

      // D1 returns meta.changes; INSERT OR IGNORE returns 0 when the row
      // already existed.
      const changes = (insert.meta as { changes?: number } | undefined)?.changes ?? 0
      if (changes > 0) result.inserted++
      else result.skipped++
    } catch (e) {
      result.errors.push(String((e as Error).message ?? e))
    }
  }

  return result
}

// ── Orchestrated scan (used by the route) ────────────────────

export interface ScanOptions {
  terms: string[]
  subreddits?: string[]
  sources?: Array<'reddit' | 'hn'>
  limit?: number
  userAgent?: string
}

export async function runLeadScan(
  db: D1Database,
  opts: ScanOptions,
): Promise<ScanResult & { sources: Record<string, number> }> {
  const sources = opts.sources ?? (opts.subreddits?.length ? ['reddit', 'hn'] : ['hn'])
  const sourceCounts: Record<string, number> = {}
  const all: LeadInput[] = []

  if (sources.includes('reddit') && opts.subreddits?.length) {
    const r = await fetchReddit(opts.subreddits, opts.terms, {
      limit: opts.limit,
      userAgent: opts.userAgent,
    })
    sourceCounts.reddit = r.length
    all.push(...r)
  }
  if (sources.includes('hn')) {
    const h = await fetchHN(opts.terms, { limit: opts.limit })
    sourceCounts.hn = h.length
    all.push(...h)
  }

  const ingest = await ingestLeads(db, all, opts.terms)
  return { ...ingest, sources: sourceCounts }
}
