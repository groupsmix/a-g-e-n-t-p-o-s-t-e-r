import { describe, it, expect } from 'vitest'
import { hasPlaceholderToken, STEP_META, TEAM_ROLES } from './workflow-engine'

describe('workflow team registry', () => {
  it('exposes one role per pipeline step', () => {
    expect(TEAM_ROLES.length).toBeGreaterThanOrEqual(15)
  })

  it('every step has a role name and a wave number', () => {
    for (const r of TEAM_ROLES) {
      expect(typeof r.role).toBe('string')
      expect(r.role.length).toBeGreaterThan(0)
      expect(Number.isInteger(r.wave)).toBe(true)
      expect(r.wave).toBeGreaterThanOrEqual(0)
    }
  })

  it('groups roles into multiple dependency-safe waves', () => {
    const waves = new Set(TEAM_ROLES.map((r) => r.wave))
    expect(waves.size).toBeGreaterThanOrEqual(6)
  })

  it('STEP_META and TEAM_ROLES agree on each step’s wave', () => {
    for (const r of TEAM_ROLES) {
      const meta = STEP_META[r.step]
      if (meta) expect(r.wave).toBe(meta.wave)
    }
  })

  it('at least one wave runs more than one role in parallel', () => {
    const counts = new Map<number, number>()
    for (const r of TEAM_ROLES) counts.set(r.wave, (counts.get(r.wave) ?? 0) + 1)
    expect([...counts.values()].some((n) => n > 1)).toBe(true)
  })
})

describe('hasPlaceholderToken - T4 regression', () => {
  it('catches ALL-CAPS bracket tokens', () => {
    expect(hasPlaceholderToken('[ACTION]')).toBe(true)
    expect(hasPlaceholderToken('[INSERT NICHE]')).toBe(true)
  })

  it('catches mixed-case bracket tokens', () => {
    expect(hasPlaceholderToken('[Action]')).toBe(true)
    expect(hasPlaceholderToken('[Digital]')).toBe(true)
    expect(hasPlaceholderToken('[Topic]')).toBe(true)
    expect(hasPlaceholderToken('[Niche]')).toBe(true)
  })

  it('does not flag clean titles', () => {
    expect(hasPlaceholderToken('Normal title')).toBe(false)
    expect(hasPlaceholderToken('Year in Review (2024)')).toBe(false)
  })
})
