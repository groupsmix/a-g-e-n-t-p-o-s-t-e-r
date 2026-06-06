/**
 * Handler-shim tests — verifies the orchestrator-facing contract.
 */

import { describe, it, expect } from 'vitest'
import { createResearchHandler } from './handler.js'
import type { LLMClient, SearchClient } from './types.js'

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
})
