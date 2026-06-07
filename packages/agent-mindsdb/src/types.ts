/**
 * MindsDB MCP contracts (TASK-1003).
 *
 * Two layers:
 *   MindsDBClient — raw SQL execution against a MindsDB HTTP endpoint.
 *                   Lets us run cross-database joins, predict, etc.
 *   UnifiedQueryRunner — a fixed library of "questions" agents actually
 *                   ask (revenue per content, leads → conversion, etc.)
 *                   that resolve against whichever data plane is
 *                   available. When MindsDB is configured it goes
 *                   there; otherwise it falls back to D1 directly.
 */

export interface SqlRow {
  [column: string]: string | number | boolean | null
}

export interface SqlResult {
  columns: string[]
  rows: SqlRow[]
}

export interface MindsDBClient {
  query(sql: string): Promise<SqlResult>
}

export type UnifiedQueryId =
  | 'revenue_by_platform'
  | 'revenue_by_content'
  | 'leads_by_source'
  | 'top_posts_by_revenue'
  | 'engagement_vs_revenue'

export interface UnifiedQueryParams {
  /** ISO timestamp; defaults to 30 days ago. */
  since?: string
  /** ISO timestamp; defaults to now. */
  until?: string
  limit?: number
}

export interface UnifiedQueryRunner {
  run(id: UnifiedQueryId, params?: UnifiedQueryParams): Promise<SqlResult>
}
