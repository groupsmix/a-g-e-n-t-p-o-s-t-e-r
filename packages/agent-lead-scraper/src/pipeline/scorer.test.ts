import { describe, it, expect } from 'vitest'
import { scoreLead, toLead, fingerprint } from './scorer'
import { scrape } from './scraper'
import { InMemoryLeadStore } from './storage'
import type { LeadSourceAdapter, RawLead } from '../types'

function raw(overrides: Partial<RawLead> = {}): RawLead {
  return {
    source: 'reddit',
    source_id: 'r1',
    author: 'op',
    text: 'looking for a tool that does X',
    url: 'https://r/x',
    posted_at: new Date().toISOString(),
    matched_terms: ['tool'],
    ...overrides,
  }
}

const NOW = new Date('2026-06-07T00:00:00Z')

describe('scoreLead', () => {
  it('flags hot intent on direct buying-intent phrases', () => {
    const s = scoreLead(
      raw({
        text: "I'm looking for a tool, willing to pay for a paid solution",
        posted_at: NOW.toISOString(),
        extra: { upvotes: 50, comments: 20 },
        author_bio: 'indie founder building a saas',
      }),
      NOW,
    )
    expect(s.intent).toBe('hot')
    expect(s.total).toBeGreaterThanOrEqual(70)
  })

  it('decays recency exponentially', () => {
    const fresh = scoreLead(raw({ posted_at: NOW.toISOString() }), NOW).components.recency
    const day3 = scoreLead(
      raw({ posted_at: new Date(NOW.getTime() - 72 * 3600 * 1000).toISOString() }),
      NOW,
    ).components.recency
    expect(fresh).toBeGreaterThan(day3)
  })

  it('bumps audience_fit when bio contains role tokens', () => {
    const withBio = scoreLead(raw({ author_bio: 'CTO of a saas startup' }), NOW)
    const noBio = scoreLead(raw({ author_bio: undefined }), NOW)
    expect(withBio.components.audience_fit).toBeGreaterThan(noBio.components.audience_fit)
  })
})

describe('fingerprint', () => {
  it('is stable for same source+id', () => {
    const a = fingerprint(raw({ source_id: 'abc' }))
    const b = fingerprint(raw({ source_id: 'abc' }))
    expect(a).toBe(b)
  })
  it('differs across ids', () => {
    expect(fingerprint(raw({ source_id: 'a' }))).not.toBe(fingerprint(raw({ source_id: 'b' })))
  })
})

describe('scrape', () => {
  function stub(items: RawLead[]): LeadSourceAdapter {
    return { source: 'reddit', fetch: async () => items }
  }

  it('dedupes across adapters by fingerprint', async () => {
    const dup = raw({ source_id: 'dup' })
    const r = await scrape({
      adapters: [stub([dup]), stub([dup, raw({ source_id: 'other' })])],
      query: { terms: ['tool'] },
      now: () => NOW,
    })
    expect(r.raw_count).toBe(3)
    expect(r.unique_count).toBe(2)
  })

  it('drops leads matching excludeTerms', async () => {
    const r = await scrape({
      adapters: [stub([raw({ text: 'looking for free tool tutorial' })])],
      query: { terms: ['tool'], excludeTerms: ['free', 'tutorial'] },
      now: () => NOW,
    })
    expect(r.unique_count).toBe(0)
  })

  it('catches per-source errors', async () => {
    const failing: LeadSourceAdapter = {
      source: 'x',
      fetch: async () => {
        throw new Error('rate limited')
      },
    }
    const r = await scrape({
      adapters: [failing, stub([raw({ source_id: 'ok' })])],
      query: { terms: ['tool'] },
      now: () => NOW,
    })
    expect(r.errors).toHaveLength(1)
    expect(r.errors[0]!.source).toBe('x')
    expect(r.unique_count).toBe(1)
  })

  it('sorts by score descending', async () => {
    const lo = raw({ source_id: 'lo', text: 'using a thing', posted_at: '2026-01-01' })
    const hi = raw({
      source_id: 'hi',
      text: "I'm looking for a paid tool — willing to pay",
      posted_at: NOW.toISOString(),
      extra: { upvotes: 100, comments: 30 },
    })
    const r = await scrape({
      adapters: [stub([lo, hi])],
      query: { terms: ['tool'] },
      now: () => NOW,
    })
    expect(r.scored[0]!.fingerprint).toBe(toLead(hi, NOW).fingerprint)
  })
})

describe('InMemoryLeadStore', () => {
  it('upsert reports inserted on first write, not on second', async () => {
    const store = new InMemoryLeadStore()
    const lead = toLead(raw(), NOW)
    expect((await store.upsert(lead)).inserted).toBe(true)
    expect((await store.upsert(lead)).inserted).toBe(false)
  })

  it('list filters by intent', async () => {
    const store = new InMemoryLeadStore()
    const hot = toLead(
      raw({
        source_id: 'h',
        text: "looking for a tool, willing to pay",
        posted_at: NOW.toISOString(),
        extra: { upvotes: 50, comments: 20 },
        author_bio: 'indie founder saas',
      }),
      NOW,
    )
    const cold = toLead(raw({ source_id: 'c', text: 'random' }), NOW)
    await store.upsert(hot)
    await store.upsert(cold)
    const hotOnly = await store.list({ intent: 'hot' })
    expect(hotOnly.every((l) => l.score.intent === 'hot')).toBe(true)
  })
})
