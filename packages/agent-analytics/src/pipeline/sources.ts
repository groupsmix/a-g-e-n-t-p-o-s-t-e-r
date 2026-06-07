/**
 * loadPublishedPostsFromD1 — reads finished publish_jobs rows from the
 * shared D1 database, projecting the bits the collector needs.
 *
 * The publisher (TASK-700) writes its result payload as JSON with
 * { postId, url } per platform. We pull rows where status='done'
 * within the last `windowDays`, decode that, and produce
 * PublishedPostRef[].
 */

import type { Platform, PublishedPostRef } from '../types'

interface D1Like {
  prepare(sql: string): {
    bind(...args: unknown[]): {
      all<T = unknown>(): Promise<{ results?: T[] }>
    }
  }
}

interface DoneRow {
  idempotency_key: string
  platform: string
  publish_at: string | null
  completed_at: string | null
  result: string | null
}

const VALID_PLATFORMS = new Set<Platform>([
  'x',
  'linkedin',
  'instagram',
  'tiktok',
  'youtube',
  'newsletter',
  'blog',
])

export async function loadPublishedPostsFromD1(
  db: D1Like,
  opts?: { windowDays?: number; limit?: number },
): Promise<PublishedPostRef[]> {
  const windowDays = opts?.windowDays ?? 30
  const limit = opts?.limit ?? 500
  const since = new Date(Date.now() - windowDays * 86_400_000).toISOString()

  const rows = await db
    .prepare(
      `SELECT idempotency_key, platform, publish_at, completed_at, result
         FROM publish_jobs
        WHERE status = 'done' AND completed_at >= ?
        ORDER BY completed_at DESC
        LIMIT ?`,
    )
    .bind(since, limit)
    .all<DoneRow>()

  const out: PublishedPostRef[] = []
  for (const r of rows.results ?? []) {
    if (!VALID_PLATFORMS.has(r.platform as Platform)) continue
    let postId: string | null = null
    if (r.result) {
      try {
        const parsed = JSON.parse(r.result) as { postId?: string; post_id?: string }
        postId = parsed.postId ?? parsed.post_id ?? null
      } catch {
        /* ignore */
      }
    }
    if (!postId) continue
    out.push({
      platform: r.platform as Platform,
      post_id: postId,
      published_at: r.publish_at ?? r.completed_at,
      job_id: r.idempotency_key,
    })
  }
  return out
}
