import { describe, expect, it } from 'vitest'
import { flagsToIssues, screenFields, screenText } from './brand-safety'

describe('screenText', () => {
  it('passes ordinary marketing copy', () => {
    const r = screenText(
      'This killer deal on our soft unisex tee ships free. Check the size chart before ordering!',
    )
    expect(r.pass).toBe(true)
    expect(r.flags).toHaveLength(0)
  })

  it('passes empty input', () => {
    expect(screenText('').pass).toBe(true)
  })

  it('flags medical cure claims', () => {
    const r = screenText('Our turmeric blend cures cancer naturally.')
    expect(r.pass).toBe(false)
    expect(r.flags[0]?.category).toBe('medical-claims')
  })

  it('flags unrealistic weight-loss promises', () => {
    const r = screenText('Lose 20 pounds in 5 days with this one trick')
    expect(r.pass).toBe(false)
    expect(r.flags[0]?.category).toBe('medical-claims')
  })

  it('flags guaranteed-returns financial claims', () => {
    const r = screenText('Guaranteed returns of 20% monthly. Risk-free profits!')
    expect(r.pass).toBe(false)
    expect(r.flags.map((f) => f.category)).toContain('financial-claims')
  })

  it('flags self-harm phrasing', () => {
    const r = screenText('just kys lol')
    expect(r.pass).toBe(false)
    expect(r.flags[0]?.category).toBe('violence')
  })

  it('does not flag benign uses of risky single words', () => {
    expect(screenText('Shooting a video for our new mug today').pass).toBe(true)
    expect(screenText('This design absolutely kills it on dark tees').pass).toBe(true)
    expect(screenText('Win big with our cozy blanket giveaway').pass).toBe(true)
  })

  it('collects multiple flags in one pass', () => {
    const r = screenText('Miracle cure! Guaranteed returns! Double your money!')
    expect(r.flags.length).toBeGreaterThanOrEqual(2)
  })

  it('includes a snippet for the review UI', () => {
    const r = screenText(
      'Lots of text before the problem part. This supplement is a miracle cure for everything. And lots after.',
    )
    expect(r.flags[0]?.snippet).toContain('miracle cure')
  })
})

describe('screenFields', () => {
  it('screens every field including arrays', () => {
    const r = screenFields({
      title: 'Nice clean title',
      description: 'guaranteed profits every single day',
      tags: ['cozy', 'fda-approved supplement'],
    })
    expect(r.pass).toBe(false)
    expect(r.flags.length).toBeGreaterThanOrEqual(2)
  })

  it('ignores null/undefined fields', () => {
    expect(screenFields({ a: null, b: undefined, c: 'all good here' }).pass).toBe(true)
  })
})

describe('flagsToIssues', () => {
  it('renders human-readable issues', () => {
    const issues = flagsToIssues(screenText('miracle cure in a bottle'))
    expect(issues[0]).toMatch(/Brand safety \[medical-claims\]/)
  })
})
