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
    const handler: AgentHandler = {
      type: 'research',
      name: 'Researcher',
      description: 'd',
      async run() {
        return { data: { success: true }, summary: 'done research' }
      },
    }
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
      type: 'research',
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
      { ...makeTask(), type: 'research' },
      { timeoutMs: 30 },
    )
    expect(abortFired).toBe(true)
    expect(result.status).toBe('done')
  })

  it('blocks execution and creates pending approval + notification + event for risky tasks', async () => {
    const handler: AgentHandler = {
      type: 'publish',
      name: 'Publisher',
      description: 'd',
      async run() {
        return { data: null, summary: 'published' }
      },
    }
    const db = fakeDb()
    const agent = new BaseAgent(handler, { db })
    const result = await agent.run({ ...makeTask(), type: 'publish' })

    expect(result.status).toBe('needs_me')
    expect(result.error).toContain('requires manual approval')

    // Verify database inserts (approval request + notification + task event)
    const approvalWrite = db.writes.find(w => w.sql.includes('INSERT INTO approval_requests'))
    expect(approvalWrite).toBeDefined()
    expect(approvalWrite?.binds[2]).toBe('publish_content') // action_type
    expect(approvalWrite?.binds[3]).toBe('high') // risk_level

    const notificationWrite = db.writes.find(w => w.sql.includes('INSERT INTO notifications'))
    expect(notificationWrite).toBeDefined()

    const eventWrite = db.writes.find(w => w.sql.includes('INSERT INTO task_events') && w.binds[2] === 'approval_requested')
    expect(eventWrite).toBeDefined()
  })

  it('allows execution of risky task when approved request exists', async () => {
    const handler: AgentHandler = {
      type: 'publish',
      name: 'Publisher',
      description: 'd',
      async run() {
        return { data: { success: true }, summary: 'published' }
      },
    }
    const db = fakeDb()
    // Mock the SELECT statement to return an approved status
    const origPrepare = db.prepare
    db.prepare = (sql: string) => {
      if (sql.includes('SELECT status FROM approval_requests')) {
        return {
          bind: () => ({
            first: async () => ({ status: 'approved' }),
            run: async () => ({ success: true }),
            all: async () => ({ results: [] }),
          }),
          first: async () => ({ status: 'approved' }),
          run: async () => ({ success: true }),
          all: async () => ({ results: [] }),
        } as any
      }
      return origPrepare(sql)
    }

    const agent = new BaseAgent(handler, { db })
    const result = await agent.run({ ...makeTask(), type: 'publish' })
    expect(result.status).toBe('done')
    expect(result.data).toEqual({ success: true })
  })

  it('logs started, completed and failed task events', async () => {
    const handler: AgentHandler = {
      type: 'research',
      name: 'Researcher',
      description: 'd',
      async run() {
        return { data: null, summary: 'done research' }
      },
    }
    const db = fakeDb()
    const agent = new BaseAgent(handler, { db })
    await agent.run(makeTask())

    const startEvent = db.writes.find(w => w.sql.includes('INSERT INTO task_events') && w.binds[2] === 'started')
    expect(startEvent).toBeDefined()

    const completeEvent = db.writes.find(w => w.sql.includes('INSERT INTO task_events') && w.binds[2] === 'completed')
    expect(completeEvent).toBeDefined()
  })

  it('persists artifacts when handler returns them', async () => {
    const handler: AgentHandler = {
      type: 'research',
      name: 'Researcher',
      description: 'd',
      async run() {
        return {
          data: null,
          summary: 'done',
          artifacts: [{ kind: 'research_report', url: 'https://r2/123.md' }],
        }
      },
    }
    const db = fakeDb()
    const agent = new BaseAgent(handler, { db })
    await agent.run(makeTask())

    const artifactWrite = db.writes.find(w => w.sql.includes('INSERT INTO artifacts'))
    expect(artifactWrite).toBeDefined()
    expect(artifactWrite?.binds[2]).toBe('research_report')
    expect(artifactWrite?.binds[3]).toBe('https://r2/123.md')

    const artifactEvent = db.writes.find(w => w.sql.includes('INSERT INTO task_events') && w.binds[2] === 'artifact_created')
    expect(artifactEvent).toBeDefined()
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
