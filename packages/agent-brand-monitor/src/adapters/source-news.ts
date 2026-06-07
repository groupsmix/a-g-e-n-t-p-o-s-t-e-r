/**
 * Google News adapter — backed by NewsAPI.org (or any drop-in
 * compatible service: GDELT, NewsCatcher, Mediastack).
 *
 *   GET https://newsapi.org/v2/everything?q={term}&from={iso}&sortBy=publishedAt
 *
 * NewsAPI free tier requires HTTPS and only returns recent results,
 * which is exactly what brand monitoring needs.
 */

import type { Mention, MentionSource } from '../types.js'

export interface NewsAdapterOptions {
  apiKey: string
  baseUrl?: string
  language?: string
  fetch?: typeof fetch
}

export function createNewsSource(opts: NewsAdapterOptions): MentionSource {
  const baseUrl = opts.baseUrl ?? 'https://newsapi.org/v2'
  const f = opts.fetch ?? globalThis.fetch
  const lang = opts.language ?? 'en'

  return {
    name: 'newsapi',
    platform: 'news',
    async scan(input) {
      const fromIso = new Date(
        Date.now() - (input.sinceHours ?? 24) * 3600 * 1000,
      ).toISOString()
      const limit = input.maxResults ?? 25
      const all: Mention[] = []
      for (const term of input.terms) {
        const url =
          `${baseUrl}/everything?q=${encodeURIComponent(`"${term}"`)}` +
          `&from=${encodeURIComponent(fromIso)}` +
          `&language=${lang}&sortBy=publishedAt&pageSize=${limit}`
        try {
          const res = await f(url, {
            headers: { 'x-api-key': opts.apiKey },
            signal: input.signal,
          })
          if (!res.ok) continue
          const json = (await res.json()) as NewsResponse
          for (const a of json.articles ?? []) {
            if (!a.url) continue
            all.push({
              id: a.url,
              platform: 'news',
              url: a.url,
              title: a.title ?? '(no title)',
              text: a.description ?? a.content ?? '',
              author: a.author ?? a.source?.name,
              publishedAt: a.publishedAt,
              matchedTerm: term,
            })
          }
        } catch {
          // skip
        }
      }
      return all
    },
  }
}

interface NewsResponse {
  articles?: Array<{
    title?: string
    description?: string
    content?: string
    url?: string
    author?: string
    publishedAt?: string
    source?: { name?: string }
  }>
}
