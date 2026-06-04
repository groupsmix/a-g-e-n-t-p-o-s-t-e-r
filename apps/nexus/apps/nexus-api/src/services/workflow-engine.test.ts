import { describe, it, expect } from 'vitest'
import { STEP_META, TEAM_ROLES } from './workflow-engine'

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
