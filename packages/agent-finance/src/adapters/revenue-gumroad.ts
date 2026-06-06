/**
 * Gumroad revenue adapter.
 *
 *   GET https://api.gumroad.com/v2/sales?access_token={token}&after={iso}
 *
 * Paginates via Gumroad's cursor; returns RevenueEntry[] in our shape.
 */

import type { RevenueEntry, RevenueSource } from '../types.js'

export interface GumroadOptions {
  accessToken: string
  baseUrl?: string
  fetch?: typeof fetch
}

export function createGumroadRevenueSource(opts: GumroadOptions): RevenueSource {
  const baseUrl = opts.baseUrl ?? 'https://api.gumroad.com/v2'
  const f = opts.fetch ?? globalThis.fetch
  return {
    name: 'gumroad',
    async fetchEntries(input) {
      const all: RevenueEntry[] = []
      let pageKey: string | undefined
      // Cap at 5 pages so a misconfig doesn't run forever.
      for (let page = 0; page < 5; page++) {
        const params = new URLSearchParams({
          access_token: opts.accessToken,
          after: input.sinceIso.slice(0, 10),
        })
        if (pageKey) params.set('page_key', pageKey)
        try {
          const res = await f(`${baseUrl}/sales?${params.toString()}`, {
            signal: input.signal,
          })
          if (!res.ok) break
          const json = (await res.json()) as GumroadResponse
          for (const sale of json.sales ?? []) {
            if (!sale.id) continue
            all.push({
              id: `gumroad:${sale.id}`,
              source: 'gumroad',
              postedAt: sale.created_at ?? new Date().toISOString(),
              amountUsd: dollarsFromCents(sale.price ?? 0),
              kind: sale.refunded ? 'refund' : 'sale',
              description: sale.product_name,
            })
          }
          if (!json.next_page_key) break
          pageKey = json.next_page_key
        } catch {
          break
        }
      }
      return all
    },
  }
}

function dollarsFromCents(cents: number): number {
  return Math.round(cents) / 100
}

interface GumroadResponse {
  sales?: Array<{
    id?: string
    product_name?: string
    created_at?: string
    price?: number
    refunded?: boolean
  }>
  next_page_key?: string
}
