/**
 * Handler-shim tests — verifies the orchestrator-facing contract,
 * including TASK-401 memory-only and hybrid modes.
 */

import { describe, it, expect } from 'vitest'
import { createResearchHandler } from './handler.js'
import type { LLMClient, MemoryClient, SearchClient } from './types.js'

const llm: LLMClient = {
  name: 'mock-llm',
  async complete() {
    return {
      text: '{"subQuestions":["one"]}',
      model: 'mock',
      usage: { inputTokens: 10, outputTokens: 20 },
    }
  },
}

const search: SearchClient = {
  name: 'mock-search',
  async search({ query }) {
    return [
      { id: 'upstream-1', title: query, url: 'https://x', snippet: 's' },
    ]
  },
}

const memory: MemoryClient = {
  name: 'mock-memory',
  async retrieve({ query }) {
    return [
      {
        id: 'upstream-mem-1',
        type: 'fact',
        content: `Brain fact for ${query}`,
        source: 'journal:2026-06-01',
        tags: ['x'],
      },
    ]
  },
}

describe('createResearchHandler', () => {
  it('shapes a research outcome the orchestrator can persist', async () => {
    let synthCalled = false
    const stagedLLM: LLMClient = {
      name: 'staged',
      async complete() {
        if (!synthCalled) {
          synthCalled = true
          return {
            text: '{"subQuestions":["one"]}',
            model: 'm',
            usage: { inputTokens: 10, outputTokens: 5 },
          }
        }
        return {
          text: 'Insight [^s001].',
          model: 'm',
          usage: { inputTokens: 200, outputTokens: 80 },
        }
      },
    }

    const handler = createResearchHandler({ llm: stagedLLM, search })
    const outcome = await handler.run({
      task: { id: 't1', payload: { query: 'what is DeFi' } },
    })

    expect(handler.type).toBe('research')
    expect(handler.name).toBe('Deep Research Agent')
    expect(outcome.data.citations.length).toBeGreaterThanOrEqual(1)
    expect(outcome.summary).toContain('what is DeFi')
    expect(outcome.summary).toContain('(web)')
    expect(outcome.memories.length).toBeGreaterThanOrEqual(1)
    expect(outcome.memories[0].type).toBe('fact')
    expect(outcome.usage.inputTokens).toBe(210)
    expect(outcome.usage.outputTokens).toBe(85)
    expect(outcome.nextActions.length).toBeGreaterThan(0)
  })

  it('throws when payload.query is empty', async () => {
    const handler = createResearchHandler({ llm, search })
    await expect(
      handler.run({ task: { id: 't1', payload: { query: '' } } }),
    ).rejects.toThrow(/query is required/)
  })

  it('TASK-401: throws when neither search nor memory is provided', () => {
    expect(() => createResearchHandler({ llm })).toThrow(
      /at least one of/i,
    )
  })

  it('TASK-401: memory-only handler produces brain-cited outcome and does NOT re-persist brain citations', async () => {
    let synthCalled = false
    const stagedLLM: LLMClient = {
      name: 'staged',
      async complete() {
        if (!synthCalled) {
          synthCalled = true
          return {
            text: '{"subQuestions":["one"]}',
            model: 'm',
            usage: { inputTokens: 10, outputTokens: 5 },
          }
        }
        return {
          text: 'Brain insight [^m001].',
          model: 'm',
          usage: { inputTokens: 200, outputTokens: 80 },
        }
      },
    }

    const handler = createResearchHandler({ llm: stagedLLM, memory })
    const outcome = await handler.run({
      task: { id: 't2', payload: { query: 'what do I know' } },
    })

    expect(outcome.data.citations.length).toBeGreaterThanOrEqual(1)
    expect(outcome.data.citations[0].kind).toBe('memory')
    expect(outcome.summary).toContain('(memory-only)')
    // Brain citations should NOT round-trip back into the memory store.
    expect(outcome.memories).toEqual([])
  })

  it('TASK-401: hybrid handler tags summary mode and only persists web citations', async () => {
    let synthCalled = false
    const stagedLLM: LLMClient = {
      name: 'staged',
      async complete() {
        if (!synthCalled) {
          synthCalled = true
          return {
            text: '{"subQuestions":["one"]}',
            model: 'm',
            usage: { inputTokens: 10, outputTokens: 5 },
          }
        }
        return {
          text: 'Web [^s001]. Brain [^m001].',
          model: 'm',
          usage: { inputTokens: 200, outputTokens: 80 },
        }
      },
    }

    const handler = createResearchHandler({ llm: stagedLLM, search, memory })
    const outcome = await handler.run({
      task: { id: 't3', payload: { query: 'mixed query' } },
    })

    expect(outcome.summary).toContain('(hybrid)')
    const kinds = new Set(outcome.data.citations.map((c) => c.kind))
    expect(kinds.has('web')).toBe(true)
    expect(kinds.has('memory')).toBe(true)
    // Persisted memories ONLY include the web citation (1), not the brain one.
    expect(outcome.memories).toHaveLength(1)
    expect(outcome.memories[0].content).toContain('https://x')
  })
})
