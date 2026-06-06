/**
 * @posteragent/memory/prune
 *
 * Staleness + duplicate cleanup.  Two operations:
 *
 *   pruneExpired(db) — hard-deletes rows where expires_at < now.
 *   pruneDuplicates(db) — collapses near-duplicate memories within a type,
 *                         keeping the most recent and the highest-quality
 *                         (longer content wins as a heuristic).
 *
 * Both are idempotent.  Designed to be called from:
 *   • /memory/prune Worker route (manual trigger)
 *   • Hourly cron in PHASE 2 / TASK-202 (proactivity engine)
 */

import { createLogger } from '@posteragent/logger'
import { type D1Database } from './types.js'

const log = createLogger('memory:prune')

export interface PruneReport {
  expiredDeleted: number
  duplicatesCollapsed: number
}

export async function pruneExpired(db: D1Database): Promise<number> {
  const result = await db
    .prepare('DELETE FROM memory_items WHERE expires_at IS NOT NULL AND expires_at <= ?')
    .bind(new Date().toISOString())
    .run()
  // D1's run() returns { meta: { changes: number, ... } } when available.
  const meta = (result.meta ?? {}) as { changes?: number }
  const n = meta.changes ?? 0
  if (n > 0) log.info('pruned expired', { n })
  return n
}

/**
 * Collapse exact-duplicate content within the same type.
 * Heuristic: same type + normalized content (lowercase, whitespace-collapsed).
 * Keeps the newest row, deletes the older ones.
 *
 * We do this in JS rather than SQL because D1's SQLite doesn't expose
 * a regex/trim that's strong enough for content normalisation.
 */
export async function pruneDuplicates(db: D1Database): Promise<number> {
  const rows = await db
    .prepare(
      `SELECT id, type, content, created_at
       FROM memory_items
       WHERE expires_at IS NULL OR expires_at > ?
       ORDER BY created_at DESC`,
    )
    .bind(new Date().toISOString())
    .all<{ id: string; type: string; content: string; created_at: string }>()

  const seen = new Map<string, string>() // normalized key -> winning id
  const toDelete: string[] = []

  for (const row of rows.results ?? []) {
    const key = `${row.type}::${normalize(row.content)}`
    if (seen.has(key)) {
      toDelete.push(row.id)
    } else {
      seen.set(key, row.id)
    }
  }

  if (toDelete.length === 0) return 0

  // Delete in chunks of 50 to stay under SQLite's bind-arg limit.
  for (let i = 0; i < toDelete.length; i += 50) {
    const chunk = toDelete.slice(i, i + 50)
    const placeholders = chunk.map(() => '?').join(',')
    await db
      .prepare(`DELETE FROM memory_items WHERE id IN (${placeholders})`)
      .bind(...chunk)
      .run()
  }

  log.info('collapsed duplicates', { n: toDelete.length })
  return toDelete.length
}

export async function prune(db: D1Database): Promise<PruneReport> {
  return {
    expiredDeleted: await pruneExpired(db),
    duplicatesCollapsed: await pruneDuplicates(db),
  }
}

function normalize(content: string): string {
  return content.trim().toLowerCase().replace(/\s+/g, ' ')
}
