/**
 * D1UnifiedQueryRunner — the local fallback. Resolves the
 * UnifiedQueryRunner contract directly against the D1 tables that
 * Phases 7-9 produced (revenue_events, publish_jobs, leads,
 * platform_analytics). Used when MindsDB isn't configured, and as the
 * default path because most cross-source queries the dashboard asks
 * are well-shaped for a single SQL statement.
 */

import type {
  SqlResult, SqlRow, UnifiedQueryId, UnifiedQueryParams, UnifiedQueryRunner,
} from '../types'

interface D1Like {
  prepare(sql: string): {
    bind(...args: unknown[]): {
      all<T = unknown>(): Promise<{ results?: T[] }>
    }
  }
}

const DEFAULT_DAYS = 30

function window(params?: UnifiedQueryParams): { since: string; until: string; limit: number } {
  const until = params?.until ?? new Date().toISOString()
  const since = params?.since ?? new Date(Date.now() - DEFAULT_DAYS * 86_400_000).toISOString()
  const limit = params?.limit ?? 50
  return { since, until, limit }
}

export class D1UnifiedQueryRunner implements UnifiedQueryRunner {
  constructor(private db: D1Like) {}

  async run(id: UnifiedQueryId, params?: UnifiedQueryParams): Promise<SqlResult> {
    const { since, until, limit } = window(params)
    switch (id) {
      case 'revenue_by_platform':
        return this.exec(
          ['platform', 'count', 'total_usd_cents'],
          `SELECT COALESCE(platform, 'unattributed') AS platform,
                  COUNT(*) AS count,
                  SUM(amount_usd_cents) AS total_usd_cents
             FROM revenue_events
            WHERE occurred_at >= ? AND occurred_at < ?
            GROUP BY platform
            ORDER BY total_usd_cents DESC
            LIMIT ?`,
          [since, until, limit],
        )

      case 'revenue_by_content':
        return this.exec(
          ['content_id', 'platform', 'count', 'total_usd_cents'],
          `SELECT content_id,
                  COALESCE(platform, 'unattributed') AS platform,
                  COUNT(*) AS count,
                  SUM(amount_usd_cents) AS total_usd_cents
             FROM revenue_events
            WHERE occurred_at >= ? AND occurred_at < ?
              AND content_id IS NOT NULL
            GROUP BY content_id, platform
            ORDER BY total_usd_cents DESC
            LIMIT ?`,
          [since, until, limit],
        )

      case 'leads_by_source':
        return this.exec(
          ['source', 'intent', 'count'],
          `SELECT source, intent, COUNT(*) AS count
             FROM leads
            WHERE created_at >= ? AND created_at < ?
            GROUP BY source, intent
            ORDER BY count DESC
            LIMIT ?`,
          [since, until, limit],
        )

      case 'top_posts_by_revenue':
        // Joins revenue → publish_jobs via content_id when set.
        return this.exec(
          ['post_id', 'platform', 'status', 'total_usd_cents'],
          `SELECT p.id AS post_id,
                  p.platform AS platform,
                  p.status AS status,
                  SUM(r.amount_usd_cents) AS total_usd_cents
             FROM revenue_events r
             JOIN publish_jobs p ON p.id = r.content_id
            WHERE r.occurred_at >= ? AND r.occurred_at < ?
            GROUP BY p.id
            ORDER BY total_usd_cents DESC
            LIMIT ?`,
          [since, until, limit],
        )

      case 'engagement_vs_revenue':
        // Per-platform: engagement rate from platform_analytics joined
        // with revenue sums over the same window.
        return this.exec(
          ['platform', 'avg_engagement_rate', 'total_usd_cents'],
          `SELECT a.platform,
                  AVG(a.engagement_rate) AS avg_engagement_rate,
                  COALESCE(SUM(r.amount_usd_cents), 0) AS total_usd_cents
             FROM platform_analytics a
             LEFT JOIN revenue_events r
               ON r.platform = a.platform
              AND r.occurred_at >= ? AND r.occurred_at < ?
            WHERE a.captured_at >= ? AND a.captured_at < ?
            GROUP BY a.platform
            ORDER BY total_usd_cents DESC
            LIMIT ?`,
          [since, until, since, until, limit],
        )

      default:
        throw new Error(`unknown unified query: ${id}`)
    }
  }

  private async exec(columns: string[], sql: string, binds: unknown[]): Promise<SqlResult> {
    const r = await this.db.prepare(sql).bind(...binds).all<SqlRow>()
    return { columns, rows: r.results ?? [] }
  }
}
