/**
 * D1-backed JobStore. Tiny schema:
 *   CREATE TABLE publish_jobs(
 *     idempotency_key TEXT PRIMARY KEY,
 *     platform TEXT,
 *     publish_at TEXT,
 *     payload TEXT,
 *     status TEXT,
 *     result TEXT,
 *     created_at TEXT,
 *     completed_at TEXT
 *   )
 */

import type { JobStore, PublishJob, PublishResult } from '../types.js'

export interface D1Like {
  prepare(query: string): {
    bind(...args: unknown[]): {
      run(): Promise<{ success?: boolean; error?: string }>
      all<T = unknown>(): Promise<{ results?: T[] }>
    }
  }
}

export function createD1JobStore(d1: D1Like): JobStore {
  return {
    async enqueue(job) {
      await d1
        .prepare(
          `INSERT OR REPLACE INTO publish_jobs
           (idempotency_key, platform, publish_at, payload, status, created_at)
           VALUES (?, ?, ?, ?, 'scheduled', datetime('now'))`,
        )
        .bind(
          job.idempotencyKey ?? `${job.platform}:${Date.now()}`,
          job.platform,
          job.publishAt ?? null,
          JSON.stringify(job),
        )
        .run()
    },
    async dueNow(now) {
      const r = await d1
        .prepare(
          `SELECT payload FROM publish_jobs
           WHERE status = 'scheduled'
             AND (publish_at IS NULL OR publish_at <= ?)
           ORDER BY publish_at ASC LIMIT 100`,
        )
        .bind(now.toISOString())
        .all<{ payload: string }>()
      return (r.results ?? []).map((row) => JSON.parse(row.payload) as PublishJob)
    },
    async markDone(job, result) {
      await d1
        .prepare(
          `UPDATE publish_jobs
             SET status = ?, result = ?, completed_at = datetime('now')
           WHERE idempotency_key = ?`,
        )
        .bind(result.ok ? 'done' : 'failed', JSON.stringify(result), job.idempotencyKey ?? '')
        .run()
    },
  }
}
