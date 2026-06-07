/**
 * Adapters
 *   AmazonProductFetcher  — Amazon PA-API v5 GetItems.
 *   GenericProductFetcher — scrape JSON-LD <script type="application/ld+json"> from
 *                           the affiliate landing page (cheap, brittle, swappable).
 *   AnthropicReviewWriter — single-call Anthropic prompt that returns
 *                           {title, body} JSON.
 */

import type {
  Network,
  ProductFetcher,
  ProductSnapshot,
  ReviewDraft,
  ReviewWriterAdapter,
  TrackedProduct,
} from '../types'

export class GenericProductFetcher implements ProductFetcher {
  readonly network: Network = 'generic'
  async fetch(product: TrackedProduct): Promise<ProductSnapshot> {
    const r = await fetch(product.affiliate_url, {
      headers: { 'user-agent': 'posteragent-affiliate/1.0' },
    })
    if (!r.ok) throw new Error(`fetch ${r.status}`)
    const html = await r.text()
    const blocks = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)]
    let price = 0
    let currency = product.currency
    let inStock = true
    let rating: number | undefined
    let reviewCount: number | undefined
    for (const m of blocks) {
      try {
        const parsed = JSON.parse(m[1]!) as unknown
        const items = Array.isArray(parsed) ? parsed : [parsed]
        for (const it of items) {
          const obj = it as Record<string, unknown>
          const offers = obj.offers as Record<string, unknown> | undefined
          if (offers) {
            const p = Number(offers.price ?? offers.lowPrice ?? 0)
            if (p > 0) price = p
            if (typeof offers.priceCurrency === 'string') currency = offers.priceCurrency
            const avail = String(offers.availability ?? '')
            if (avail.toLowerCase().includes('outofstock')) inStock = false
          }
          const rating_ = (obj.aggregateRating as Record<string, unknown> | undefined) ?? undefined
          if (rating_) {
            const v = Number(rating_.ratingValue ?? 0)
            if (v > 0) rating = v
            const c = Number(rating_.reviewCount ?? rating_.ratingCount ?? 0)
            if (c > 0) reviewCount = c
          }
        }
      } catch {
        /* swallow per-block parse errors */
      }
    }
    return {
      product_id: product.id,
      captured_at: new Date().toISOString(),
      price,
      currency,
      in_stock: inStock,
      rating,
      review_count: reviewCount,
    }
  }
}

/**
 * AmazonProductFetcher uses PA-API v5 GetItems via a caller-supplied
 * signer (PA-API requires SigV4 + AccessKey/SecretKey). We expose the
 * minimal contract here and let the caller wire its preferred signer.
 */
export interface PAApiSigner {
  getItem(asin: string): Promise<{
    price: number
    currency: string
    in_stock: boolean
    rating?: number
    review_count?: number
    extra?: Record<string, string | number | boolean>
  }>
}

export class AmazonProductFetcher implements ProductFetcher {
  readonly network: Network = 'amazon'
  constructor(private signer: PAApiSigner) {}
  async fetch(product: TrackedProduct): Promise<ProductSnapshot> {
    const r = await this.signer.getItem(product.external_id)
    return {
      product_id: product.id,
      captured_at: new Date().toISOString(),
      price: r.price,
      currency: r.currency,
      in_stock: r.in_stock,
      rating: r.rating,
      review_count: r.review_count,
      extra: r.extra,
    }
  }
}

export class AnthropicReviewWriter implements ReviewWriterAdapter {
  constructor(
    private apiKey: string,
    private model = 'claude-sonnet-4-20250514',
  ) {}
  async draft(input: { product: TrackedProduct; alert: { kind: string; snapshot: ProductSnapshot; prior: ProductSnapshot | null } }): Promise<ReviewDraft> {
    const prompt = [
      'Write a short review post (<=180 words) for the deal below.',
      'Tone: honest, specific, no hype. End with a one-line CTA.',
      'Output JSON {"title":"...","body":"..."} with no markdown.',
      '',
      `PRODUCT: ${JSON.stringify(input.product)}`,
      `ALERT:   ${JSON.stringify(input.alert)}`,
    ].join('\n')
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 600,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!r.ok) throw new Error(`anthropic ${r.status}`)
    const json = (await r.json()) as { content?: Array<{ text?: string }> }
    const text = json.content?.[0]?.text ?? ''
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('no json')
    const parsed = JSON.parse(match[0]) as { title?: string; body?: string }
    return {
      product_id: input.product.id,
      alert_kind: input.alert.kind as ReviewDraft['alert_kind'],
      title: parsed.title ?? input.product.title,
      body: parsed.body ?? '',
      affiliate_url: input.product.affiliate_url,
      generated_at: new Date().toISOString(),
    }
  }
}
