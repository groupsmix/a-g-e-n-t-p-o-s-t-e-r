import { describe, it, expect } from 'vitest'
import { runContentPlanner } from './planner.js'
import { rankIdeas } from './ranker.js'
import { slotIntoCalendar } from './scheduler.js'

const brand = {
  niche: 'AI for solopreneurs',
  platforms: ['x', 'blog', 'newsletter'] as const,
  cadence: { x: 4, blog: 1, newsletter: 1 } as Record<string, number>,
  audience: 'indie hackers',
}

describe('rankIdeas', () => {
  it('clusters similar topics and ranks by score', async () => {
    const now = Date.now()
    const signals = [
      { topic: 'AI agents for solopreneurs', source: 'trend', score: 0.9, observedAt: now },
      { topic: 'solopreneur AI agents 2026', source: 'monitor', score: 0.5, observedAt: now - 3600_000 },
      { topic: 'Cooking tips for kids', source: 'research', score: 0.4, observedAt: now },
    ] as const
    const ideas = await rankIdeas([...signals], brand as any)
    expect(ideas.length).toBeLessThanOrEqual(3)
    // top idea should be the AI cluster (2 signals + niche match)
    expect(ideas[0]!.topic.toLowerCase()).toContain('solopreneur')
  })

  it('dampens novelty for recent topics', async () => {
    const now = Date.now()
    const sigs = [{ topic: 'AI agents', source: 'trend', score: 1, observedAt: now }] as const
    const fresh = await rankIdeas([...sigs], brand as any, {})
    const seen = await rankIdeas([...sigs], brand as any, { recentTopics: ['AI agents now'] })
    expect(fresh[0]!.score).toBeGreaterThan(seen[0]!.score)
  })
})

describe('slotIntoCalendar', () => {
  it('honours per-platform cadence and spreads days', () => {
    const ideas = Array.from({ length: 10 }, (_, i) => ({
      id: `i${i}`,
      topic: `t${i}`,
      angle: '',
      platforms: ['x', 'blog', 'newsletter'] as any,
      score: 1 - i * 0.05,
      fromSignals: [],
    }))
    const { schedule } = slotIntoCalendar(brand as any, ideas, new Date('2026-06-08T00:00:00Z'))
    expect(schedule.filter((s) => s.platform === 'x')).toHaveLength(4)
    expect(schedule.filter((s) => s.platform === 'blog')).toHaveLength(1)
    expect(schedule[0]!.publishAt).toMatch(/T0[8-9]:|T1[24]:/) // weekday hours
  })
})

describe('runContentPlanner end-to-end', () => {
  it('emits a schedule from pre-fetched signals', async () => {
    const cal = await runContentPlanner({
      brand: brand as any,
      signals: [
        { topic: 'AI solopreneur stack', source: 'trend', score: 0.8, observedAt: Date.now() },
        { topic: 'best AI for indie hackers', source: 'monitor', score: 0.7, observedAt: Date.now() },
        { topic: 'pricing AI products', source: 'research', score: 0.5, observedAt: Date.now() },
      ],
    })
    expect(cal.ideas.length).toBeGreaterThan(0)
    expect(cal.schedule.length).toBeGreaterThan(0)
  })
})
