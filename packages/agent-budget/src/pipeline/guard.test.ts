import { describe, it, expect } from 'vitest'
import { BudgetGuard } from './guard'
import { estimateCost } from './estimate'
import { InMemoryBudgetStore } from '../adapters/storage'
import type { BudgetCap } from '../types'

const globalDay: BudgetCap = {
  scope: 'global', period: 'day', limit_usd: 5, warn_at: 0.8, enabled: true,
}

describe('estimateCost', () => {
  it('uses task profile and a known model', () => {
    const e = estimateCost({ task_type: 'write' })
    expect(e.task_type).toBe('write')
    expect(e.est_usd).toBeGreaterThan(0)
    expect(e.model.id).toBeTruthy()
  })

  it('allows opts override', () => {
    const e = estimateCost({ task_type: 'write', model: 'claude-haiku-3.5', input_tokens: 1000, output_tokens: 500 })
    expect(e.model.id).toBe('claude-haiku-3.5')
    expect(e.est_input_tokens).toBe(1000)
  })
})

describe('BudgetGuard', () => {
  it('approves under cap', async () => {
    const store = new InMemoryBudgetStore([globalDay])
    const g = new BudgetGuard({ store })
    const d = await g.approve({ task_type: 'publish' })
    expect(d.allowed).toBe(true)
  })

  it('blocks when estimate exceeds remaining', async () => {
    const store = new InMemoryBudgetStore([{ ...globalDay, limit_usd: 0.001 }])
    const g = new BudgetGuard({ store })
    const d = await g.approve({ task_type: 'build-app' })
    expect(d.allowed).toBe(false)
    expect(d.breached_cap).toBeTruthy()
    expect(d.suggested_model).toBeTruthy()
  })

  it('warns at threshold', async () => {
    const store = new InMemoryBudgetStore([{ ...globalDay, limit_usd: 0.10, warn_at: 0.5 }])
    // Pre-load usage right at threshold
    await store.recordUsage({
      task_id: 't-prev', task_type: 'write', model: 'claude-haiku-3.5',
      input_tokens: 0, output_tokens: 0, cost_usd: 0.06,
      occurred_at: new Date().toISOString(),
    })
    const g = new BudgetGuard({ store })
    const d = await g.approve({ task_type: 'publish' })
    expect(d.notes.some((n) => n.includes('cap at'))).toBe(true)
    expect(d.suggested_model).toBeTruthy()
  })

  it('respects task_type-scoped caps', async () => {
    const cap: BudgetCap = { scope: 'task_type', match: 'generate-image', period: 'day', limit_usd: 0.001, enabled: true }
    const store = new InMemoryBudgetStore([cap])
    const g = new BudgetGuard({ store })
    const d = await g.approve({ task_type: 'generate-image' })
    expect(d.allowed).toBe(false)
    // Different task type should be unaffected.
    const d2 = await g.approve({ task_type: 'publish' })
    expect(d2.allowed).toBe(true)
  })

  it('records usage that affects future approvals', async () => {
    const store = new InMemoryBudgetStore([{ ...globalDay, limit_usd: 0.01 }])
    const g = new BudgetGuard({ store })
    await g.afterRun({
      task_id: 't1', task_type: 'write', model: 'claude-sonnet-4-20250514',
      input_tokens: 1000, output_tokens: 1000, cost_usd: 0.009,
      occurred_at: new Date().toISOString(),
    })
    const d = await g.approve({ task_type: 'publish' })
    // remaining_usd should reflect the recorded spend.
    expect(d.remaining_usd).toBeLessThan(0.01)
  })
})
