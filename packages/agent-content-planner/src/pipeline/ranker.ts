/**
 * Stage 2 — cluster signals by topic, then score each cluster as a
 * potential ContentIdea.
 *
 * Score model (all 0..1, weighted sum):
 *   relevance  → cosine-ish overlap with brand.niche (token set)
 *   novelty    → 1 - similarity to recent ideas (caller can pass a
 *                de-dup list)
 *   velocity   → freshness × source weight
 *   brand-fit  → does at least one of brand.platforms apply?
 *
 * No LLM required; if one is provided, we ask it to suggest an
 * angle phrase per cluster for nicer downstream content.
 */

import type { BrandProfile, ContentIdea, LLMClient, Platform, Signal } from '../types.js'

const SOURCE_WEIGHT: Record<Signal['source'], number> = {
  trend: 0.9,
  monitor: 0.85,
  research: 0.7,
  'past-winner': 1.0,
  manual: 1.0,
}

function tokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2),
  )
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size && !b.size) return 0
  let inter = 0
  for (const t of a) if (b.has(t)) inter++
  return inter / (a.size + b.size - inter)
}

function freshness(observedAt: number, now: number): number {
  const days = (now - observedAt) / (1000 * 60 * 60 * 24)
  if (days <= 1) return 1
  if (days >= 14) return 0
  return 1 - days / 14
}

interface Cluster {
  topic: string
  signals: Signal[]
  tokens: Set<string>
}

function clusterSignals(signals: Signal[]): Cluster[] {
  const clusters: Cluster[] = []
  for (const s of signals) {
    const ts = tokens(s.topic)
    let best: Cluster | undefined
    let bestScore = 0
    for (const c of clusters) {
      const j = jaccard(c.tokens, ts)
      if (j > bestScore) {
        bestScore = j
        best = c
      }
    }
    if (best && bestScore >= 0.35) {
      best.signals.push(s)
      for (const t of ts) best.tokens.add(t)
    } else {
      clusters.push({ topic: s.topic, signals: [s], tokens: ts })
    }
  }
  return clusters
}

function pickPlatforms(brand: BrandProfile): Platform[] {
  return brand.platforms.filter((p) => (brand.cadence[p] ?? 0) > 0)
}

export interface RankerOptions {
  /** Previously published ideas (topic strings) to dampen novelty. */
  recentTopics?: string[]
  /** Result cap; defaults to platforms × cadence. */
  maxIdeas?: number
}

export async function rankIdeas(
  signals: Signal[],
  brand: BrandProfile,
  opts: RankerOptions = {},
  llm?: LLMClient,
): Promise<ContentIdea[]> {
  if (signals.length === 0) return []
  const now = Date.now()
  const nicheTokens = tokens(brand.niche)
  const recentTokens = (opts.recentTopics ?? []).map(tokens)

  const clusters = clusterSignals(signals)
  const platforms = pickPlatforms(brand)
  const ideas: ContentIdea[] = []

  for (const c of clusters) {
    const relevance = jaccard(c.tokens, nicheTokens) || 0.1
    const novelty = recentTokens.length
      ? 1 - Math.max(0, ...recentTokens.map((rt) => jaccard(c.tokens, rt)))
      : 1
    const velocity =
      c.signals.reduce(
        (acc, s) => acc + SOURCE_WEIGHT[s.source] * freshness(s.observedAt, now) * s.score,
        0,
      ) / c.signals.length
    const brandFit = platforms.length ? 1 : 0
    const score =
      relevance * 0.35 + novelty * 0.2 + velocity * 0.35 + brandFit * 0.1

    ideas.push({
      id: `idea_${ideas.length + 1}_${c.signals[0]!.source}`,
      topic: c.topic,
      angle: c.signals[0]!.note ?? c.topic,
      platforms: platforms.length ? platforms.slice(0, 3) : ['blog'],
      score: +score.toFixed(3),
      fromSignals: c.signals,
    })
  }

  ideas.sort((a, b) => b.score - a.score)
  const cap = opts.maxIdeas ?? Math.max(5, Object.values(brand.cadence).reduce((a, b) => a + (b ?? 0), 0))
  const top = ideas.slice(0, cap)

  // Optional: ask LLM for tighter angle phrases on the top N
  if (llm && top.length) {
    try {
      const res = await llm.complete({
        system: 'For each topic, return ONLY a JSON array of strings, one tight content angle per topic, same length and order as input.',
        messages: [{ role: 'user', content: JSON.stringify(top.map((i) => i.topic)) }],
        json: true,
        maxTokens: 600,
        temperature: 0.5,
      })
      const angles = JSON.parse(res.content) as unknown
      if (Array.isArray(angles)) {
        for (let i = 0; i < top.length; i++) {
          const a = angles[i]
          if (typeof a === 'string' && a.length > 5) top[i]!.angle = a
        }
      }
    } catch {
      /* keep angle as-is */
    }
  }

  return top
}
