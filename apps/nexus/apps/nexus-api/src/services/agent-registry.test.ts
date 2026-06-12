import { describe, it, expect } from 'vitest'
import {
  AGENT_TASK_TYPES,
  getAgent,
  isAgentTaskType,
  listAgents,
  listAgentsByStatus,
  listAgentsByTag,
} from './agent-registry'

/**
 * Registry shape guarantees — these are the contract the dashboard,
 * command palette, and orchestrator all depend on.  Tests live here
 * (no D1) so they run in the nexus job alongside the rest of the
 * worker's pure-logic tests.
 */
describe('agent-registry', () => {
  it('exposes exactly 14 agent types', () => {
    expect(AGENT_TASK_TYPES).toHaveLength(14)
  })

  it('every type has a complete descriptor', async () => {
    for (const type of AGENT_TASK_TYPES) {
      const desc = await getAgent(type)
      expect(desc, `missing descriptor for ${type}`).toBeTruthy()
      expect(desc!.type).toBe(type)
      expect(desc!.name.length).toBeGreaterThan(0)
      expect(desc!.description.length).toBeGreaterThan(10)
      expect(['real_wired', 'real_not_wired', 'stub_by_design', 'not_supported']).toContain(desc!.status)
      expect(['free', 'cheap', 'mid', 'high']).toContain(desc!.costBand)
      expect(desc!.estimatedCostUsd).toBeGreaterThanOrEqual(0)
      expect(Array.isArray(desc!.tags)).toBe(true)
    }
  })

  it('listAgents preserves AGENT_TASK_TYPES order', async () => {
    const list = await listAgents()
    expect(list.map((a) => a.type)).toEqual([...AGENT_TASK_TYPES])
  })

  it('isAgentTaskType rejects unknown strings', () => {
    expect(isAgentTaskType('research')).toBe(true)
    expect(isAgentTaskType('memory-consolidate')).toBe(true)
    expect(isAgentTaskType('unknown')).toBe(false)
    expect(isAgentTaskType(42)).toBe(false)
    expect(isAgentTaskType(null)).toBe(false)
    expect(isAgentTaskType(undefined)).toBe(false)
  })

  it('getAgent returns null for unknown types', async () => {
    expect(await getAgent('not-a-real-type')).toBeNull()
  })

  it('listAgentsByStatus filters correctly', async () => {
    const real = await listAgentsByStatus('real_not_wired')
    expect(real.length).toBeGreaterThan(0)
    expect(real.every((a) => a.status === 'real_not_wired')).toBe(true)
    const realTypes = real.map((a) => a.type)
    // research + memory-consolidate are "real" handlers
    expect(realTypes).toContain('research')
    expect(realTypes).toContain('memory-consolidate')
  })

  it('listAgentsByTag works for common tags', async () => {
    const content = await listAgentsByTag('content')
    expect(content.map((a) => a.type)).toEqual(
      expect.arrayContaining(['write', 'generate-video', 'generate-image']),
    )
  })
})
