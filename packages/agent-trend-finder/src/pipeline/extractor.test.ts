import { describe, it, expect } from 'vitest'
import {
  extractTitlePatterns,
  extractThumbnailPatterns,
  extractVelocity,
  extractHooks,
} from './extractor.js'
import type { Video } from '../types.js'

const v = (over: Partial<Video> = {}): Video => ({
  id: 'a',
  url: 'https://yt/a',
  title: 't',
  description: '',
  niche: 'ai',
  views: 1000,
  publishedAt: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
  ...over,
})

describe('extractTitlePatterns', () => {
  it('buckets common templates', () => {
    const patterns = extractTitlePatterns([
      v({ id: '1', title: 'How to build agents fast' }),
      v({ id: '2', title: 'How to ship in 30 days' }),
      v({ id: '3', title: 'I tried Cursor for 7 days' }),
      v({ id: '4', title: 'GPT vs Claude' }),
    ])
    const labels = patterns.map((p) => p.template)
    expect(labels).toContain('How to X')
    expect(labels).toContain('I tried X (for Y)')
    expect(labels).toContain('X vs Y')
  })

  it('falls back to Other', () => {
    const p = extractTitlePatterns([v({ id: 'x', title: 'random title' })])
    expect(p[0].template).toBe('Other')
  })
})

describe('extractVelocity', () => {
  it('produces views per hour', () => {
    const vel = extractVelocity([
      v({ id: 'a', views: 24000, publishedAt: new Date(Date.now() - 24 * 3600 * 1000).toISOString() }),
    ])
    expect(vel[0].viewsPerHour).toBeGreaterThan(900)
    expect(vel[0].viewsPerHour).toBeLessThan(1100)
  })
})

describe('extractThumbnailPatterns', () => {
  it('groups by thumbnail kind', () => {
    const ps = extractThumbnailPatterns([
      v({ id: 'a', thumbnailUrl: 'https://i.ytimg.com/vi/x/maxresdefault.jpg' }),
      v({ id: 'b', thumbnailUrl: 'https://i.ytimg.com/vi/x/hqdefault.jpg' }),
    ])
    expect(ps.map((p) => p.kind).sort()).toEqual(['auto-grab', 'high-res-stock'])
  })
})

describe('extractHooks', () => {
  it('uses title heuristic when no transcript source', async () => {
    const hooks = await extractHooks({
      videos: [
        v({ id: 'a', title: 'How do I do X?' }),
        v({ id: 'b', title: 'This is going to change everything' }),
        v({ id: 'c', title: '5 things you should know' }),
      ],
    })
    const kinds = hooks.map((h) => h.kind)
    expect(kinds).toEqual(expect.arrayContaining(['question', 'cold-open-claim']))
  })
})
