/**
 * Source adapters for the lead scraper. Each adapter takes the
 * ScrapeQuery and projects per-source responses onto RawLead. They
 * throw on hard auth failures; the scraper catches per-source errors.
 *
 * Adapters intentionally make minimal network calls (single search
 * endpoint per platform) so the per-tick cost is bounded.
 */

import type { LeadSourceAdapter, RawLead, ScrapeQuery } from '../types'

function matched(text: string, terms: string[]): string[] {
  const lower = text.toLowerCase()
  return terms.filter((t) => lower.includes(t.toLowerCase()))
}

// ── Reddit ─────────────────────────────────────────────────────────────────
export class RedditLeadAdapter implements LeadSourceAdapter {
  readonly source = 'reddit' as const
  constructor(private opts: { userAgent: string } = { userAgent: 'posteragent-leads/1.0' }) {}
  async fetch(query: ScrapeQuery): Promise<RawLead[]> {
    const limit = query.limitPerSource ?? 25
    const q = encodeURIComponent(query.terms.join(' OR '))
    const url = `https://www.reddit.com/search.json?q=${q}&sort=new&limit=${limit}`
    const r = await fetch(url, { headers: { 'user-agent': this.opts.userAgent } })
    if (!r.ok) throw new Error(`reddit ${r.status}`)
    const json = (await r.json()) as {
      data?: { children?: Array<{ data?: Record<string, unknown> }> }
    }
    const out: RawLead[] = []
    for (const c of json.data?.children ?? []) {
      const d = c.data ?? {}
      const text = `${d.title ?? ''}\n${d.selftext ?? ''}`.trim()
      if (!text) continue
      const m = matched(text, query.terms)
      if (m.length === 0) continue
      const created = typeof d.created_utc === 'number' ? d.created_utc * 1000 : Date.now()
      out.push({
        source: 'reddit',
        source_id: String(d.id ?? d.name ?? ''),
        author: String(d.author ?? 'unknown'),
        text,
        url: d.permalink ? `https://www.reddit.com${d.permalink}` : String(d.url ?? ''),
        posted_at: new Date(created).toISOString(),
        matched_terms: m,
        extra: {
          subreddit: String(d.subreddit ?? ''),
          score: Number(d.score ?? 0),
          comments: Number(d.num_comments ?? 0),
        },
      })
    }
    return out
  }
}

// ── X ─────────────────────────────────────────────────────────────────────
export class XLeadAdapter implements LeadSourceAdapter {
  readonly source = 'x' as const
  constructor(private bearer: string) {}
  async fetch(query: ScrapeQuery): Promise<RawLead[]> {
    const max = Math.min(query.limitPerSource ?? 25, 100)
    const q = encodeURIComponent(query.terms.join(' OR ') + ' -is:retweet lang:en')
    const url =
      `https://api.twitter.com/2/tweets/search/recent?query=${q}&max_results=${max}` +
      `&tweet.fields=created_at,public_metrics,author_id&expansions=author_id&user.fields=username,description`
    const r = await fetch(url, { headers: { authorization: `Bearer ${this.bearer}` } })
    if (!r.ok) throw new Error(`x ${r.status}`)
    const json = (await r.json()) as {
      data?: Array<{
        id: string
        text: string
        author_id?: string
        created_at?: string
        public_metrics?: { like_count?: number; reply_count?: number }
      }>
      includes?: { users?: Array<{ id: string; username: string; description?: string }> }
    }
    const users = new Map<string, { username: string; description?: string }>()
    for (const u of json.includes?.users ?? []) users.set(u.id, u)
    const out: RawLead[] = []
    for (const t of json.data ?? []) {
      const m = matched(t.text, query.terms)
      if (m.length === 0) continue
      const u = t.author_id ? users.get(t.author_id) : undefined
      out.push({
        source: 'x',
        source_id: t.id,
        author: u?.username ?? 'unknown',
        author_bio: u?.description,
        text: t.text,
        url: `https://x.com/${u?.username ?? 'i'}/status/${t.id}`,
        posted_at: t.created_at ?? new Date().toISOString(),
        matched_terms: m,
        extra: {
          likes: t.public_metrics?.like_count ?? 0,
          replies: t.public_metrics?.reply_count ?? 0,
        },
      })
    }
    return out
  }
}

// ── Hacker News (Algolia) ─────────────────────────────────────────────────
export class HackerNewsLeadAdapter implements LeadSourceAdapter {
  readonly source = 'hackernews' as const
  async fetch(query: ScrapeQuery): Promise<RawLead[]> {
    const limit = query.limitPerSource ?? 25
    const q = encodeURIComponent(query.terms.join(' '))
    const url = `https://hn.algolia.com/api/v1/search_by_date?query=${q}&tags=(story,comment)&hitsPerPage=${limit}`
    const r = await fetch(url)
    if (!r.ok) throw new Error(`hn ${r.status}`)
    const json = (await r.json()) as {
      hits?: Array<{
        objectID: string
        author?: string
        title?: string
        story_text?: string
        comment_text?: string
        url?: string
        created_at?: string
        points?: number
        num_comments?: number
      }>
    }
    const out: RawLead[] = []
    for (const h of json.hits ?? []) {
      const text = (h.title ?? h.story_text ?? h.comment_text ?? '').trim()
      if (!text) continue
      const m = matched(text, query.terms)
      if (m.length === 0) continue
      out.push({
        source: 'hackernews',
        source_id: h.objectID,
        author: h.author ?? 'unknown',
        text,
        url: h.url ?? `https://news.ycombinator.com/item?id=${h.objectID}`,
        posted_at: h.created_at ?? new Date().toISOString(),
        matched_terms: m,
        extra: {
          points: h.points ?? 0,
          comments: h.num_comments ?? 0,
        },
      })
    }
    return out
  }
}

// ── ProductHunt (GraphQL minimal) ─────────────────────────────────────────
export class ProductHuntLeadAdapter implements LeadSourceAdapter {
  readonly source = 'producthunt' as const
  constructor(private token: string) {}
  async fetch(query: ScrapeQuery): Promise<RawLead[]> {
    const r = await fetch('https://api.producthunt.com/v2/api/graphql', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        query: `query Search($q: String!) {
          posts(first: ${query.limitPerSource ?? 20}, postedAfter: "${query.sinceIso ?? ''}") {
            edges { node { id name tagline votesCount commentsCount createdAt url user { username } } }
          }
        }`,
        variables: { q: query.terms.join(' ') },
      }),
    })
    if (!r.ok) throw new Error(`producthunt ${r.status}`)
    const json = (await r.json()) as {
      data?: { posts?: { edges?: Array<{ node?: Record<string, unknown> }> } }
    }
    const out: RawLead[] = []
    for (const e of json.data?.posts?.edges ?? []) {
      const n = e.node ?? {}
      const text = `${n.name ?? ''} — ${n.tagline ?? ''}`.trim()
      const m = matched(text, query.terms)
      if (m.length === 0) continue
      out.push({
        source: 'producthunt',
        source_id: String(n.id ?? ''),
        author: String((n.user as { username?: string })?.username ?? 'unknown'),
        text,
        url: String(n.url ?? ''),
        posted_at: String(n.createdAt ?? new Date().toISOString()),
        matched_terms: m,
        extra: {
          upvotes: Number(n.votesCount ?? 0),
          comments: Number(n.commentsCount ?? 0),
        },
      })
    }
    return out
  }
}

// ── YouTube comments ──────────────────────────────────────────────────────
export class YouTubeCommentLeadAdapter implements LeadSourceAdapter {
  readonly source = 'youtube' as const
  constructor(private apiKey: string, private videoIds: string[]) {}
  async fetch(query: ScrapeQuery): Promise<RawLead[]> {
    const out: RawLead[] = []
    for (const vid of this.videoIds.slice(0, 5)) {
      const url =
        `https://www.googleapis.com/youtube/v3/commentThreads` +
        `?part=snippet&videoId=${vid}&maxResults=${query.limitPerSource ?? 25}&key=${this.apiKey}`
      const r = await fetch(url)
      if (!r.ok) continue
      const json = (await r.json()) as {
        items?: Array<{ id: string; snippet?: { topLevelComment?: { snippet?: Record<string, unknown> } } }>
      }
      for (const it of json.items ?? []) {
        const s = it.snippet?.topLevelComment?.snippet ?? {}
        const text = String(s.textOriginal ?? s.textDisplay ?? '').trim()
        if (!text) continue
        const m = matched(text, query.terms)
        if (m.length === 0) continue
        out.push({
          source: 'youtube',
          source_id: it.id,
          author: String(s.authorDisplayName ?? 'unknown'),
          text,
          url: String(s.authorChannelUrl ?? `https://www.youtube.com/watch?v=${vid}`),
          posted_at: String(s.publishedAt ?? new Date().toISOString()),
          matched_terms: m,
          extra: { video_id: vid, likes: Number(s.likeCount ?? 0) },
        })
      }
    }
    return out
  }
}

// ── LinkedIn (stub — public API gates lead search behind sales partner) ───
export class LinkedInLeadAdapterStub implements LeadSourceAdapter {
  readonly source = 'linkedin' as const
  async fetch(): Promise<RawLead[]> {
    // LinkedIn doesn't expose a public lead-search API. Real
    // implementation needs Sales Navigator partner credentials. We
    // ship the adapter shape so callers can wire something in.
    return []
  }
}
