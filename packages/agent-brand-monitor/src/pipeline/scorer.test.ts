import { describe, it, expect } from 'vitest'
import {
  heuristicSentiment,
  computeVirality,
  scoreMentions,
} from './scorer.js'
import type { Mention, SentimentScorer } from '../types.js'
import { DEFAULT_CONFIG } from '../types.js'

const sample = (over: Partial<Mention> = {}): Mention => ({
  id: 'm001',
  platform: 'reddit',
  url: 'https://reddit.com/r/x/comments/1',
  title: 'Just tried PosterAgent',
  text: 'It is great and amazing, I love it.',
  ...over,
})

describe('heuristicSentiment', () => {
  it('labels obvious positives positive', () => {
    const out = heuristicSentiment([sample({ id: 'a', text: 'amazing, love it, fantastic' })])
    expect(out.a.label).toBe('positive')
  })

  it('labels obvious negatives negative', () => {
    const out = heuristicSentiment([sample({ id: 'b', text: 'this is terrible, avoid, awful and broken' })])
    expect(out.b.label).toBe('negative')
  })

  it('falls back to neutral when no keywords match', () => {
    const out = heuristicSentiment([sample({ id: 'c', title: 'announcement', text: 'A release was published today.' })])
    expect(out.c.label).toBe('neutral')
  })
})

describe('computeVirality', () => {
  it('returns 0 with no engagement', () => {
    expect(computeVirality(sample({ engagement: undefined }))).toBe(0)
  })

  it('scales with upvotes + comments', () => {
    const low = computeVirality(sample({ engagement: { upvotes: 10, comments: 2 } }))
    const high = computeVirality(sample({ engagement: { upvotes: 10000, comments: 500 } }))
    expect(high).toBeGreaterThan(low)
    expect(high).toBeLessThanOrEqual(100)
  })

  it('caps at 100 even for absurd engagement', () => {
    expect(
      computeVirality(
        sample({ engagement: { upvotes: 1e9, comments: 1e9, views: 1e9, shares: 1e9 } }),
      ),
    ).toBeLessThanOrEqual(100)
  })
})

describe('scoreMentions', () => {
  it('uses heuristic when no scorer is provided', async () => {
    const out = await scoreMentions({
      mentions: [sample({ id: 'a', text: 'love this, amazing' })],
      competitorIds: new Set(),
      brand: ['Posteragent'],
      scorer: undefined,
      config: DEFAULT_CONFIG,
    })
    expect(out.scored[0].sentiment.label).toBe('positive')
    expect(out.scored[0].isCompetitor).toBe(false)
  })

  it('marks competitor ids correctly', async () => {
    const out = await scoreMentions({
      mentions: [sample({ id: 'a' }), sample({ id: 'b', url: 'https://x.com/2' })],
      competitorIds: new Set(['b']),
      brand: ['Posteragent'],
      scorer: undefined,
      config: DEFAULT_CONFIG,
    })
    expect(out.scored.find((m) => m.id === 'a')!.isCompetitor).toBe(false)
    expect(out.scored.find((m) => m.id === 'b')!.isCompetitor).toBe(true)
  })

  it('falls back to heuristic when scorer throws', async () => {
    const broken: SentimentScorer = {
      name: 'broken',
      async score() {
        throw new Error('boom')
      },
    }
    const out = await scoreMentions({
      mentions: [sample({ id: 'a', text: 'love it amazing' })],
      competitorIds: new Set(),
      brand: ['x'],
      scorer: broken,
      config: DEFAULT_CONFIG,
    })
    expect(out.scored[0].sentiment.label).toBe('positive')
  })

  it('skips LLM and uses heuristic above sentimentCap', async () => {
    let called = false
    const llm: SentimentScorer = {
      name: 'llm',
      async score() {
        called = true
        return {}
      },
    }
    const many: Mention[] = Array.from({ length: 5 }, (_, i) =>
      sample({ id: `m${i}`, url: `https://x/${i}` }),
    )
    const out = await scoreMentions({
      mentions: many,
      competitorIds: new Set(),
      brand: ['x'],
      scorer: llm,
      config: { ...DEFAULT_CONFIG, sentimentCap: 3 },
    })
    expect(called).toBe(false)
    expect(out.scored).toHaveLength(5)
  })
})
