import { describe, it, expect } from 'vitest'
import { collectAnalytics } from './collector'
import { InMemorySnapshotStore } from './storage'
import { classifyTrend, buildReport, engagementRate } from './analyser'
import type {
  AnalyticsAdapter,
  AnalyticsSnapshot,
  Platform,
  PostMetrics,
} from '../types'

function stubAdapter(platform: Platform, metrics: PostMetrics): AnalyticsAdapter {
  return {
    platform,
    fetch: async () => metrics,
  }
}

function throwingAdapter(platform: Platform, msg = 'boom'): AnalyticsAdapter {
  return {
    platform,
    fetch: async () => {
      throw new Error(msg)
    },
  }
}

describe('collectAnalytics', () => {
  it('routes by platform and writes snapshots', async () => {
    const store = new InMemorySnapshotStore()
    const r = await collectAnalytics({
      adapters: {
        x: stubAdapter('x', {
          impressions: 100,
          likes: 5,
          comments: 1,
          shares: 0,
          plays_or_opens: 0,
          clicks: -1,
        }),
      },
      store,
      posts: [
        { platform: 'x', post_id: 't1', published_at: null, job_id: 'j1' },
        { platform: 'x', post_id: 't2', published_at: null, job_id: 'j2' },
      ],
    })
    expect(r.succeeded).toBe(2)
    expect(r.failed).toBe(0)
    expect(store.all()).toHaveLength(2)
  })

  it('counts unrouted when no adapter for platform', async () => {
    const store = new InMemorySnapshotStore()
    const r = await collectAnalytics({
      adapters: {},
      store,
      posts: [{ platform: 'tiktok', post_id: 't1', published_at: null, job_id: 'j' }],
    })
    expect(r.unrouted).toBe(1)
    expect(r.succeeded).toBe(0)
  })

  it('catches per-post adapter errors and keeps going', async () => {
    const store = new InMemorySnapshotStore()
    const r = await collectAnalytics({
      adapters: {
        x: throwingAdapter('x'),
        youtube: stubAdapter('youtube', {
          impressions: 50,
          likes: 1,
          comments: 0,
          shares: 0,
          plays_or_opens: 50,
          clicks: -1,
        }),
      },
      store,
      posts: [
        { platform: 'x', post_id: 't1', published_at: null, job_id: 'j1' },
        { platform: 'youtube', post_id: 'v1', published_at: null, job_id: 'j2' },
      ],
    })
    expect(r.failed).toBe(1)
    expect(r.succeeded).toBe(1)
    expect(r.errors[0]!.platform).toBe('x')
  })

  it('respects maxPostsPerRun cap', async () => {
    const store = new InMemorySnapshotStore()
    const r = await collectAnalytics({
      adapters: {
        x: stubAdapter('x', { impressions: 1, likes: 0, comments: 0, shares: 0, plays_or_opens: 0, clicks: -1 }),
      },
      store,
      posts: Array.from({ length: 10 }, (_, i) => ({
        platform: 'x' as const,
        post_id: `t${i}`,
        published_at: null,
        job_id: `j${i}`,
      })),
      config: { maxPostsPerRun: 3 },
    })
    expect(r.attempted).toBe(3)
    expect(r.succeeded).toBe(3)
  })
})

describe('classifyTrend', () => {
  const mk = (impressions: number, capturedAt: string): AnalyticsSnapshot => ({
    platform: 'x',
    post_id: 't',
    captured_at: capturedAt,
    published_at: null,
    metrics: { impressions, likes: 0, comments: 0, shares: 0, plays_or_opens: 0, clicks: -1 },
  })

  it('classifies rising when impressions jump > 20%', () => {
    const t = classifyTrend([mk(100, '2026-06-01'), mk(140, '2026-06-02')])
    expect(t.kind).toBe('rising')
    expect(t.impressions_delta_pct).toBe(40)
  })

  it('classifies falling when impressions drop > 20%', () => {
    const t = classifyTrend([mk(100, '2026-06-01'), mk(70, '2026-06-02')])
    expect(t.kind).toBe('falling')
  })

  it('classifies flat for small swings', () => {
    const t = classifyTrend([mk(100, '2026-06-01'), mk(105, '2026-06-02')])
    expect(t.kind).toBe('flat')
  })

  it('classifies new when only one snapshot', () => {
    const t = classifyTrend([mk(100, '2026-06-01')])
    expect(t.kind).toBe('new')
    expect(t.impressions_delta_pct).toBeNull()
  })
})

describe('engagementRate', () => {
  it('returns 0 when impressions is 0', () => {
    const s: AnalyticsSnapshot = {
      platform: 'x',
      post_id: 't',
      captured_at: 'x',
      published_at: null,
      metrics: { impressions: 0, likes: 10, comments: 5, shares: 1, plays_or_opens: 0, clicks: -1 },
    }
    expect(engagementRate(s)).toBe(0)
  })

  it('sums likes + comments + shares over impressions', () => {
    const s: AnalyticsSnapshot = {
      platform: 'x',
      post_id: 't',
      captured_at: 'x',
      published_at: null,
      metrics: { impressions: 100, likes: 5, comments: 3, shares: 2, plays_or_opens: 0, clicks: -1 },
    }
    expect(engagementRate(s)).toBeCloseTo(0.1)
  })
})

describe('buildReport', () => {
  it('rolls up per-platform totals and selects top post', async () => {
    const store = new InMemorySnapshotStore()
    await store.insert({
      platform: 'x',
      post_id: 'big',
      captured_at: '2026-06-01T00:00:00Z',
      published_at: null,
      metrics: { impressions: 1000, likes: 50, comments: 10, shares: 5, plays_or_opens: 0, clicks: -1 },
    })
    await store.insert({
      platform: 'x',
      post_id: 'small',
      captured_at: '2026-06-01T00:00:00Z',
      published_at: null,
      metrics: { impressions: 100, likes: 1, comments: 0, shares: 0, plays_or_opens: 0, clicks: -1 },
    })
    const report = await buildReport(store, {
      windowDays: 365,
      now: () => new Date('2026-06-02T00:00:00Z'),
    })
    const x = report.by_platform.find((p) => p.platform === 'x')!
    expect(x.posts).toBe(2)
    expect(x.total_impressions).toBe(1100)
    expect(x.top_post?.post_id).toBe('big')
  })
})
