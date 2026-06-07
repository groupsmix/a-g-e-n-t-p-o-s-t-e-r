/**
 * Higher-level helpers built on top of the FirecrawlClient.
 *
 *   gatherContext(client, query)      → flatten search_and_scrape into prompt text
 *   harvestProductFacts(client, url)  → structured extract for product pages
 */

import type { FirecrawlClient } from '../types'

export async function gatherContext(client: FirecrawlClient, query: string, limit = 5): Promise<string> {
  const { pages } = await client.searchAndScrape({ query, limit })
  return pages
    .map((p, i) => `### Source ${i + 1}: ${p.title ?? p.url}\n${p.markdown.slice(0, 4000)}`)
    .join('\n\n')
}

export interface ProductFacts {
  title?: string
  price?: number
  currency?: string
  in_stock?: boolean
  rating?: number
  rating_count?: number
  description?: string
}

const PRODUCT_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    price: { type: 'number' },
    currency: { type: 'string' },
    in_stock: { type: 'boolean' },
    rating: { type: 'number' },
    rating_count: { type: 'number' },
    description: { type: 'string' },
  },
}

export async function harvestProductFacts(client: FirecrawlClient, url: string): Promise<ProductFacts> {
  return client.extractStructured<ProductFacts>({
    url,
    schema: PRODUCT_SCHEMA,
    prompt: 'Extract product price, stock status, rating, and a short description.',
  })
}
