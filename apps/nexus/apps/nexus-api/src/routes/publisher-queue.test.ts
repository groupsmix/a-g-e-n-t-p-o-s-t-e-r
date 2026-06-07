/**
 * Smoke tests for /api/publisher-queue (TASK-701).
 *
 * Uses a tiny in-memory D1 shim so we exercise SQL string assembly,
 * payload inflation and JSON output without spinning up Workers /
 * Miniflare. Real D1 wiring is covered by integration tests.
 */

import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import { publisherQueueRoutes } from './publisher-queue'

interface Row {
  idempotency_key: string
  platform: string
  publish_at: string | null
  payload: string
  status: 'scheduled' | 'done' | 'failed'
  result: string | null
  created_at: string
  completed_at: string | null
}

function makeDb(rows: Row[]) {
  return {
    prepare(sql: string) {
      let captured: unknown[] = []
      const stmt = {
        bind(...args: unknown[]) {
          captured = args
          return stmt
        },
        async all<T = unknown>() {
          if (sql.includes('GROUP BY status')) {
            const counts = new Map<string, number>()
            for (const r of rows) counts.set(r.status, (counts.get(r.status) ?? 0) + 1)
            return {
              results: [...counts.entries()].map(([status, n]) => ({ status, n })),
            } as { results: T[] }
          }
          if (sql.includes('GROUP BY platform, status')) {
            const m = new Map<string, number>()
            for (const r of rows) {
              const k = `${r.platform}|${r.status}`
              m.set(k, (m.get(k) ?? 0) + 1)
            }
            return {
              results: [...m.entries()].map(([k, n]) => {
                const [platform, status] = k.split('|')
                return { platform, status, n }
              }),
            } as { results: T[] }
          }
          // Plain SELECT * FROM publish_jobs with optional WHERE
          let filtered = rows.slice()
          if (sql.includes('platform = ?')) {
            filtered = filtered.filter((r) => r.platform === captured.shift())
          }
          if (sql.includes('status = ?')) {
            filtered = filtered.filter((r) => r.status === captured.shift())
          }
          if (sql.includes('publish_at IS NOT NULL') && sql.includes('publish_at >= ?')) {
            const start = String(captured.shift())
            const end = String(captured.shift())
            filtered = filtered.filter(
              (r) => r.publish_at && r.publish_at >= start && r.publish_at < end,
            )
          }
          return { results: filtered as unknown as T[] }
        },
        async first<T = unknown>() {
          if (sql.includes("status = 'scheduled'") && sql.includes('publish_at >')) {
            return { n: rows.filter((r) => r.status === 'scheduled' && r.publish_at && r.publish_at > new Date().toISOString()).length } as unknown as T
          }
          if (sql.includes("status = 'failed'")) {
            return { n: rows.filter((r) => r.status === 'failed').length } as unknown as T
          }
          if (sql.includes("status = 'done'")) {
            return { n: rows.filter((r) => r.status === 'done').length } as unknown as T
          }
          if (sql.includes('SELECT status FROM publish_jobs')) {
            const id = String(captured[0])
            const row = rows.find((r) => r.idempotency_key === id)
            return row ? ({ status: row.status } as unknown as T) : null
          }
          return null
        },
        async run() {
          return { success: true } as { success: boolean }
        },
      }
      return stmt
    },
  }
}

function mountApp(db: ReturnType<typeof makeDb>) {
  const app = new Hono()
  app.route('/api/publisher-queue', publisherQueueRoutes)
  return (path: string, init?: RequestInit) =>
    app.request(`/api/publisher-queue${path}`, init, { DB: db } as never)
}

describe('publisher-queue summary', () => {
  it('aggregates counts by status', async () => {
    const rows: Row[] = [
      { idempotency_key: 'a', platform: 'x', publish_at: null, payload: '{"title":"a","parts":["1"]}', status: 'done', result: null, created_at: 'now', completed_at: 'now' },
      { idempotency_key: 'b', platform: 'x', publish_at: null, payload: '{"title":"b","parts":["1"]}', status: 'failed', result: '{"error":"rate"}', created_at: 'now', completed_at: 'now' },
      { idempotency_key: 'c', platform: 'linkedin', publish_at: null, payload: '{"title":"c","parts":["1"]}', status: 'scheduled', result: null, created_at: 'now', completed_at: null },
    ]
    const req = mountApp(makeDb(rows))
    const r = await req('/summary')
    const json = (await r.json()) as { source: string; status_counts: Record<string, number> }
    expect(json.source).toBe('live')
    expect(json.status_counts.done).toBe(1)
    expect(json.status_counts.failed).toBe(1)
    expect(json.status_counts.scheduled).toBe(1)
  })

  it('falls back to unconfigured when DB throws', async () => {
    const req = mountApp({
      prepare() {
        throw new Error('no such table')
      },
    } as never)
    const r = await req('/summary')
    const json = (await r.json()) as { source: string }
    expect(json.source).toBe('unconfigured')
  })
})

describe('publisher-queue jobs', () => {
  it('inflates payload + result into typed Job', async () => {
    const rows: Row[] = [
      {
        idempotency_key: 'a',
        platform: 'x',
        publish_at: null,
        payload: JSON.stringify({ title: 'hello', parts: ['1', '2', '3'] }),
        status: 'done',
        result: JSON.stringify({ url: 'https://x/p', postId: 'p1' }),
        created_at: 'now',
        completed_at: 'now',
      },
    ]
    const req = mountApp(makeDb(rows))
    const r = await req('/jobs')
    const json = (await r.json()) as { jobs: Array<Record<string, unknown>> }
    expect(json.jobs).toHaveLength(1)
    expect(json.jobs[0]!.title).toBe('hello')
    expect(json.jobs[0]!.parts_count).toBe(3)
    expect(json.jobs[0]!.url).toBe('https://x/p')
    expect(json.jobs[0]!.post_id).toBe('p1')
  })
})

describe('publisher-queue retry', () => {
  it('404s when job missing', async () => {
    const req = mountApp(makeDb([]))
    const r = await req('/jobs/missing/retry', { method: 'POST' })
    expect(r.status).toBe(404)
  })

  it('refuses to retry a completed job', async () => {
    const rows: Row[] = [
      { idempotency_key: 'a', platform: 'x', publish_at: null, payload: '{}', status: 'done', result: null, created_at: 'now', completed_at: 'now' },
    ]
    const req = mountApp(makeDb(rows))
    const r = await req('/jobs/a/retry', { method: 'POST' })
    expect(r.status).toBe(409)
  })
})
