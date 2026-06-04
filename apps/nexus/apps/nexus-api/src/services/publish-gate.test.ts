import { describe, it, expect } from 'vitest'
import { decidePublishTier, DEFAULT_GATE } from './publish-gate'

describe('publish gate: tiered scoring rule', () => {
  it('rejects scores below 7.5', () => {
    for (const score of [0, 5, 7.4, 7.49]) {
      const d = decidePublishTier(score)
      expect(d.tier).toBe('reject')
      expect(d.status).toBe('rejected')
      expect(d.publishEligible).toBe(false)
    }
  })

  it('drafts scores in the 7.5-8.4 band', () => {
    for (const score of [7.5, 7.9, 8.0, 8.4, 8.49]) {
      const d = decidePublishTier(score)
      expect(d.tier).toBe('draft')
      expect(d.status).toBe('approved')
      expect(d.publishEligible).toBe(false)
    }
  })

  it('marks scores 8.5+ as publish-eligible', () => {
    for (const score of [8.5, 9, 10]) {
      const d = decidePublishTier(score)
      expect(d.tier).toBe('publish')
      expect(d.status).toBe('approved')
      expect(d.publishEligible).toBe(true)
    }
  })

  it('exact boundaries: 7.5 drafts, 8.5 publishes', () => {
    expect(decidePublishTier(7.5).tier).toBe('draft')
    expect(decidePublishTier(8.5).tier).toBe('publish')
  })

  it('honors a higher min-score floor', () => {
    // floor 8.0 forces an otherwise-draftable 7.6 to reject
    expect(decidePublishTier(7.6, DEFAULT_GATE, 8.0).tier).toBe('reject')
    // floor below the band leaves the tier unchanged
    expect(decidePublishTier(7.6, DEFAULT_GATE, 5).tier).toBe('draft')
  })

  it('respects custom thresholds', () => {
    const custom = { rejectBelow: 6, publishAt: 9 }
    expect(decidePublishTier(5.9, custom).tier).toBe('reject')
    expect(decidePublishTier(6, custom).tier).toBe('draft')
    expect(decidePublishTier(8.9, custom).tier).toBe('draft')
    expect(decidePublishTier(9, custom).tier).toBe('publish')
  })

  it('swaps inverted thresholds instead of dropping a tier', () => {
    const inverted = { rejectBelow: 9, publishAt: 6 }
    // After normalization: reject < 6, draft 6-8.9, publish 9+
    expect(decidePublishTier(5, inverted).tier).toBe('reject')
    expect(decidePublishTier(7, inverted).tier).toBe('draft')
    expect(decidePublishTier(9, inverted).tier).toBe('publish')
  })

  it('treats non-finite scores as 0 (reject)', () => {
    expect(decidePublishTier(NaN).tier).toBe('reject')
  })
})
