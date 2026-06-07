/**
 * SnapshotStore implementations.
 *
 *   InMemorySnapshotStore — tests + dry-runs.
 *   D1SnapshotStore       — production. Backs onto migration 026.
 */

import type {
  AnalyticsSnapshot,
  Platform,
  SnapshotStore,
} from '../types'

export class InMemorySnapshotStore implements SnapshotStore {
  private rows: AnalyticsSnapshot[] = []

  async insert(s: AnalyticsSnapshot): Promise<void> {
    // dedupe by (platform, post_id, captured_at)
    const key = `${s.platform}|${s.post_id}|${s.captured_at}`
    if (this.rows.some((r) => `${r.platform}|${r.post_id}|${r.captured_at}` === key)) return
    this.rows.push(s)
  }

  async latestPair(platform: Platform, postId: string): Promise<AnalyticsSnapshot[]> {
    const rows = this.rows
      .filter((r) => r.platform === platform && r.post_id === postId)
      .sort((a, b) => a.captured_at.localeCompare(b.captured_at))
    return rows.slice(-2)
  }

  async rangeByPlatform(platform: Platform, sinceIso: string): Promise<AnalyticsSnapshot[]> {
    return this.rows.filter((r) => r.platform === platform && r.captured_at >= sinceIso)
  }

  /** Test helper. Returns a defensive copy. */
  all(): AnalyticsSnapshot[] {
    return this.rows.slice()
  }
}

interface D1Like {
  prepare(sql: string): {
    bind(...args: unknown[]): {
      run(): Promise<unknown>
      all<T = unknown>(): Promise<{ results?: T[] }>
      first<T = unknown>(): Promise<T | null>
    }
  }
}

interface SnapshotRow {
  platform: string
  post_id: string
  captured_at: string
  published_at: string | null
  metrics: string
  extra: string | null
}

function rowToSnapshot(r: SnapshotRow): AnalyticsSnapshot {
  return {
    platform: r.platform as Platform,
    post_id: r.post_id,
    captured_at: r.captured_at,
    published_at: r.published_at,
    metrics: JSON.parse(r.metrics),
    extra: r.extra ? JSON.parse(r.extra) : undefined,
  }
}

export class D1SnapshotStore implements SnapshotStore {
  constructor(private db: D1Like) {}

  async insert(s: AnalyticsSnapshot): Promise<void> {
    await this.db
      .prepare(
        `INSERT OR IGNORE INTO platform_analytics
          (platform, post_id, captured_at, published_at, metrics, extra)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        s.platform,
        s.post_id,
        s.captured_at,
        s.published_at,
        JSON.stringify(s.metrics),
        s.extra ? JSON.stringify(s.extra) : null,
      )
      .run()
  }

  async latestPair(platform: Platform, postId: string): Promise<AnalyticsSnapshot[]> {
    const res = await this.db
      .prepare(
        `SELECT * FROM platform_analytics
          WHERE platform = ? AND post_id = ?
          ORDER BY captured_at DESC LIMIT 2`,
      )
      .bind(platform, postId)
      .all<SnapshotRow>()
    const rows = (res.results ?? []).reverse() // chronological
    return rows.map(rowToSnapshot)
  }

  async rangeByPlatform(platform: Platform, sinceIso: string): Promise<AnalyticsSnapshot[]> {
    const res = await this.db
      .prepare(
        `SELECT * FROM platform_analytics
          WHERE platform = ? AND captured_at >= ?
          ORDER BY captured_at ASC`,
      )
      .bind(platform, sinceIso)
      .all<SnapshotRow>()
    return (res.results ?? []).map(rowToSnapshot)
  }
}
