import { describe, it, expect } from 'vitest'
import { clusterTopics } from './cluster.js'
import { findGaps } from './gap-finder.js'
import { DEFAULT_CONFIG } from '../types.js'
import type { Video } from '../types.js'

const v = (id: string, niche: string, title: string, views = 1000): Video => ({
  id,
  url: `https://yt/${id}`,
  title,
  description: '',
  niche,
  views,
  publishedAt: new Date(Date.now() - 36 * 3600 * 1000).toISOString(),
})

describe('clusterTopics (keyword)', () => {
  it('groups videos sharing a keyword in the same cluster', async () => {
    const out = await clusterTopics({
      videos: [
        v('1', 'ai', 'building agents with claude', 5000),
        v('2', 'ai', 'agents that ship code', 7000),
        v('3', 'ai', 'agents tutorial', 6000),
        v('4', 'ai', 'prompts that work', 2000),
      ],
      config: DEFAULT_CONFIG,
    })
    const labels = out.clusters.map((c) => c.label)
    expect(labels).toContain('agents')
  })

  it('respects niche separation', async () => {
    const out = await clusterTopics({
      videos: [
        v('1', 'ai', 'agents tutorial', 5000),
        v('2', 'ai', 'agents framework', 6000),
        v('3', 'crypto', 'agents in defi', 1000),
        v('4', 'crypto', 'agents pumping coins', 800),
      ],
      config: DEFAULT_CONFIG,
    })
    for (const c of out.clusters) {
      const niches = new Set(
        c.videoIds.map((id) => (id.startsWith('1') || id.startsWith('2') ? 'ai' : 'crypto')),
      )
      expect(niches.size).toBe(1)
    }
  })
})

describe('findGaps', () => {
  it('flags few-results clusters as gaps', () => {
    const clusters = [
      {
        id: 'ai-c1',
        niche: 'ai',
        label: 'agents',
        videoIds: ['1', '2'],
        totalViews: 12000,
        medianViews: 6000,
      },
    ]
    const videos = [
      v('1', 'ai', 'building agents', 6000),
      v('2', 'ai', 'agents tutorial', 6000),
    ]
    const velocity = [
      { videoId: '1', viewsPerHour: 100, engagementRate: 0.001 },
      { videoId: '2', viewsPerHour: 80, engagementRate: 0.001 },
    ]
    const gaps = findGaps({ clusters, videos, velocity, config: DEFAULT_CONFIG })
    expect(gaps.some((g) => g.reason === 'few-results')).toBe(true)
  })
})
