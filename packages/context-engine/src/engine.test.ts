import { describe, it, expect } from 'vitest'
import { createContextEngine } from './engine.js'
import type {
  ContextSummariser,
  MemoryRetriever,
  PastTaskRetriever,
  SystemSignalsProvider,
} from './types.js'

const memory: MemoryRetriever = {
  name: 'mock',
  async retrieve(input) {
    return [
      { id: 'm1', type: 'fact', content: 'Owner ships solo.', source: 'journal:2026-01-01', score: 0.9 },
      { id: 'm2', type: 'preference', content: 'Uses TypeScript primarily.', source: 'user', score: 0.8 },
    ].slice(0, input.maxResults ?? 6)
  },
}

const pastTasks: PastTaskRetriever = {
  name: 'mock',
  async retrieve(input) {
    return [
      {
        id: 't1',
        taskType: 'research' as const,
        summary: 'Researched Tavily vs Brave for search adapter.',
        resultExcerpt: 'Tavily wins on snippet quality.',
        status: 'done' as const,
        finishedAt: '2026-05-01',
        score: 0.7,
      },
    ].slice(0, input.maxResults ?? 4)
  },
}

const signals: SystemSignalsProvider = {
  name: 'mock',
  async load() {
    return {
      nowIso: '2026-06-06T22:00:00Z',
      activeGoals: ['Ship V2 roadmap', 'Hit $5k MRR'],
      recentPerformance: {
        successRate: 0.93,
        tasksLast7d: 142,
        avgCostUsd: 0.041,
        avgDurationMs: 4200,
      },
    }
  },
}

describe('createContextEngine', () => {
  it('assembles a prelude with all sections', async () => {
    const engine = createContextEngine({ memory, pastTasks, signals })
    const { bundle, usage } = await engine.build({
      taskType: 'research',
      query: 'Best LLM-tuned search API in 2026?',
    })
    expect(bundle.prelude).toContain('System signals')
    expect(bundle.prelude).toContain('Relevant memories')
    expect(bundle.prelude).toContain('Past task results')
    expect(bundle.prelude).toContain('Task')
    expect(bundle.memories).toHaveLength(2)
    expect(bundle.pastTasks).toHaveLength(1)
    expect(usage.memoryIdsRetrieved).toEqual(['m1', 'm2'])
    expect(usage.pastTaskIdsRetrieved).toEqual(['t1'])
  })

  it('survives missing retrievers (handler-only mode)', async () => {
    const engine = createContextEngine({})
    const { bundle } = await engine.build({
      taskType: 'write',
      query: 'A blog post',
    })
    expect(bundle.memories).toHaveLength(0)
    expect(bundle.pastTasks).toHaveLength(0)
    expect(bundle.signals.nowIso).toMatch(/^\d{4}-\d{2}-\d{2}/)
  })

  it('compresses when over the trigger', async () => {
    const summariser: ContextSummariser = {
      name: 'mock-summariser',
      async summarise({ text }) {
        return { text: `SUMMARY of ${text.length} chars`, inputTokens: 100, outputTokens: 30 }
      },
    }
    const longMem: MemoryRetriever = {
      name: 'long',
      async retrieve() {
        return Array.from({ length: 100 }, (_, i) => ({
          id: `m${i}`,
          type: 'fact',
          content: 'x '.repeat(500),
          source: 'noise',
        }))
      },
    }
    const engine = createContextEngine({
      memory: longMem,
      summariser,
      config: { maxMemories: 100, compressionTrigger: 200, preludeTokenCap: 300 },
    })
    const { bundle } = await engine.build({
      taskType: 'research',
      query: 'test',
    })
    expect(bundle.compressed).toBeDefined()
    expect(bundle.prelude).toContain('compressed context')
  })

  it('records usage through onUsage callback', async () => {
    const seen: unknown[] = []
    const engine = createContextEngine({
      memory,
      pastTasks,
      onUsage: (r) => {
        seen.push(r)
      },
    })
    const { usage } = await engine.build({
      taskType: 'research',
      query: 'x',
    })
    await engine.recordUsage(usage, { memoryIds: ['m1'], pastTaskIds: ['t1'] })
    expect(seen).toHaveLength(1)
    const report = seen[0] as { memoryIdsUsed: string[]; pastTaskIdsUsed: string[] }
    expect(report.memoryIdsUsed).toEqual(['m1'])
    expect(report.pastTaskIdsUsed).toEqual(['t1'])
  })
})
