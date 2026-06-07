/**
 * Scorer — LLM batch sentiment classifier with safety caps.
 *
 * Batches all mentions into a single classifier call (the SentimentScorer
 * adapter handles its own chunking if it needs to). When the count
 * exceeds `config.sentimentCap` the scorer degrades to a heuristic
 * keyword scoring rather than burning tokens — the cron loop ships
 * the same shape either way.
 *
 * Synthetic virality score (0..100) blends upvotes/comments/views/shares
 * with a log-curve so a 10k-upvote post doesn't completely drown a
 * smaller-but-still-viral one.
 */

import type {
  Mention,
  MonitorConfig,
  ScoredMention,
  SentimentScore,
  SentimentScorer,
} from '../types.js'

export interface ScorerInput {
  mentions: Mention[]
  competitorIds: Set<string>
  brand: string[]
  scorer?: SentimentScorer
  config: MonitorConfig
  signal?: AbortSignal
  log?: {
    info(msg: string, meta?: Record<string, unknown>): void
    warn(msg: string, meta?: Record<string, unknown>): void
  }
}

export interface ScorerOutput {
  scored: ScoredMention[]
  usage: {
    sentimentInputTokens: number
    sentimentOutputTokens: number
  }
}

export async function scoreMentions(input: ScorerInput): Promise<ScorerOutput> {
  const { mentions, competitorIds, brand, scorer, config } = input

  let sentimentMap: Record<string, SentimentScore> = {}
  let usage = { sentimentInputTokens: 0, sentimentOutputTokens: 0 }

  if (!scorer) {
    input.log?.info('scorer: no LLM scorer provided, falling back to heuristic')
    sentimentMap = heuristicSentiment(mentions)
  } else if (mentions.length > config.sentimentCap) {
    input.log?.warn('scorer: above sentimentCap, falling back to heuristic', {
      count: mentions.length,
      cap: config.sentimentCap,
    })
    sentimentMap = heuristicSentiment(mentions)
  } else if (mentions.length === 0) {
    sentimentMap = {}
  } else {
    try {
      sentimentMap = await scorer.score({
        mentions: mentions.map((m) => ({
          id: m.id,
          title: m.title,
          text: m.text.slice(0, 2000),
        })),
        brand,
        signal: input.signal,
      })
    } catch (err) {
      input.log?.warn('scorer: LLM failed, falling back to heuristic', {
        error: (err as Error).message,
      })
      sentimentMap = heuristicSentiment(mentions)
    }
  }

  const scored: ScoredMention[] = mentions.map((m) => {
    const sentiment: SentimentScore = sentimentMap[m.id] ?? {
      label: 'neutral',
      confidence: 0.25,
      rationale: 'no classifier output',
    }
    return {
      ...m,
      sentiment,
      virality: computeVirality(m),
      isCompetitor: competitorIds.has(m.id),
    }
  })

  return { scored, usage }
}

/**
 * Heuristic fallback. Cheap, deterministic, embarrassingly simple —
 * but better than guessing "neutral" for everything. Counts loaded
 * words and assigns a label. Confidence is low (~0.4) on purpose so
 * downstream alerting can de-rate it.
 */
const POS = [
  'love', 'great', 'amazing', 'awesome', 'best', 'fantastic', 'excellent',
  'beautiful', 'helpful', 'recommend', 'impressive', 'powerful', 'fast',
]
const NEG = [
  'hate', 'terrible', 'awful', 'worst', 'broken', 'scam', 'sucks',
  'buggy', 'slow', 'overpriced', 'disappointing', 'useless', 'crash',
  'dont buy', "don't buy", 'avoid', 'lawsuit',
]

export function heuristicSentiment(
  mentions: Array<Pick<Mention, 'id' | 'title' | 'text'>>,
): Record<string, SentimentScore> {
  const out: Record<string, SentimentScore> = {}
  for (const m of mentions) {
    const blob = `${m.title} ${m.text}`.toLowerCase()
    let pos = 0
    let neg = 0
    for (const w of POS) if (blob.includes(w)) pos += 1
    for (const w of NEG) if (blob.includes(w)) neg += 1
    let label: SentimentScore['label'] = 'neutral'
    if (neg > pos) label = 'negative'
    else if (pos > neg) label = 'positive'
    out[m.id] = {
      label,
      confidence: 0.4,
      rationale: `heuristic: pos=${pos} neg=${neg}`,
    }
  }
  return out
}

export function computeVirality(m: Mention): number {
  const eng = m.engagement ?? {}
  const up = eng.upvotes ?? 0
  const com = eng.comments ?? 0
  const views = eng.views ?? 0
  const shares = eng.shares ?? 0
  // Log curve so 100k views feels meaningfully larger than 10k
  // but not 10× larger.
  const upScore = Math.log10(up + 1) * 12
  const comScore = Math.log10(com + 1) * 18
  const viewScore = Math.log10(views + 1) * 6
  const shareScore = Math.log10(shares + 1) * 14
  const raw = upScore + comScore + viewScore + shareScore
  return Math.max(0, Math.min(100, Math.round(raw)))
}
