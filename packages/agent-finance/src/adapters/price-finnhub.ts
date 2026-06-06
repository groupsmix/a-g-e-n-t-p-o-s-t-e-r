/**
 * Finnhub stock quote adapter.
 *
 *   GET https://finnhub.io/api/v1/quote?symbol={symbol}&token={key}
 *
 * Returns { c, dp, ... } — c = current, dp = % change. Lightweight,
 * generous free tier. Drop in Alpha Vantage / Polygon by swapping
 * this adapter — same PriceSource shape.
 */

import type { PriceSource, Quote } from '../types.js'

export interface FinnhubOptions {
  apiKey: string
  baseUrl?: string
  fetch?: typeof fetch
}

export function createFinnhubPriceSource(opts: FinnhubOptions): PriceSource {
  const baseUrl = opts.baseUrl ?? 'https://finnhub.io/api/v1'
  const f = opts.fetch ?? globalThis.fetch
  return {
    name: 'finnhub',
    supports: ['stock'],
    async quote(input) {
      try {
        const res = await f(
          `${baseUrl}/quote?symbol=${encodeURIComponent(input.symbol)}&token=${opts.apiKey}`,
          { signal: input.signal },
        )
        if (!res.ok) return undefined
        const json = (await res.json()) as FinnhubQuote
        if (json.c == null) return undefined
        const quote: Quote = {
          symbol: input.symbol.toUpperCase(),
          assetClass: 'stock',
          price: json.c,
          currency: 'USD',
          changePct24h: json.dp ?? undefined,
          asOf: new Date().toISOString(),
        }
        return quote
      } catch {
        return undefined
      }
    },
  }
}

interface FinnhubQuote {
  c?: number
  dp?: number
}
