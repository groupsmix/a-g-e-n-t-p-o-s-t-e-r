import { describe, it, expect } from 'vitest'
import {
  MODEL_PRICING,
  UNKNOWN_MODEL_PRICE,
  estimateCostUsd,
  preflightEstimate,
} from './cost.js'

describe('estimateCostUsd', () => {
  it('returns 0 for no tokens', () => {
    expect(estimateCostUsd('claude-opus-4-7', 0, 0)).toBe(0)
    expect(estimateCostUsd(undefined, 1000, 1000)).toBe(0)
  })

  it('uses the model pricing table', () => {
    const expected =
      (1_000_000 / 1_000_000) * MODEL_PRICING['claude-haiku-4-5'].input +
      (500_000 / 1_000_000) * MODEL_PRICING['claude-haiku-4-5'].output
    expect(estimateCostUsd('claude-haiku-4-5', 1_000_000, 500_000)).toBeCloseTo(
      expected,
      5,
    )
  })

  it('falls back to UNKNOWN_MODEL_PRICE for unknown models', () => {
    const got = estimateCostUsd('made-up-model', 1_000_000, 0)
    expect(got).toBe(UNKNOWN_MODEL_PRICE.input)
  })

  it('preflightEstimate is identical to estimateCostUsd for the same inputs', () => {
    expect(preflightEstimate('gpt-5-mini', 10_000, 2_000)).toBe(
      estimateCostUsd('gpt-5-mini', 10_000, 2_000),
    )
  })

  it('rounds to 6 decimal places', () => {
    const got = estimateCostUsd('text-embedding-3-small', 1, 0)
    expect(got).toBe(Math.round(got * 1_000_000) / 1_000_000)
  })
})
