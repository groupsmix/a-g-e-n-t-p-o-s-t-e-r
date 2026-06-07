import { describe, it, expect } from 'vitest'
import { aggregate } from './aggregate'
import { resolveAttribution } from './attribution'
import { revenueId } from './fingerprint'
import { parseGumroadSale } from '../adapters/gumroad'
import { parseAmazonCsv } from '../adapters/amazon'
import { InMemoryRevenueStore } from '../adapters/storage'
import { runRevenueOnce } from './run'
import type { RevenueAdapter, RevenueEvent } from '../types'

describe('aggregate', () => {
  const events: RevenueEvent[] = [
    {
      id: '1', source: 'gumroad', external_id: 'a', amount_usd_cents: 2500,
      currency: 'USD', occurred_at: '2026-06-01T00:00:00Z',
      attribution: { platform: 'x', content_id: 'post-1' },
    },
    {
      id: '2', source: 'gumroad', external_id: 'b', amount_usd_cents: 1500,
      currency: 'USD', occurred_at: '2026-06-02T00:00:00Z',
      attribution: { platform: 'x', content_id: 'post-1' },
    },
    {
      id: '3', source: 'amazon', external_id: 'c', amount_usd_cents: 700,
      currency: 'USD', occurred_at: '2026-06-03T00:00:00Z',
      attribution: {},
      product_id: 'B0XX',
    },
  ]

  it('totals and pivots', () => {
    const a = aggregate(events, '2026-06-01T00:00:00Z', '2026-06-30T00:00:00Z')
    expect(a.total_usd_cents).toBe(4700)
    expect(a.by_source[0]!.source).toBe('gumroad')
    expect(a.by_platform[0]!.platform).toBe('x')
    expect(a.top_content[0]!.content_id).toBe('post-1')
    expect(a.top_content[0]!.total_usd_cents).toBe(4000)
    expect(a.unattributed_usd_cents).toBe(700)
  })
})

describe('resolveAttribution', () => {
  it('reads utm + host', () => {
    const a = resolveAttribution({
      referring_url: 'https://t.co/abc?utm_campaign=launch&utm_content=post-99',
    })
    expect(a.platform).toBe('x')
    expect(a.content_id).toBe('post-99')
    expect(a.campaign).toBe('launch')
  })
  it('parses affiliate subid', () => {
    const a = resolveAttribution({ affiliate_subid: 'linkedin_post42' })
    expect(a.platform).toBe('linkedin')
    expect(a.content_id).toBe('post42')
  })
})

describe('parseGumroadSale', () => {
  it('normalises a webhook', () => {
    const ev = parseGumroadSale({
      sale_id: 'gr_1',
      product_id: 'prod_a',
      product_name: 'Cool Thing',
      price: 19,
      email: 'a@b.com',
      referrer: 'https://x.com/me/status/123?utm_content=launch-post',
      sale_timestamp: '2026-06-01T10:00:00Z',
    })
    expect(ev.id).toBe(revenueId('gumroad', 'gr_1'))
    expect(ev.amount_usd_cents).toBe(1900)
    expect(ev.attribution.platform).toBe('x')
    expect(ev.attribution.content_id).toBe('launch-post')
  })
})

describe('parseAmazonCsv', () => {
  it('reads earnings rows with ASIN', () => {
    const csv = [
      'Date,Earnings,ASIN,Title,Tracking ID,Order ID',
      '2026-06-01,$1.23,B0AAA,A book,vellum-20,ORD-1',
      '2026-06-02,$5.00,B0BBB,Other,vellum-20,ORD-2',
      '2026-06-03,$0.00,B0CCC,Skip,vellum-20,ORD-3',
    ].join('\n')
    const evs = parseAmazonCsv(csv)
    expect(evs.length).toBe(2)
    expect(evs[0]!.amount_usd_cents).toBe(123)
    expect(evs[1]!.product_id).toBe('B0BBB')
  })
})

describe('runRevenueOnce', () => {
  it('aggregates events from adapters and dedupes', async () => {
    const store = new InMemoryRevenueStore()
    const ev: RevenueEvent = {
      id: 'r1', source: 'gumroad', external_id: 'x', amount_usd_cents: 100,
      currency: 'USD', occurred_at: '2026-06-01T00:00:00Z', attribution: {},
    }
    const adA: RevenueAdapter = {
      source: 'gumroad',
      async fetchSince() { return [ev] },
    }
    const r1 = await runRevenueOnce({ adapters: [adA], store })
    const r2 = await runRevenueOnce({ adapters: [adA], store })
    expect(r1.inserted).toBe(1)
    expect(r2.inserted).toBe(0)
  })

  it('isolates adapter failures', async () => {
    const store = new InMemoryRevenueStore()
    const bad: RevenueAdapter = {
      source: 'amazon',
      async fetchSince() { throw new Error('boom') },
    }
    const ok: RevenueAdapter = {
      source: 'gumroad',
      async fetchSince() { return [] },
    }
    const r = await runRevenueOnce({ adapters: [bad, ok], store })
    expect(r.errors).toBe(1)
    expect(r.adapters.find((a) => a.source === 'amazon')!.error).toMatch(/boom/)
  })
})
