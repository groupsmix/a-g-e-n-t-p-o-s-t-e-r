/**
 * CoinGecko price adapter — free, no auth required.
 *
 *   GET https://api.coingecko.com/api/v3/simple/price
 *     ?ids={id}&vs_currencies=usd&include_24hr_change=true
 *
 * Symbol → CoinGecko id mapping: pass a `symbolMap` if your tickers
 * aren't the natural id (e.g. "BTC" → "bitcoin").
 */

import type { PriceSource, Quote } from '../types.js'

export interface CoinGeckoOptions {
  baseUrl?: string
  symbolMap?: Record<string, string>
  fetch?: typeof fetch
  apiKey?: string
}

const DEFAULT_MAP: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  USDT: 'tether',
  USDC: 'usd-coin',
  XRP: 'ripple',
}

export function createCoinGeckoPriceSource(
  opts: CoinGeckoOptions = {},
): PriceSource {
  const baseUrl = opts.baseUrl ?? 'https://api.coingecko.com/api/v3'
  const f = opts.fetch ?? globalThis.fetch
  const symbolMap = { ...DEFAULT_MAP, ...(opts.symbolMap ?? {}) }
  return {
    name: 'coingecko',
    supports: ['crypto'],
    async quote(input) {
      const id = symbolMap[input.symbol.toUpperCase()] ?? input.symbol.toLowerCase()
      const headers: Record<string, string> = {}
      if (opts.apiKey) headers['x-cg-pro-api-key'] = opts.apiKey
      const url = `${baseUrl}/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=usd&include_24hr_change=true`
      try {
        const res = await f(url, { headers, signal: input.signal })
        if (!res.ok) return undefined
        const json = (await res.json()) as Record<
          string,
          { usd?: number; usd_24h_change?: number }
        >
        const node = json[id]
        if (!node || node.usd == null) return undefined
        const quote: Quote = {
          symbol: input.symbol.toUpperCase(),
          assetClass: 'crypto',
          name: id,
          price: node.usd,
          currency: 'USD',
          changePct24h: node.usd_24h_change,
          asOf: new Date().toISOString(),
        }
        return quote
      } catch {
        return undefined
      }
    },
  }
}
