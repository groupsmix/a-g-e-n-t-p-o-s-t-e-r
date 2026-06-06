import { describe, it, expect } from 'vitest'
import { listSignals, type SignalDescriptor } from './signals'

/**
 * Pure-logic test against a mock D1.  We exercise the four scanner
 * branches by stubbing the prepare/bind/all chain — this is the same
 * pattern used by other worker services (e.g. publishers.test.ts).
 */
type Row = Record<string, unknown>
type StmtCall = { sql: string; binds: unknown[]; rows: Row[] | undefined; first?: Row }

function mockDb(plans: Array<(call: StmtCall) => void>) {
  let i = 0
  return {
    prepare(sql: string) {
      const call: StmtCall = { sql, binds: [], rows: undefined }
      const plan = plans[i++] ?? (() => {})
      return {
        bind(...binds: unknown[]) {
          call.binds = binds
          plan(call)
          return this
        },
        async all<T = unknown>() {
          if (call.rows === undefined) plan(call)
          return { results: (call.rows as T[]) ?? [], success: true }
        },
        async first<T = unknown>() {
          if (call.first === undefined) plan(call)
          return (call.first as T) ?? null
        },
      }
    },
  } as unknown as Parameters<typeof listSignals>[0]
}

describe('signals.listSignals', () => {
  it('emits idle when nothing is happening', async () => {
    const db = mockDb([
      (c) => (c.rows = []), // journal_entries
      (c) => (c.rows = []), // burst
      (c) => (c.rows = []), // stalled
      (c) => (c.rows = []), // stale-now
      (c) => (c.first = { n: 0 }), // unconsolidated
    ])
    const signals = await listSignals(db, { limit: 25 })
    expect(signals).toHaveLength(1)
    expect(signals[0].kind).toBe('idle')
  })

  it('emits follow-up signals from journal rows', async () => {
    const db = mockDb([
      (c) =>
        (c.rows = [
          {
            id: 'jrn_1',
            agent_id: 'Researcher',
            summary: 'did a thing',
            outcome: 'success',
            follow_ups: JSON.stringify(['queue a write task']),
            created_at: '2026-06-06',
          },
        ]),
      (c) => (c.rows = []),
      (c) => (c.rows = []),
      (c) => (c.rows = []),
      (c) => (c.first = { n: 0 }),
    ])
    const signals = await listSignals(db, { limit: 25 })
    const followUp = signals.find((s) => s.kind === 'follow-up')
    expect(followUp).toBeDefined()
    expect(followUp!.title).toBe('queue a write task')
    expect(followUp!.sources[0].id).toBe('jrn_1')
  })

  it('emits failed-burst as urgent', async () => {
    const db = mockDb([
      (c) => (c.rows = []),
      (c) => (c.rows = [{ type: 'research', n: 4 }]),
      (c) => (c.rows = []),
      (c) => (c.rows = []),
      (c) => (c.first = { n: 0 }),
    ])
    const signals = await listSignals(db, { limit: 25 })
    const burst = signals.find((s) => s.kind === 'task-failed-burst')
    expect(burst).toBeDefined()
    expect(burst!.severity).toBe('urgent')
    expect(burst!.title).toContain('research')
  })

  it('emits consolidation-due with suggestion when threshold crossed', async () => {
    const db = mockDb([
      (c) => (c.rows = []),
      (c) => (c.rows = []),
      (c) => (c.rows = []),
      (c) => (c.rows = []),
      (c) => (c.first = { n: 25 }),
    ])
    const signals = await listSignals(db, { limit: 25 })
    const cons = signals.find((s) => s.kind === 'consolidation-due')
    expect(cons).toBeDefined()
    expect(cons!.suggestion?.taskType).toBe('memory-consolidate')
    expect(cons!.suggestion?.payload.count).toBe(25)
  })

  it('sorts by score descending', async () => {
    const db = mockDb([
      (c) =>
        (c.rows = [
          {
            id: 'jrn_1',
            agent_id: 'A',
            summary: 's',
            outcome: 'success',
            follow_ups: JSON.stringify(['low priority']),
            created_at: '2026-06-06',
          },
        ]),
      (c) => (c.rows = [{ type: 'write', n: 3 }]), // urgent
      (c) => (c.rows = []),
      (c) => (c.rows = []),
      (c) => (c.first = { n: 0 }),
    ])
    const signals: SignalDescriptor[] = await listSignals(db, { limit: 25 })
    expect(signals[0].kind).toBe('task-failed-burst') // 0.95
    expect(signals[1].kind).toBe('follow-up') // 0.6
  })
})
