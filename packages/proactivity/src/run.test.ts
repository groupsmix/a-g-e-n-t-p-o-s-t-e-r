/**
 * End-to-end tests for the proactivity engine using an in-memory fake D1.
 *
 * Covers:
 *   • journal scanner — follow-up extraction + consolidation backlog
 *   • now scanner — absent / expired / aged variants
 *   • task scanner — stalled / failure burst / idle
 *   • runner — dedupe, ranking, truncation, auto-queue with idempotency
 */

import { describe, it, expect } from 'vitest'
import { runProactivity } from './run.js'
import type { ProactivityDB } from './types.js'

const NOW = new Date('2026-06-06T16:00:00.000Z')

/** Builds a fake D1 that answers a fixed set of SQL fragments. */
function fakeDb(opts: {
  journals?: Array<{
    id: string
    follow_ups?: string[]
    consolidated?: number
    outcome?: string
    summary?: string
    agent_id?: string
    created_at?: string
  }>
  nowRows?: Array<{ scope: string; content: string; expires_at: string; updated_at: string }>
  stalledTasks?: Array<{ id: string; type: string; updated_at: string }>
  failBurst?: Array<{ type: string; cnt: number }>
  idleCount?: number
  // Side-channel: collects every INSERT.
  inserts?: Array<{ sql: string; binds: unknown[] }>
}): ProactivityDB {
  const inserts = opts.inserts ?? []
  const respond = (sql: string, binds: unknown[]) => {
    if (sql.includes('FROM journal_entries')) {
      const rows = (opts.journals ?? []).map((j) => ({
        id: j.id,
        task_id: null,
        agent_id: j.agent_id ?? 'Researcher',
        summary: j.summary ?? 'did work',
        outcome: j.outcome ?? 'success',
        follow_ups: j.follow_ups ? JSON.stringify(j.follow_ups) : null,
        consolidated: j.consolidated ?? 0,
        created_at: j.created_at ?? NOW.toISOString(),
      }))
      return { all: async () => ({ results: rows }) }
    }
    if (sql.includes('FROM now_scratchpad')) {
      return { all: async () => ({ results: opts.nowRows ?? [] }) }
    }
    if (sql.includes("status = 'running' AND updated_at <")) {
      return { all: async () => ({ results: opts.stalledTasks ?? [] }) }
    }
    if (sql.includes("status = 'failed'") && sql.includes('GROUP BY type')) {
      return { all: async () => ({ results: opts.failBurst ?? [] }) }
    }
    if (sql.includes('SELECT COUNT(*) as cnt FROM agent_tasks WHERE created_at')) {
      return { first: async () => ({ cnt: opts.idleCount ?? 0 }) }
    }
    if (sql.includes("status IN ('queued','running')")) {
      // No pending same-type task — allow auto-queue.
      return { first: async () => null }
    }
    if (sql.startsWith('INSERT INTO agent_tasks')) {
      inserts.push({ sql, binds })
      return { run: async () => ({ success: true, meta: { changes: 1 } }) }
    }
    // Default empty
    return {
      all: async () => ({ results: [] }),
      first: async () => null,
      run: async () => ({ success: true, meta: {} }),
    }
  }
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prepare(sql: string): any {
      return {
        bind: (...binds: unknown[]) => respond(sql, binds),
        all: async () => (respond(sql, []) as { all?: () => Promise<unknown> }).all?.() ?? { results: [] },
        first: async () =>
          (respond(sql, []) as { first?: () => Promise<unknown> }).first?.() ?? null,
        run: async () => ({ success: true, meta: {} }),
      }
    },
  }
}

const silent = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
}

describe('runProactivity — journal signals', () => {
  it('emits one follow-up signal per non-empty follow_up entry', async () => {
    const db = fakeDb({
      journals: [
        {
          id: 'j1',
          follow_ups: ['ship the lead form', 'follow up with Acme'],
          outcome: 'success',
        },
        { id: 'j2', follow_ups: [], outcome: 'success' },
        { id: 'j3', follow_ups: ['retry image gen'], outcome: 'failed' },
      ],
    })
    const report = await runProactivity({ db, now: NOW, log: silent })
    const followUps = report.signals.filter((s) => s.kind === 'follow-up')
    expect(followUps).toHaveLength(3)
    // failed-outcome follow-up gets warn severity
    const failed = followUps.find((s) => s.key.startsWith('follow-up:j3'))
    expect(failed?.severity).toBe('warn')
  })

  it('emits consolidation-due once when backlog exceeds threshold', async () => {
    const journals = Array.from({ length: 30 }, (_, i) => ({
      id: `j${i}`,
      follow_ups: [],
      outcome: 'success',
    }))
    const db = fakeDb({ journals })
    const report = await runProactivity({ db, now: NOW, log: silent })
    const consolidation = report.signals.filter((s) => s.kind === 'consolidation-due')
    expect(consolidation).toHaveLength(1)
    expect(consolidation[0].suggestion?.taskType).toBe('memory-consolidate')
  })
})

describe('runProactivity — NOW signals', () => {
  it('emits absent signal when no NOW row exists', async () => {
    const db = fakeDb({})
    const report = await runProactivity({ db, now: NOW, log: silent })
    const now = report.signals.filter((s) => s.kind === 'now-stale')
    expect(now).toHaveLength(1)
    expect(now[0].key).toContain('absent')
  })

  it('emits expired signal when expires_at < now', async () => {
    const db = fakeDb({
      nowRows: [
        {
          scope: 'global',
          content: 'old focus',
          expires_at: new Date(NOW.getTime() - 60_000).toISOString(),
          updated_at: new Date(NOW.getTime() - 3 * 24 * 60 * 60_000).toISOString(),
        },
      ],
    })
    const report = await runProactivity({ db, now: NOW, log: silent })
    const now = report.signals.filter((s) => s.kind === 'now-stale')
    expect(now).toHaveLength(1)
    expect(now[0].key).toContain('expired')
  })

  it('emits no signal when NOW is fresh', async () => {
    const db = fakeDb({
      nowRows: [
        {
          scope: 'global',
          content: 'current',
          expires_at: new Date(NOW.getTime() + 60 * 60_000).toISOString(),
          updated_at: new Date(NOW.getTime() - 60_000).toISOString(),
        },
      ],
    })
    const report = await runProactivity({ db, now: NOW, log: silent })
    expect(report.signals.filter((s) => s.kind === 'now-stale')).toHaveLength(0)
  })
})

describe('runProactivity — task signals', () => {
  it('emits stalled signal for running tasks beyond threshold', async () => {
    const db = fakeDb({
      stalledTasks: [
        { id: 't1', type: 'research', updated_at: new Date(NOW.getTime() - 90 * 60_000).toISOString() },
      ],
    })
    const report = await runProactivity({ db, now: NOW, log: silent })
    const stalled = report.signals.filter((s) => s.kind === 'task-stalled')
    expect(stalled).toHaveLength(1)
    expect(stalled[0].severity).toBe('warn')
  })

  it('emits failure burst urgent signal', async () => {
    const db = fakeDb({ failBurst: [{ type: 'publish', cnt: 5 }] })
    const report = await runProactivity({ db, now: NOW, log: silent })
    const burst = report.signals.filter((s) => s.kind === 'task-failed-burst')
    expect(burst).toHaveLength(1)
    expect(burst[0].severity).toBe('urgent')
    expect(burst[0].score).toBeGreaterThan(0.9)
  })

  it('emits idle signal when zero recent tasks', async () => {
    const db = fakeDb({ idleCount: 0 })
    const report = await runProactivity({ db, now: NOW, log: silent })
    expect(report.signals.some((s) => s.kind === 'idle')).toBe(true)
  })

  it('does not emit idle when there are recent tasks', async () => {
    const db = fakeDb({ idleCount: 7 })
    const report = await runProactivity({ db, now: NOW, log: silent })
    expect(report.signals.some((s) => s.kind === 'idle')).toBe(false)
  })
})

describe('runProactivity — ranking & truncation', () => {
  it('sorts signals by score desc', async () => {
    const db = fakeDb({
      journals: [{ id: 'j1', follow_ups: ['low'], outcome: 'success' }],
      failBurst: [{ type: 'publish', cnt: 5 }],
    })
    const report = await runProactivity({ db, now: NOW, log: silent })
    for (let i = 1; i < report.signals.length; i++) {
      expect(report.signals[i - 1].score).toBeGreaterThanOrEqual(report.signals[i].score)
    }
  })

  it('respects maxSignals threshold', async () => {
    const journals = Array.from({ length: 20 }, (_, i) => ({
      id: `j${i}`,
      follow_ups: ['x'],
      outcome: 'success',
    }))
    const db = fakeDb({ journals })
    const report = await runProactivity({
      db,
      now: NOW,
      log: silent,
      thresholds: { maxSignals: 5 },
    })
    expect(report.signals).toHaveLength(5)
  })
})

describe('runProactivity — auto-queue', () => {
  it('does not write when autoQueue is false', async () => {
    const inserts: Array<{ sql: string; binds: unknown[] }> = []
    const db = fakeDb({ idleCount: 0, inserts })
    const report = await runProactivity({ db, now: NOW, log: silent })
    expect(report.queued).toHaveLength(0)
    expect(inserts).toHaveLength(0)
  })

  it('inserts a task for signals with a suggestion when autoQueue is true', async () => {
    const inserts: Array<{ sql: string; binds: unknown[] }> = []
    const db = fakeDb({ idleCount: 0, inserts })
    const report = await runProactivity({
      db,
      now: NOW,
      log: silent,
      autoQueue: true,
    })
    expect(report.queued.length).toBeGreaterThan(0)
    expect(report.queued[0].taskType).toBe('memory-consolidate')
    expect(inserts.length).toBeGreaterThan(0)
    // Verify payload carries the signal trace.
    const lastInsertBinds = inserts[inserts.length - 1].binds
    const payload = JSON.parse(lastInsertBinds[2] as string) as { _proactivity: { signalKey: string } }
    expect(payload._proactivity.signalKey).toBeDefined()
  })
})
