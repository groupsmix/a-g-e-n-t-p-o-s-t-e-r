/**
 * /api/publisher-queue — TASK-701 backing endpoints.
 *
 * Powers the Publisher dashboard page:
 *   GET  /summary        → counters by status × platform
 *   GET  /jobs           → paged job list (filters: platform, status)
 *   GET  /calendar       → 14-day grid of scheduled jobs
 *   POST /jobs/:id/retry → reset a failed job to scheduled (next drain picks it up)
 *
 * Source of truth is the publish_jobs D1 table created by
 * @posteragent/agent-publisher's D1JobStore (TASK-700, migration 025).
 *
 * Every aggregate is wrapped in try/catch so a missing table never
 * 500s — the dashboard falls back to "unconfigured" instead.
 */

import { Hono } from 'hono'
import type { Env } from '../env'

export const publisherQueueRoutes = new Hono<{ Bindings: Env }>()

type Status = 'scheduled' | 'done' | 'failed'

interface JobRow {
  idempotency_key: string
  platform: string
  publish_at: string | null
  payload: string
  status: Status
  result: string | null
  created_at: string
  completed_at: string | null
}

interface Job {
  idempotency_key: string
  platform: string
  publish_at: string | null
  status: Status
  title: string
  parts_count: number
  created_at: string
  completed_at: string | null
  error: string | null
  url: string | null
  post_id: string | null
}

function inflate(row: JobRow): Job {
  let title = '(no title)'
  let parts_count = 0
  try {
    const p = JSON.parse(row.payload) as { title?: string; parts?: string[] }
    if (p.title) title = p.title
    if (Array.isArray(p.parts)) parts_count = p.parts.length
  } catch {
    /* keep defaults */
  }
  let error: string | null = null
  let url: string | null = null
  let post_id: string | null = null
  if (row.result) {
    try {
      const r = JSON.parse(row.result) as { error?: string; url?: string; postId?: string }
      error = r.error ?? null
      url = r.url ?? null
      post_id = r.postId ?? null
    } catch {
      /* swallow */
    }
  }
  return {
    idempotency_key: row.idempotency_key,
    platform: row.platform,
    publish_at: row.publish_at,
    status: row.status,
    title,
    parts_count,
    created_at: row.created_at,
    completed_at: row.completed_at,
    error,
    url,
    post_id,
  }
}

publisherQueueRoutes.get('/summary', async (c) => {
  try {
    const totals = await c.env.DB.prepare(
      `SELECT status, COUNT(*) AS n FROM publish_jobs GROUP BY status`,
    ).all<{ status: Status; n: number }>()
    const byPlatform = await c.env.DB.prepare(
      `SELECT platform, status, COUNT(*) AS n FROM publish_jobs GROUP BY platform, status`,
    ).all<{ platform: string; status: Status; n: number }>()
    const upcoming = await c.env.DB.prepare(
      `SELECT COUNT(*) AS n FROM publish_jobs WHERE status = 'scheduled' AND publish_at IS NOT NULL AND publish_at > datetime('now')`,
    ).first<{ n: number }>()
    const failed24h = await c.env.DB.prepare(
      `SELECT COUNT(*) AS n FROM publish_jobs WHERE status = 'failed' AND completed_at >= datetime('now', '-24 hours')`,
    ).first<{ n: number }>()
    const done24h = await c.env.DB.prepare(
      `SELECT COUNT(*) AS n FROM publish_jobs WHERE status = 'done' AND completed_at >= datetime('now', '-24 hours')`,
    ).first<{ n: number }>()

    const status_counts = { scheduled: 0, done: 0, failed: 0 } as Record<Status, number>
    for (const r of totals.results ?? []) status_counts[r.status] = r.n

    return c.json({
      source: 'live' as const,
      status_counts,
      by_platform: byPlatform.results ?? [],
      upcoming: upcoming?.n ?? 0,
      failed_24h: failed24h?.n ?? 0,
      done_24h: done24h?.n ?? 0,
    })
  } catch (err) {
    return c.json({
      source: 'unconfigured' as const,
      status_counts: { scheduled: 0, done: 0, failed: 0 },
      by_platform: [],
      upcoming: 0,
      failed_24h: 0,
      done_24h: 0,
      note: err instanceof Error ? err.message : String(err),
    })
  }
})

publisherQueueRoutes.get('/jobs', async (c) => {
  const platform = c.req.query('platform')
  const status = c.req.query('status') as Status | undefined
  const limit = Math.min(parseInt(c.req.query('limit') ?? '50', 10) || 50, 200)

  const where: string[] = []
  const binds: unknown[] = []
  if (platform) { where.push('platform = ?'); binds.push(platform) }
  if (status)   { where.push('status = ?');   binds.push(status) }
  const sql = `SELECT * FROM publish_jobs
               ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
               ORDER BY COALESCE(publish_at, created_at) DESC
               LIMIT ?`
  binds.push(limit)
  try {
    const rows = await c.env.DB.prepare(sql).bind(...binds).all<JobRow>()
    return c.json({ jobs: (rows.results ?? []).map(inflate) })
  } catch (err) {
    return c.json({ jobs: [], note: err instanceof Error ? err.message : String(err) })
  }
})

publisherQueueRoutes.get('/calendar', async (c) => {
  const daysParam = parseInt(c.req.query('days') ?? '14', 10)
  const days = Math.min(Math.max(daysParam || 14, 1), 60)
  try {
    const start = new Date()
    start.setUTCHours(0, 0, 0, 0)
    const end = new Date(start.getTime() + days * 86_400_000)
    const rows = await c.env.DB.prepare(
      `SELECT * FROM publish_jobs
       WHERE publish_at IS NOT NULL
         AND publish_at >= ?
         AND publish_at < ?
       ORDER BY publish_at ASC LIMIT 500`,
    )
      .bind(start.toISOString(), end.toISOString())
      .all<JobRow>()
    return c.json({
      window_start: start.toISOString(),
      window_end: end.toISOString(),
      jobs: (rows.results ?? []).map(inflate),
    })
  } catch (err) {
    return c.json({ window_start: null, window_end: null, jobs: [], note: err instanceof Error ? err.message : String(err) })
  }
})

publisherQueueRoutes.post('/jobs/:id/retry', async (c) => {
  const id = c.req.param('id')
  try {
    const row = await c.env.DB.prepare(
      `SELECT status FROM publish_jobs WHERE idempotency_key = ?`,
    ).bind(id).first<{ status: Status }>()
    if (!row) return c.json({ error: 'not found' }, 404)
    if (row.status === 'done') return c.json({ error: 'already done' }, 409)
    await c.env.DB.prepare(
      `UPDATE publish_jobs
         SET status = 'scheduled', result = NULL, completed_at = NULL,
             publish_at = COALESCE(publish_at, datetime('now'))
       WHERE idempotency_key = ?`,
    ).bind(id).run()
    return c.json({ ok: true })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})

publisherQueueRoutes.delete('/jobs/:id', async (c) => {
  const id = c.req.param('id')
  try {
    await c.env.DB.prepare(`DELETE FROM publish_jobs WHERE idempotency_key = ?`)
      .bind(id)
      .run()
    return c.json({ ok: true })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})
