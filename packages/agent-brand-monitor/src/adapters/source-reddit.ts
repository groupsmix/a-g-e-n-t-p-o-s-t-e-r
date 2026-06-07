/**
 * Reddit search adapter (read-only, no auth required).
 *
 * Uses Reddit's public JSON search endpoint:
 *   GET https://www.reddit.com/search.json?q={term}&sort=new&t=day&limit={n}
 *
 * Reddit caps anonymous traffic — set `userAgent` to something
 * descriptive ("posteragent-monitor/0.1 by yourname") to avoid the
 * harsher rate limits. For higher volume, drop in `oauthToken`.
 *
 * Returns `[]` on any non-2xx so the scanner can still summarise
 * findings from other sources.
 */

import type { Mention, MentionSource } from '../types.js'

export interface RedditAdapterOptions {
  userAgent?: string
  oauthToken?: string
  fetch?: typeof fetch
}

export function createRedditSource(opts: RedditAdapterOptions = {}): MentionSource {
  const f = opts.fetch ?? globalThis.fetch
  const ua = opts.userAgent ?? 'posteragent-brand-monitor/0.1'

  return {
    name: 'reddit',
    platform: 'reddit',
    async scan(input) {
      const allMentions: Mention[] = []
      const t = pickTimeWindow(input.sinceHours ?? 24)
      const limit = input.maxResults ?? 25

      for (const term of input.terms) {
        const url =
          `https://www.reddit.com/search.json?q=${encodeURIComponent(term)}` +
          `&sort=new&t=${t}&limit=${limit}`
        const headers: Record<string, string> = { 'user-agent': ua }
        if (opts.oauthToken) headers.authorization = `Bearer ${opts.oauthToken}`

        try {
          const res = await f(url, { headers, signal: input.signal })
          if (!res.ok) continue
          const json = (await res.json()) as RedditResponse
          const children = json?.data?.children ?? []
          for (const c of children) {
            const d = c.data
            if (!d?.url) continue
            allMentions.push({
              id: d.id ?? d.url,
              platform: 'reddit',
              url: d.permalink
                ? `https://www.reddit.com${d.permalink}`
                : d.url,
              title: d.title ?? '(no title)',
              text: d.selftext ?? '',
              author: d.author,
              publishedAt: d.created_utc
                ? new Date(d.created_utc * 1000).toISOString()
                : undefined,
              engagement: {
                upvotes: d.ups,
                comments: d.num_comments,
              },
              matchedTerm: term,
            })
          }
        } catch {
          // swallow; scanner logs aggregate failures
        }
      }

      return allMentions
    },
  }
}

function pickTimeWindow(hours: number): 'hour' | 'day' | 'week' | 'month' {
  if (hours <= 1) return 'hour'
  if (hours <= 24) return 'day'
  if (hours <= 24 * 7) return 'week'
  return 'month'
}

interface RedditResponse {
  data?: {
    children?: Array<{
      data?: {
        id?: string
        title?: string
        selftext?: string
        url?: string
        permalink?: string
        author?: string
        created_utc?: number
        ups?: number
        num_comments?: number
      }
    }>
  }
}
