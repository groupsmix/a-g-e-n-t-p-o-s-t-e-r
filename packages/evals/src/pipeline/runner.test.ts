import { describe, it, expect } from 'vitest'
import { runSuites } from './runner'
import { containsText, shorterThan } from './assertions'
import type { Suite } from '../types'

describe('runSuites', () => {
  it('aggregates per-agent scores and applies the threshold', async () => {
    const suite: Suite<string, string> = {
      name: 'writer',
      async run(input) { return `hello ${input}` },
      scenarios: [
        {
          id: 's1', agent: 'writer', input: 'world',
          assertions: [containsText('hello', 0.5), shorterThan(100, 0.5)],
        },
        {
          id: 's2', agent: 'writer', input: 'world',
          assertions: [containsText('NOPE', 1)], // will fail
        },
      ],
    }
    const r = await runSuites([suite] as Suite[])
    expect(r.total).toBe(2)
    expect(r.passed).toBe(1)
    expect(r.failed).toBe(1)
    expect(r.agents[0]!.agent).toBe('writer')
  })

  it('catches thrown runner errors', async () => {
    const suite: Suite = {
      name: 'writer',
      async run() { throw new Error('boom') },
      scenarios: [{ id: 's1', agent: 'writer', input: {}, assertions: [] }],
    }
    const r = await runSuites([suite])
    expect(r.failed).toBe(1)
    expect(r.scenarios[0]!.error).toMatch(/boom/)
  })

  it('filters by agent', async () => {
    const suiteA: Suite = {
      name: 'A',
      async run() { return 'x' },
      scenarios: [{ id: 's1', agent: 'a', input: {}, assertions: [] }],
    }
    const suiteB: Suite = {
      name: 'B',
      async run() { return 'x' },
      scenarios: [{ id: 's2', agent: 'b', input: {}, assertions: [] }],
    }
    const r = await runSuites([suiteA, suiteB], { agents: ['a'] })
    expect(r.total).toBe(1)
    expect(r.scenarios[0]!.agent).toBe('a')
  })
})
