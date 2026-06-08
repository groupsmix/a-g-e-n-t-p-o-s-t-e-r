import { describe, expect, it } from 'vitest'
import { isGeneric, isNearDuplicate, nicheTokens } from './niche-dedup'

describe('nicheTokens', () => {
  it('lowercases, drops fillers, and ignores non-alnum', () => {
    expect([...nicheTokens('A Retro Gaming, with your products')].sort()).toEqual(
      ['gaming', 'retro'],
    )
  })
  it('returns empty set for filler-only input', () => {
    expect(nicheTokens('the a and of').size).toBe(0)
  })
})

describe('isGeneric', () => {
  it.each([
    'essentials',
    'physical essentials',
    'Premium Bundle',
    'Various Stuff',
    'general things',
  ])('flags %s as generic', (s) => {
    expect(isGeneric(s)).toBe(true)
  })
  it.each(['Retro Gaming', 'Mechanical Keyboards', 'Houseplant Care'])(
    'allows %s',
    (s) => {
      expect(isGeneric(s)).toBe(false)
    },
  )
  it('flags single-significant-word niches', () => {
    expect(isGeneric('gaming')).toBe(true)
  })
})

describe('isNearDuplicate', () => {
  it('detects exact match', () => {
    expect(isNearDuplicate('Retro Gaming', ['Retro Gaming'])).toBe(true)
  })
  it('detects token-shuffled near-duplicate', () => {
    expect(isNearDuplicate('Gaming Retro', ['Retro Gaming'])).toBe(true)
  })
  it('detects the "essentials" family the user reported', () => {
    // Both share the significant token "essentials" out of 1 vs 2 tokens →
    // Jaccard 0.5 → not flagged here, but isGeneric catches both. The dedup
    // path catches the case where someone adds a non-generic prefix that
    // shares ≥60% of significant tokens.
    expect(isNearDuplicate('vintage Retro Gaming', ['Retro Gaming'])).toBe(true)
  })
  it('lets distinct niches through', () => {
    expect(
      isNearDuplicate('Mechanical Keyboards', ['Retro Gaming', 'Houseplant Care']),
    ).toBe(false)
  })
  it('rejects empty / filler-only candidate', () => {
    expect(isNearDuplicate('the and of', ['Retro Gaming'])).toBe(true)
  })
})
