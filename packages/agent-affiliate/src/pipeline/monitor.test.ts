import { describe, it, expect } from 'vitest'
import { runMonitor } from './monitor'
import { InMemoryHistory } from './storage'
import { fallbackDraft } from './writer'
import type {
  AffiliateAlert,
  ProductFetcher,
  ProductSnapshot,
  TrackedProduct,
} from '../types'

const PRODUCT: TrackedProduct = {
  id: 'p1',
  network: 'amazon',
  external_id: 'B00TEST',
  title: 'Acme Widget',
  niche: 'home',
  affiliate_url: 'https://a.co/test',
  currency: 'USD',
  drop_threshold: 0.2,
}

function fetcher(returns: ProductSnapshot[]): ProductFetcher {
  let i = 0
  return {
    network: 'amazon',
    fetch: async () => returns[i++] ?? returns.at(-1)!,
  }
}

describe('runMonitor', () => {
  it('emits price-drop when delta exceeds threshold', async () => {
    const history = new InMemoryHistory()
    await history.insert({
      product_id: 'p1',
      captured_at: '2026-06-01T00:00:00Z',
      price: 100,
      currency: 'USD',
      in_stock: true,
    })
    const r = await runMonitor({
      products: [PRODUCT],
      fetchers: {
        amazon: fetcher([{
          product_id: 'p1',
          captured_at: '2026-06-02T00:00:00Z',
          price: 70,
          currency: 'USD',
          in_stock: true,
        }]),
      },
      history,
    })
    expect(r.alerts).toHaveLength(1)
    expect(r.alerts[0]!.kind).toBe('price-drop')
    expect(r.alerts[0]!.delta_pct).toBe(-30)
  })

  it('stays quiet on small price wobble', async () => {
    const history = new InMemoryHistory()
    await history.insert({
      product_id: 'p1',
      captured_at: '2026-06-01T00:00:00Z',
      price: 100,
      currency: 'USD',
      in_stock: true,
    })
    const r = await runMonitor({
      products: [PRODUCT],
      fetchers: {
        amazon: fetcher([{
          product_id: 'p1',
          captured_at: '2026-06-02T00:00:00Z',
          price: 95,
          currency: 'USD',
          in_stock: true,
        }]),
      },
      history,
    })
    expect(r.alerts).toHaveLength(0)
  })

  it('emits back-in-stock when prior was OOS and snapshot is in stock', async () => {
    const history = new InMemoryHistory()
    await history.insert({
      product_id: 'p1',
      captured_at: '2026-06-01T00:00:00Z',
      price: 100,
      currency: 'USD',
      in_stock: false,
    })
    const r = await runMonitor({
      products: [PRODUCT],
      fetchers: {
        amazon: fetcher([{
          product_id: 'p1',
          captured_at: '2026-06-02T00:00:00Z',
          price: 100,
          currency: 'USD',
          in_stock: true,
        }]),
      },
      history,
    })
    expect(r.alerts.find((a) => a.kind === 'back-in-stock')).toBeTruthy()
  })

  it('catches per-product errors', async () => {
    const r = await runMonitor({
      products: [PRODUCT],
      fetchers: {
        amazon: {
          network: 'amazon',
          fetch: async () => {
            throw new Error('throttled')
          },
        },
      },
      history: new InMemoryHistory(),
    })
    expect(r.failed).toBe(1)
    expect(r.errors[0]!.error).toBe('throttled')
  })

  it('counts unrouted when no fetcher for network', async () => {
    const r = await runMonitor({
      products: [{ ...PRODUCT, network: 'generic' }],
      fetchers: {},
      history: new InMemoryHistory(),
    })
    expect(r.unrouted).toBe(1)
  })
})

describe('fallbackDraft', () => {
  const alert: AffiliateAlert = {
    kind: 'price-drop',
    product: PRODUCT,
    snapshot: {
      product_id: 'p1',
      captured_at: '2026-06-02',
      price: 70,
      currency: 'USD',
      in_stock: true,
    },
    prior: {
      product_id: 'p1',
      captured_at: '2026-06-01',
      price: 100,
      currency: 'USD',
      in_stock: true,
    },
    delta_pct: -30,
    generated_at: '2026-06-02T00:00:00Z',
  }
  it('produces a publishable body with the affiliate URL', () => {
    const d = fallbackDraft(PRODUCT, alert)
    expect(d.body).toContain('Acme Widget')
    expect(d.body).toContain('$70.00')
    expect(d.body).toContain(PRODUCT.affiliate_url)
    expect(d.title).toContain('Deal alert')
  })
})
