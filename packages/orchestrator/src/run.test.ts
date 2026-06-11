import { describe, it, expect } from 'vitest'
import { runAgentTask } from './run.js'
import { AgentRegistry } from './registry.js'
import type { AgentHandler, OrchestratorDB, TaskBudgetGuard } from './types.js'

// ─── Fakes ─────────────────────────────────────────────────────────────────

const TASK_ROW = {
  id: 'task-1',
  type: 'research',
  payload: '{"query":"q"}',
  status: 'queued',
  result: null,
  error: null,
  estimated_cost_usd: null,
  actual_cost_usd: null,
  model_used: null,
  input_tokens: null,
  output_tokens: null,
  duration_ms: null,
  agent_id: null,
  created_at: '2026-06-11T00:00:00Z',
  updated_at: '2026-06-11T00:00:00Z',
}

/** In-memory fake D1: serves the task row for SELECTs, records writes. */
function fakeDb(): OrchestratorDB & { writes: Array<{ sql: string; binds: unknown[] }> } {
  const writes: Array<{ sql: string; binds: unknown[] }> = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prepare = (sql: string): any => {
    const stmt = {
      bind: (...binds: unknown[]) => {
        if (/UPDATE|INSERT|DELETE/i.test(sql)) writes.push({ sql, binds })
        return stmt
      },
      run: async () => ({ success: true, meta: { changes: 1 } }),
      first: async () => (/FROM agent_tasks/i.test(sql) && /SELECT/i.test(sql) ? TASK_ROW : null),
      all: async () => ({ results: [] }),
    }
    return stmt
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { prepare: prepare as any, writes }
}

function makeHandler(opts?: { costUsd?: number; onRun?: () => void }): AgentHandler {
  return {
    type: 'research',
    name: 'Researcher',
    description: 'test handler',
    async run() {
      opts?.onRun?.()
      return {
        data: { ok: true },
        summary: 'did the thing',
        usage: opts?.costUsd !== undefined ? { costUsd: opts.costUsd, model: 'gpt-5-mini' } : undefined,
      }
    },
  } as unknown as AgentHandler
}

function makeRegistry(handler: AgentHandler): AgentRegistry {
  return new AgentRegistry().register(handler)
}

// ─── Audit #44: budget enforcement ────────────────────────────────────────

describe('runAgentTask budget gate', () => {
  it('blocks the task before the handler runs when a cap is breached', async () => {
    let handlerRan = false
    let recorded = false
    const budget: TaskBudgetGuard = {
      approve: async () => ({ allowed: false, notes: ['global day cap exhausted'] }),
      afterRun: async () => {
        recorded = true
      },
    }
    const db = fakeDb()
    const result = await runAgentTask('task-1', {
      db,
      registry: makeRegistry(makeHandler({ onRun: () => (handlerRan = true) })),
      budget,
    })

    expect(result.status).toBe('failed')
    expect(result.error).toMatch(/budget cap exceeded/)
    expect(result.error).toMatch(/global day cap exhausted/)
    expect(handlerRan).toBe(false)
    expect(recorded).toBe(false)
    // The block is persisted as a failed task, not left hanging in `queued`.
    const failedWrite = db.writes.find((w) => /SET status = 'failed'/.test(w.sql))
    expect(failedWrite).toBeDefined()
  })

  it('runs the task and records actual spend when allowed', async () => {
    const usages: Array<{ task_id: string; cost_usd: number; model: string }> = []
    const budget: TaskBudgetGuard = {
      approve: async () => ({ allowed: true, notes: [] }),
      afterRun: async (u) => {
        usages.push(u)
      },
    }
    const result = await runAgentTask('task-1', {
      db: fakeDb(),
      registry: makeRegistry(makeHandler({ costUsd: 0.5 })),
      budget,
    })

    expect(result.status).toBe('done')
    expect(usages).toHaveLength(1)
    expect(usages[0]).toMatchObject({ task_id: 'task-1', task_type: 'research', cost_usd: 0.5 })
  })

  it('does not record zero-cost runs', async () => {
    let recorded = false
    const budget: TaskBudgetGuard = {
      approve: async () => ({ allowed: true, notes: [] }),
      afterRun: async () => {
        recorded = true
      },
    }
    const result = await runAgentTask('task-1', {
      db: fakeDb(),
      registry: makeRegistry(makeHandler()),
      budget,
    })

    expect(result.status).toBe('done')
    expect(recorded).toBe(false)
  })

  it('fails open when the guard infrastructure errors', async () => {
    const budget: TaskBudgetGuard = {
      approve: async () => {
        throw new Error('D1 table missing')
      },
      afterRun: async () => {},
    }
    const result = await runAgentTask('task-1', {
      db: fakeDb(),
      registry: makeRegistry(makeHandler()),
      budget,
    })

    // A broken budget store must not halt the fleet (see run.ts comment).
    expect(result.status).toBe('done')
  })

  it('keeps working with no budget guard at all (backwards compatible)', async () => {
    const result = await runAgentTask('task-1', {
      db: fakeDb(),
      registry: makeRegistry(makeHandler()),
    })
    expect(result.status).toBe('done')
  })
})
