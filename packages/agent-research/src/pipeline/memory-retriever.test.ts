/**
 * Unit tests for the memory retrieval lane.
 *
 *   • plan order preserved across parallel workers
 *   • ids re-stamped with m-prefix
 *   • per-query errors swallowed → empty finding
 *   • timeout enforced
 *   • respects memoriesPerQuery via maxResults
 *   • concurrency bound respected
 */

import { describe, it, expect } from 'vitest'
import { runMemoryRetrievals } from './memory-retriever.js'
import { DEFAULT_CONFIG } from '../types.js'
import type {
  MemoryClient,
  ResearchConfig,
  ResearchPlan,
  RetrievedMemory,
} from '../types.js'

function testConfig(overrides: Partial<ResearchConfig> = {}): ResearchConfig {
  return {
    ...DEFAULT_CONFIG,
    memoriesPerQuery: 3,
    memoryTimeoutMs: 1000,
    memoryConcurrency: 2,
    ...overrides,
  }
}

function fixedMemory(map: Record<string, RetrievedMemory[]>): MemoryClient {
  return {
    name: 'mock-memory',
    async retrieve({ query }) {
      return map[query] ?? []
    },
  }
}

const samplePlan: ResearchPlan = {
  query: 'q',
  subQuestions: ['alpha', 'beta', 'gamma'],
}

const sampleMemories = (q: string, n = 2): RetrievedMemory[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `upstream-${q}-${i}`,
    type: 'fact',
    content: `memory for ${q} #${i}`,
    source: `journal:${q}`,
    score: 1 - i * 0.1,
  }))

describe('runMemoryRetrievals', () => {
  it('preserves plan order in the returned findings', async () => {
    const memory = fixedMemory({
      alpha: sampleMemories('alpha'),
      beta: sampleMemories('beta'),
      gamma: sampleMemories('gamma'),
    })
    const findings = await runMemoryRetrievals({
      plan: samplePlan,
      memory,
      config: testConfig(),
    })
    expect(findings.map((f) => f.subQuestion)).toEqual(['alpha', 'beta', 'gamma'])
  })

  it('re-stamps memory ids with the m-prefix', async () => {
    const memory = fixedMemory({
      alpha: sampleMemories('alpha'),
      beta: sampleMemories('beta'),
      gamma: sampleMemories('gamma'),
    })
    const findings = await runMemoryRetrievals({
      plan: samplePlan,
      memory,
      config: testConfig(),
    })
    for (const f of findings) {
      for (const m of f.memories) {
        expect(m.id).toMatch(/^m\d{3}$/)
      }
    }
    // Total stamped ids are unique across all findings
    const allIds = findings.flatMap((f) => f.memories.map((m) => m.id))
    expect(new Set(allIds).size).toBe(allIds.length)
  })

  it('swallows per-query errors and returns an empty finding for that sub-question', async () => {
    const memory: MemoryClient = {
      name: 'flaky',
      async retrieve({ query }) {
        if (query === 'beta') throw new Error('boom')
        return sampleMemories(query)
      },
    }
    const warnings: Array<{ msg: string; meta?: Record<string, unknown> }> = []
    const findings = await runMemoryRetrievals({
      plan: samplePlan,
      memory,
      config: testConfig(),
      log: {
        warn(msg, meta) {
          warnings.push({ msg, meta })
        },
      },
    })
    const beta = findings.find((f) => f.subQuestion === 'beta')
    expect(beta?.memories).toEqual([])
    expect(warnings.some((w) => w.meta?.subQuestion === 'beta')).toBe(true)
    // Other sub-questions still populated
    const alpha = findings.find((f) => f.subQuestion === 'alpha')
    expect(alpha?.memories.length).toBeGreaterThan(0)
  })

  it('enforces the memoryTimeoutMs hard timeout', async () => {
    const memory: MemoryClient = {
      name: 'slow',
      retrieve() {
        return new Promise(() => {
          /* never resolves */
        })
      },
    }
    const warnings: Array<{ msg: string; meta?: Record<string, unknown> }> = []
    const findings = await runMemoryRetrievals({
      plan: { query: 'q', subQuestions: ['only'] },
      memory,
      config: testConfig({ memoryTimeoutMs: 25 }),
      log: {
        warn(msg, meta) {
          warnings.push({ msg, meta })
        },
      },
    })
    expect(findings).toHaveLength(1)
    expect(findings[0].memories).toEqual([])
    expect(warnings[0]?.meta?.error).toMatch(/timed out/)
  })

  it('forwards memoriesPerQuery as maxResults to the client', async () => {
    let receivedMax: number | undefined
    const memory: MemoryClient = {
      name: 'capturing',
      async retrieve({ maxResults }) {
        receivedMax = maxResults
        return []
      },
    }
    await runMemoryRetrievals({
      plan: { query: 'q', subQuestions: ['only'] },
      memory,
      config: testConfig({ memoriesPerQuery: 7 }),
    })
    expect(receivedMax).toBe(7)
  })

  it('respects memoryConcurrency upper bound', async () => {
    let active = 0
    let peak = 0
    const memory: MemoryClient = {
      name: 'tracked',
      async retrieve() {
        active += 1
        peak = Math.max(peak, active)
        await new Promise((r) => setTimeout(r, 15))
        active -= 1
        return []
      },
    }
    await runMemoryRetrievals({
      plan: { query: 'q', subQuestions: ['a', 'b', 'c', 'd', 'e', 'f'] },
      memory,
      config: testConfig({ memoryConcurrency: 2 }),
    })
    expect(peak).toBeLessThanOrEqual(2)
  })

  it('returns empty memories arrays when client yields nothing', async () => {
    const memory = fixedMemory({})
    const findings = await runMemoryRetrievals({
      plan: samplePlan,
      memory,
      config: testConfig(),
    })
    expect(findings).toHaveLength(3)
    for (const f of findings) {
      expect(f.memories).toEqual([])
    }
  })
})
