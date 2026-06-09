/**
 * Tests for the run-timeout janitor (T13).
 *
 * Two layers:
 *   1. Pure helpers (`staleCutoffs`, `normalizeTs`, `isStale`) — the
 *      timestamp-format normalisation that keeps ISO ("…T…Z") and SQLite
 *      space-format ("YYYY-MM-DD HH:MM:SS") rows comparable. This is the
 *      bug-prone bit, tested without a DB.
 *   2. `sweepStaleRuns` against a tiny in-memory D1 shim that actually
 *      evaluates each UPDATE, proving stuck-RUNNING rows flip across all five
 *      tables while fresh rows survive.
 */

import { describe, it, expect } from 'vitest'
import { sweepStaleRuns, staleCutoffs, normalizeTs, isStale, STALE_CUTOFF_MS } from './sweep'
import type { Env } from '../env'

describe('timestamp helpers', () => {
  it('cutoff is 10 minutes before now, in both shapes', () => {
    const now = Date.parse('2026-06-09T12:00:00.000Z')
    const { iso, space } = staleCutoffs(now)
    expect(STALE_CUTOFF_MS).toBe(10 * 60 * 1000)
    expect(iso).toBe('2026-06-09T11:50:00.000Z')
    expect(space).toBe('2026-06-09 11:50:00')
  })

  it('normalizeTs canonicalises ISO-with-Z, ISO-without-Z and space formats', () => {
    expect(normalizeTs('2026-06-09T11:50:00.000Z')).toBe('2026-06-09 11:50:00')
    expect(normalizeTs('2026-06-09T11:50:00')).toBe('2026-06-09 11:50:00')
    expect(normalizeTs('2026-06-09 11:50:00')).toBe('2026-06-09 11:50:00')
  })

  it('does NOT fall into the space(0x20) < T(0x54) trap', () => {
    // A space-format "now" must not read as older than an ISO cutoff just
    // because ' ' sorts before 'T'. Same instant → not stale.
    const now = Date.parse('2026-06-09T12:00:00.000Z')
    const { space } = staleCutoffs(now) // 11:50:00
    const freshSpace = '2026-06-09 11:59:00' // 1 min ago, space format
    const freshIso = '2026-06-09T11:59:00.000Z'
    expect(isStale(freshSpace, space)).toBe(false)
    expect(isStale(freshIso, space)).toBe(false)
  })

  it('flags rows older than the cutoff regardless of format', () => {
    const now = Date.parse('2026-06-09T12:00:00.000Z')
    const { space } = staleCutoffs(now) // 11:50:00
    expect(isStale('2026-06-09 11:30:00', space)).toBe(true) // space, 30m old
    expect(isStale('2026-06-09T11:30:00.000Z', space)).toBe(true) // iso, 30m old
    expect(isStale(null, space)).toBe(false)
    expect(isStale(undefined, space)).toBe(false)
  })
})

// ── In-memory D1 shim ──────────────────────────────────────────────────────

interface Row {
  id: string
  status: string
  product_id?: string
  started_at?: string | null
  created_at?: string | null
  updated_at?: string | null
}

function makeDb(tables: Record<string, Row[]>) {
  // Returns the cutoff bound to a statement (always the last bound arg in the
  // janitor's UPDATEs) so the shim can evaluate the WHERE the same way SQLite
  // would, using the shared `isStale` normalisation.
  function lastArg(args: unknown[]): string {
    return String(args[args.length - 1])
  }

  return {
    prepare(sql: string) {
      let args: unknown[] = []
      const stmt = {
        bind(...a: unknown[]) {
          args = a
          return stmt
        },
        async run() {
          let changes = 0
          const cutoff = lastArg(args)

          if (sql.includes('UPDATE workflow_steps')) {
            for (const r of tables.workflow_steps ?? []) {
              if (r.status === 'running' && isStale(r.started_at, normalizeTs(cutoff))) {
                r.status = 'failed'
                changes++
              }
            }
          } else if (sql.includes('UPDATE workflow_runs')) {
            for (const r of tables.workflow_runs ?? []) {
              if (['running', 'queued'].includes(r.status) && isStale(r.created_at, normalizeTs(cutoff))) {
                r.status = 'failed'
                changes++
              }
            }
          } else if (sql.includes('UPDATE products')) {
            const liveProductIds = new Set(
              (tables.workflow_runs ?? [])
                .filter((r) => ['running', 'queued'].includes(r.status))
                .map((r) => r.product_id),
            )
            for (const r of tables.products ?? []) {
              if (
                r.status === 'running' &&
                isStale(r.updated_at, normalizeTs(cutoff)) &&
                !liveProductIds.has(r.id)
              ) {
                r.status = 'rejected'
                changes++
              }
            }
          } else if (sql.includes('UPDATE agent_tasks')) {
            for (const r of tables.agent_tasks ?? []) {
              if (r.status === 'running' && isStale(r.started_at, cutoff)) {
                r.status = 'failed'
                changes++
              }
            }
          } else if (sql.includes('UPDATE agent_runs')) {
            for (const r of tables.agent_runs ?? []) {
              if (r.status === 'running' && isStale(r.started_at, cutoff)) {
                r.status = 'killed'
                changes++
              }
            }
          }
          // DELETE FROM products (graveyard janitor) — no-op for these tests.
          return { meta: { changes } }
        },
      }
      return stmt
    },
  }
}

describe('sweepStaleRuns', () => {
  const NOW = Date.now()
  const ago = (min: number) => new Date(NOW - min * 60_000)
  const iso = (min: number) => ago(min).toISOString()
  const space = (min: number) => normalizeTs(iso(min)) // CURRENT_TIMESTAMP shape

  it('reaps stuck RUNNING rows across all five tables, sparing fresh ones', async () => {
    const tables: Record<string, Row[]> = {
      workflow_steps: [
        { id: 'step-stale', status: 'running', started_at: iso(20) },
        { id: 'step-fresh', status: 'running', started_at: iso(1) },
      ],
      workflow_runs: [
        { id: 'run-stale', status: 'running', product_id: 'p-stale', created_at: iso(20) },
        { id: 'run-fresh', status: 'running', product_id: 'p-live', created_at: iso(1) },
      ],
      products: [
        // p-stale's run goes failed above → eligible; p-live's run stays running.
        { id: 'p-stale', status: 'running', updated_at: iso(20) },
        { id: 'p-live', status: 'running', updated_at: iso(20) },
      ],
      agent_tasks: [
        { id: 'task-stale', status: 'running', started_at: space(20), created_at: space(20), updated_at: space(20) },
        { id: 'task-fresh', status: 'running', started_at: space(2), created_at: space(2), updated_at: space(2) },
        { id: 'task-queued', status: 'queued', started_at: null, created_at: space(99), updated_at: space(99) },
      ],
      agent_runs: [
        { id: 'ledger-stale', status: 'running', started_at: space(30) },
        { id: 'ledger-fresh', status: 'running', started_at: space(3) },
      ],
    }

    const db = makeDb(tables)
    await sweepStaleRuns({ DB: db } as unknown as Env)

    const byId = (t: string, id: string) => tables[t].find((r) => r.id === id)!

    // Stuck rows reaped.
    expect(byId('workflow_steps', 'step-stale').status).toBe('failed')
    expect(byId('workflow_runs', 'run-stale').status).toBe('failed')
    expect(byId('products', 'p-stale').status).toBe('rejected')
    expect(byId('agent_tasks', 'task-stale').status).toBe('failed')
    expect(byId('agent_runs', 'ledger-stale').status).toBe('killed') // dedicated 'killed' status

    // Fresh / legitimately-waiting rows untouched.
    expect(byId('workflow_steps', 'step-fresh').status).toBe('running')
    expect(byId('workflow_runs', 'run-fresh').status).toBe('running')
    expect(byId('products', 'p-live').status).toBe('running') // still has a live run
    expect(byId('agent_tasks', 'task-fresh').status).toBe('running')
    expect(byId('agent_tasks', 'task-queued').status).toBe('queued') // queued backlog spared
    expect(byId('agent_runs', 'ledger-fresh').status).toBe('running')
  })
})
