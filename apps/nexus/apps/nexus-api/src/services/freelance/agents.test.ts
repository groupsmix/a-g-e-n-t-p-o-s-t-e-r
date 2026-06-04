import { describe, it, expect } from 'vitest'
import { checkSafetyRisks } from './agents'

describe('checkSafetyRisks', () => {
  it('returns empty for clean brief', () => {
    expect(checkSafetyRisks('Build a professional landing page for a SaaS product')).toEqual([])
  })

  it('detects spam keyword', () => {
    const risks = checkSafetyRisks('Build a spam email blaster tool')
    expect(risks).toContain('spam')
  })

  it('detects fake review keyword', () => {
    const risks = checkSafetyRisks('Build fake review generator for Amazon products')
    expect(risks).toContain('fake review')
  })

  it('is case-insensitive', () => {
    const risks = checkSafetyRisks('Build a SPAM email blaster tool')
    expect(risks.some((r) => r.includes('spam'))).toBe(true)
  })

  it('detects multiple risks', () => {
    const risks = checkSafetyRisks('Build a scraping tool for spam mass email sending')
    expect(risks.length).toBeGreaterThan(1)
  })
})
