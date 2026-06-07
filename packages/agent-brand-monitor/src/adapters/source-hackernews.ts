/**
 * Hacker News adapter — Algolia search API (no auth, generous limits).
 *
 *   GET https://hn.algolia.com/api/v1/search_by_date?query={term}&numericFilters=created_at_i>{ts}
 *
 * Algolia returns posts + comments. We surface both: comments often
 * carry the most useful sentiment signal on HN.
 */

import type { Mention, MentionSource } from '../types.js'

export interface HackerNewsAdapterOptions {
  fetch?: typeof fetch
}

export function createHackerNewsSource(
  opts: HackerNewsAdapterOptions = {},
): MentionSource {
  const f = opts.fetch ?? globalThis.fetch
  return {
    name: 'hackernews',
    platform: 'hackernews',
    async scan(input) {
      const sinceTs = Math.floor(
        (Date.now() - (input.sinceHours ?? 24) * 3600 * 1000) / 1000,
      )
      const limit = input.maxResults ?? 25
      const all: Mention[] = []
      for (const term of input.terms) {
        const url =
          `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(term)}` +
          `&numericFilters=created_at_i>${sinceTs}` +
          `&hitsPerPage=${limit}`
        try {
          const res = await f(url, { signal: input.signal })
          if (!res.ok) continue
          const json = (await res.json()) as HNResponse
          for (const h of json.hits ?? []) {
            const isComment = h._tags?.includes('comment')
            const itemUrl = `https://news.ycombinator.com/item?id=${h.objectID}`
            all.push({
              id: h.objectID,
              platform: 'hackernews',
              url: itemUrl,
              title: h.title ?? h.story_title ?? '(comment)',
              text: stripHtml(h.story_text ?? h.comment_text ?? ''),
              author: h.author,
              publishedAt: h.created_at,
              engagement: {
                upvotes: h.points,
                comments: h.num_comments,
              },
              matchedTerm: term,
            })
            if (isComment) continue
          }
        } catch {
          // skip
        }
      }
      return all
    },
  }
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

interface HNResponse {
  hits?: Array<{
    objectID: string
    title?: string
    story_title?: string
    story_text?: string
    comment_text?: string
    author?: string
    created_at?: string
    points?: number
    num_comments?: number
    _tags?: string[]
  }>
}
