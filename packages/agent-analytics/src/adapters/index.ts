/**
 * Platform adapters for the analytics aggregator. Each adapter calls
 * its platform's analytics endpoint and projects the response onto
 * the canonical PostMetrics shape.
 *
 * Adapters are intentionally minimal: they take credentials in the
 * constructor and expose `fetch(postId, publishedAt)`. They throw on
 * auth failure; the collector catches per-post errors.
 *
 * Where a platform has no API access (TikTok organic reach, some
 * blog hosts), we expose a NoopAdapter that returns zeros — the
 * collector still records a snapshot so the post shows up in the
 * report, just with no movement.
 */

import type { AnalyticsAdapter, PostMetrics, Platform } from '../types'

export class XAnalyticsAdapter implements AnalyticsAdapter {
  readonly platform: Platform = 'x'
  constructor(private bearer: string) {}
  async fetch(postId: string): Promise<PostMetrics> {
    const url =
      `https://api.twitter.com/2/tweets/${encodeURIComponent(postId)}` +
      `?tweet.fields=public_metrics,non_public_metrics,organic_metrics`
    const r = await fetch(url, { headers: { authorization: `Bearer ${this.bearer}` } })
    if (!r.ok) throw new Error(`x analytics ${r.status}`)
    const json = (await r.json()) as {
      data?: {
        public_metrics?: {
          impression_count?: number
          like_count?: number
          reply_count?: number
          retweet_count?: number
          quote_count?: number
        }
        organic_metrics?: { impression_count?: number; url_link_clicks?: number }
      }
    }
    const pm = json.data?.public_metrics ?? {}
    const om = json.data?.organic_metrics ?? {}
    return {
      impressions: om.impression_count ?? pm.impression_count ?? 0,
      likes: pm.like_count ?? 0,
      comments: pm.reply_count ?? 0,
      shares: (pm.retweet_count ?? 0) + (pm.quote_count ?? 0),
      plays_or_opens: 0,
      clicks: om.url_link_clicks ?? -1,
    }
  }
}

export class LinkedInAnalyticsAdapter implements AnalyticsAdapter {
  readonly platform: Platform = 'linkedin'
  constructor(private token: string) {}
  async fetch(postId: string): Promise<PostMetrics> {
    const url =
      `https://api.linkedin.com/rest/socialActions/${encodeURIComponent(postId)}` +
      `?summary=true`
    const r = await fetch(url, {
      headers: {
        authorization: `Bearer ${this.token}`,
        'linkedin-version': '202401',
      },
    })
    if (!r.ok) throw new Error(`linkedin analytics ${r.status}`)
    const json = (await r.json()) as {
      likesSummary?: { totalLikes?: number }
      commentsSummary?: { totalFirstLevelComments?: number }
      sharesSummary?: { totalShares?: number }
      impressionCount?: number
    }
    return {
      impressions: json.impressionCount ?? 0,
      likes: json.likesSummary?.totalLikes ?? 0,
      comments: json.commentsSummary?.totalFirstLevelComments ?? 0,
      shares: json.sharesSummary?.totalShares ?? 0,
      plays_or_opens: 0,
      clicks: -1,
    }
  }
}

export class InstagramAnalyticsAdapter implements AnalyticsAdapter {
  readonly platform: Platform = 'instagram'
  constructor(private token: string) {}
  async fetch(postId: string): Promise<PostMetrics> {
    const url =
      `https://graph.facebook.com/v18.0/${encodeURIComponent(postId)}/insights` +
      `?metric=impressions,reach,likes,comments,shares,saved`
    const r = await fetch(url, { headers: { authorization: `Bearer ${this.token}` } })
    if (!r.ok) throw new Error(`instagram analytics ${r.status}`)
    const json = (await r.json()) as {
      data?: Array<{ name: string; values?: Array<{ value: number }> }>
    }
    const pick = (name: string): number =>
      json.data?.find((d) => d.name === name)?.values?.[0]?.value ?? 0
    return {
      impressions: pick('impressions'),
      likes: pick('likes'),
      comments: pick('comments'),
      shares: pick('shares'),
      plays_or_opens: pick('reach'),
      clicks: -1,
    }
  }
}

export class YouTubeAnalyticsAdapter implements AnalyticsAdapter {
  readonly platform: Platform = 'youtube'
  constructor(private apiKey: string) {}
  async fetch(postId: string): Promise<PostMetrics> {
    const url =
      `https://www.googleapis.com/youtube/v3/videos` +
      `?part=statistics&id=${encodeURIComponent(postId)}&key=${this.apiKey}`
    const r = await fetch(url)
    if (!r.ok) throw new Error(`youtube analytics ${r.status}`)
    const json = (await r.json()) as {
      items?: Array<{
        statistics?: {
          viewCount?: string
          likeCount?: string
          commentCount?: string
          favoriteCount?: string
        }
      }>
    }
    const s = json.items?.[0]?.statistics ?? {}
    return {
      impressions: Number(s.viewCount ?? 0),
      likes: Number(s.likeCount ?? 0),
      comments: Number(s.commentCount ?? 0),
      shares: 0,
      plays_or_opens: Number(s.viewCount ?? 0),
      clicks: -1,
    }
  }
}

export class NoopAnalyticsAdapter implements AnalyticsAdapter {
  constructor(public readonly platform: Platform) {}
  async fetch(): Promise<PostMetrics> {
    return {
      impressions: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      plays_or_opens: 0,
      clicks: -1,
    }
  }
}
