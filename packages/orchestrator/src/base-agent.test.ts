import { describe, it, expect } from 'vitest'
import type { AgentTask } from '@posteragent/types'
import { BaseAgent } from './base-agent.js'
import { defineStub } from './handlers/_stub.js'
import type { AgentContext, AgentHandler, OrchestratorDB } from './types.js'

// In-memory fake D1 that records all writes.  Enough surface for the
// journal + persona + now writes BaseAgent performs.
function fakeDb(): OrchestratorDB & { writes: Array<{ sql: string; binds: unknown[] }> } {
  const writes: Array<{ sql: string; binds: unknown[] }> = []
  const exec = async () => ({ success: true, meta: { changes: 0 } })
  const first = async () => null
  const all = async () => ({ results: [] })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prepare = (sql: string): any => {
    return {
      bind: (...binds: unknown[]) => {
        writes.push({ sql, binds })
        return { run: exec, first, all }
      },
      run: exec,
      first,
      all,
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { prepare: prepare as any, writes }
}

function makeTask(): AgentTask {
  return {
    id: 'task-1',
    type: 'research',
    payload: { query: 'who is the owner' },
    status: 'queued',
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

describe('BaseAgent', () => {
  it('runs a handler and returns a done AgentResult', async () => {
    const handler = defineStub({
      type: 'research',
      name: 'Researcher',
      description: 'd',
      phase: 'P4',
    })
    const db = fakeDb()
    const agent = new BaseAgent(handler, { db })
    const result = await agent.run(makeTask())
    expect(result.status).toBe('done')
    expect(result.type).toBe('research')
    expect(result.taskId).toBe('task-1')
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('translates a handler throw into a failed AgentResult', async () => {
    const throwing: AgentHandler = {
      type: 'write',
      name: 'Writer',
      description: 'd',
      async run() {
        throw new Error('boom')
      },
    }
    const db = fakeDb()
    const agent = new BaseAgent(throwing, { db })
    const result = await agent.run({ ...makeTask(), type: 'write' })
    expect(result.status).toBe('failed')
    expect(result.error).toBe('boom')
  })

  it('honours systemPromptOverride and never re-derives it', async () => {
    let captured = ''
    const probe: AgentHandler = {
      type: 'analyse',
      name: 'Probe',
      description: 'd',
      async run(ctx: AgentContext) {
        captured = ctx.systemPrompt
        return { data: null, summary: 'ok' }
      },
    }
    const db = fakeDb()
    const agent = new BaseAgent(probe, { db })
    await agent.run(
      { ...makeTask(), type: 'analyse' },
      { systemPromptOverride: 'EXACT-PROMPT' },
    )
    expect(captured).toBe('EXACT-PROMPT')
  })

  it('respects timeoutMs by signalling the handler', async () => {
    let abortFired = false
    const slow: AgentHandler = {
      type: 'publish',
      name: 'Slow',
      description: 'd',
      async run(ctx: AgentContext) {
        await new Promise<void>((resolve) => {
          ctx.signal.addEventListener('abort', () => {
            abortFired = true
            resolve()
          })
        })
        return { data: null, summary: 'aborted' }
      },
    }
    const db = fakeDb()
    const agent = new BaseAgent(slow, { db })
    const result = await agent.run(
      { ...makeTask(), type: 'publish' },
      { timeoutMs: 30 },
    )
    expect(abortFired).toBe(true)
    expect(result.status).toBe('done')
  })

  it('exposes handler metadata via type+name getters', () => {
    const h = defineStub({
      type: 'brand-monitor',
      name: 'BM',
      description: 'd',
      phase: 'P4',
    })
    const db = fakeDb()
    const agent = new BaseAgent(h, { db })
    expect(agent.type).toBe('brand-monitor')
    expect(agent.name).toBe('BM')
  })
})
