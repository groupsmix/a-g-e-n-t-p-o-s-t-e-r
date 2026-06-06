/**
 * Tavily search adapter — the best LLM-tuned search API as of June 2026.
 *
 * POST /search with { api_key, query, max_results, search_depth }.
 *
 * Why Tavily as default:
 *   - returns clean snippets (not raw HTML)
 *   - supports `search_depth: 'advanced'` for research-grade results
 *   - cheap, low rate-limit friction
 *
 * Falls back gracefully — the SearchClient contract returns [] on
 * provider errors so the searcher can record the gap.
 */

import type { SearchClient, SearchResult } from '../types.js'

export interface TavilyAdapterOptions {
  apiKey: string
  baseUrl?: string
  searchDepth?: 'basic' | 'advanced'
  fetch?: typeof fetch
}

export function createTavilySearch(opts: TavilyAdapterOptions): SearchClient {
  const baseUrl = opts.baseUrl ?? 'https://api.tavily.com'
  const f = opts.fetch ?? globalThis.fetch
  const depth = opts.searchDepth ?? 'advanced'

  return {
    name: 'tavily',
    async search(input) {
      const body = {
        api_key: opts.apiKey,
        query: input.query,
        max_results: input.maxResults ?? 6,
        search_depth: depth,
        include_answer: false,
        include_raw_content: false,
      }
      const res = await f(`${baseUrl}/search`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: input.signal,
      })
      if (!res.ok) {
        const err = await res.text().catch(() => res.statusText)
        throw new Error(`tavily ${res.status}: ${err.slice(0, 300)}`)
      }
      const json = (await res.json()) as TavilyResponse
      const results = json.results ?? []
      return results.map(
        (r, i): SearchResult => ({
          // Searcher re-ids; this is just the upstream stable id.
          id: `t${i + 1}`,
          title: r.title ?? '(no title)',
          url: r.url,
          snippet: (r.content ?? '').trim(),
          score: typeof r.score === 'number' ? r.score : undefined,
          publishedAt: r.published_date,
          source: 'tavily',
        }),
      )
    },
  }
}

interface TavilyResponse {
  results?: Array<{
    title?: string
    url: string
    content?: string
    score?: number
    published_date?: string
  }>
}
