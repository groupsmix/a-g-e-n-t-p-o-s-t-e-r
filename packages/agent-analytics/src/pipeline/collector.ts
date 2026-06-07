/**
 * Collector — daily pass that refreshes metrics for every recent post.
 *
 * Pull publish_jobs.done rows from the last N days, route each to its
 * platform adapter, write a fresh snapshot. Per-post errors are
 * logged + counted; the run continues. The collector is idempotent:
 * the SnapshotStore dedupes by (platform, post_id, captured_at).
 */

import type {
  AnalyticsAdapter,
  AnalyticsSnapshot,
  CollectorConfig,
  Platform,
  PublishedPostRef,
  SnapshotStore,
} from '../types'

export interface CollectInput {
  adapters: Partial<Record<Platform, AnalyticsAdapter>>
  store: SnapshotStore
  posts: PublishedPostRef[]
  config?: CollectorConfig
  /** Override clock for tests. */
  now?: () => Date
}

export interface CollectResult {
  attempted: number
  succeeded: number
  failed: number
  unrouted: number
  snapshots: AnalyticsSnapshot[]
  errors: Array<{ post_id: string; platform: Platform; error: string }>
}

const DEFAULT_TIMEOUT = 8_000

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms)
    p.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      (e) => {
        clearTimeout(t)
        reject(e)
      },
    )
  })
}

export async function collectAnalytics(input: CollectInput): Promise<CollectResult> {
  const cfg = input.config ?? {}
  const cap = cfg.maxPostsPerRun ?? 500
  const timeout = cfg.fetchTimeoutMs ?? DEFAULT_TIMEOUT
  const clock = input.now ?? (() => new Date())
  const slice = input.posts.slice(0, cap)

  const result: CollectResult = {
    attempted: slice.length,
    succeeded: 0,
    failed: 0,
    unrouted: 0,
    snapshots: [],
    errors: [],
  }

  for (const post of slice) {
    const adapter = input.adapters[post.platform]
    if (!adapter) {
      result.unrouted += 1
      continue
    }
    try {
      const metrics = await withTimeout(adapter.fetch(post.post_id, post.published_at), timeout)
      const snap: AnalyticsSnapshot = {
        platform: post.platform,
        post_id: post.post_id,
        captured_at: clock().toISOString(),
        published_at: post.published_at,
        metrics,
      }
      await input.store.insert(snap)
      result.snapshots.push(snap)
      result.succeeded += 1
    } catch (err) {
      result.failed += 1
      result.errors.push({
        post_id: post.post_id,
        platform: post.platform,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return result
}
