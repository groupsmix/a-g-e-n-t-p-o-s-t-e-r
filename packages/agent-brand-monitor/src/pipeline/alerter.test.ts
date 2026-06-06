import { describe, it, expect } from 'vitest'
import { detectAlerts } from './alerter.js'
import { DEFAULT_CONFIG } from '../types.js'
import type { ScoredMention } from '../types.js'

const scored = (over: Partial<ScoredMention> = {}): ScoredMention => ({
  id: 'm001',
  platform: 'reddit',
  url: 'https://r.x/1',
  title: 't',
  text: 'b',
  sentiment: { label: 'neutral', confidence: 0.5 },
  virality: 0,
  isCompetitor: false,
  ...over,
})

describe('detectAlerts', () => {
  it('fires negative-spike when negatives meet threshold', () => {
    const arr = Array.from({ length: 5 }, (_, i) =>
      scored({
        id: `m${i}`,
        url: `https://x/${i}`,
        sentiment: { label: 'negative', confidence: 0.8 },
      }),
    )
    const alerts = detectAlerts({ scored: arr, config: DEFAULT_CONFIG })
    expect(alerts.some((a) => a.kind === 'negative-spike')).toBe(true)
  })

  it('does not fire negative-spike for competitor mentions only', () => {
    const arr = Array.from({ length: 5 }, (_, i) =>
      scored({
        id: `m${i}`,
        url: `https://x/${i}`,
        sentiment: { label: 'negative', confidence: 0.8 },
        isCompetitor: true,
      }),
    )
    const alerts = detectAlerts({ scored: arr, config: DEFAULT_CONFIG })
    expect(alerts.some((a) => a.kind === 'negative-spike')).toBe(false)
  })

  it('fires viral-mention only for brand mentions above threshold', () => {
    const arr = [
      scored({ id: 'a', virality: 80 }),
      scored({ id: 'b', virality: 80, isCompetitor: true }),
      scored({ id: 'c', virality: 20 }),
    ]
    const alerts = detectAlerts({ scored: arr, config: DEFAULT_CONFIG })
    const viral = alerts.filter((a) => a.kind === 'viral-mention')
    expect(viral).toHaveLength(1)
    expect(viral[0].mentionIds).toEqual(['a'])
  })

  it('fires competitor-action for high-virality competitor mentions', () => {
    const arr = [
      scored({
        id: 'c1',
        isCompetitor: true,
        virality: 50,
        matchedTerm: 'rival.co',
      }),
    ]
    const alerts = detectAlerts({ scored: arr, config: DEFAULT_CONFIG })
    expect(alerts.some((a) => a.kind === 'competitor-action')).toBe(true)
  })

  it('fires first-mention when exactly one brand mention exists', () => {
    const arr = [scored({ id: 'only', virality: 10 })]
    const alerts = detectAlerts({ scored: arr, config: DEFAULT_CONFIG })
    expect(alerts.some((a) => a.kind === 'first-mention')).toBe(true)
  })

  it('returns empty when nothing notable happens', () => {
    const alerts = detectAlerts({
      scored: [
        scored({ id: 'a' }),
        scored({ id: 'b', url: 'https://x/2' }),
        scored({ id: 'c', url: 'https://x/3' }),
      ],
      config: DEFAULT_CONFIG,
    })
    expect(alerts).toEqual([])
  })
})
