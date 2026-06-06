/**
 * D1 cost ledger adapter. The orchestrator's BaseAgent writes
 * task spend rows (model, tokens, actualCostUsd) to a `tasks` table.
 * This adapter pulls those rows back as CostEntry[].
 *
 * Plays well with any D1-compatible binding (Cloudflare Workers D1,
 * a wrangler local sqlite proxy, etc.) as long as it exposes
 * `prepare().bind().all()`.
 */

import type { CostEntry, CostLedger } from '../types.js'

export interface D1CostLedgerOptions {
  db: {
    prepare(sql: string): {
      bind(...params: unknown[]): {
        all<T = unknown>(): Promise<{ results?: T[] }>
      }
    }
  }
  /** Default 'tasks'. */
  tableName?: string
  /** Column where the model lives. Default 'model_used'. */
  modelColumn?: string
  /** Column where the cost lives. Default 'actual_cost_usd'. */
  costColumn?: string
  /** Column where the timestamp lives. Default 'updated_at'. */
  tsColumn?: string
}

export function createD1CostLedger(opts: D1CostLedgerOptions): CostLedger {
  const table = opts.tableName ?? 'tasks'
  const modelCol = opts.modelColumn ?? 'model_used'
  const costCol = opts.costColumn ?? 'actual_cost_usd'
  const tsCol = opts.tsColumn ?? 'updated_at'
  return {
    name: 'd1-tasks',
    async fetchEntries(input) {
      const sql =
        `SELECT id, ${modelCol} AS category, ${costCol} AS amount_usd, ${tsCol} AS posted_at ` +
        `FROM ${table} WHERE ${costCol} IS NOT NULL AND ${tsCol} >= ?`
      const rows = await opts.db.prepare(sql).bind(input.sinceIso).all<Row>()
      return (rows.results ?? [])
        .filter((r) => r && r.amount_usd != null)
        .map(
          (r): CostEntry => ({
            postedAt: r.posted_at,
            category: r.category ?? 'unknown',
            amountUsd: Number(r.amount_usd) || 0,
            taskId: r.id,
          }),
        )
    },
  }
}

interface Row {
  id?: string
  category?: string
  amount_usd?: number | string | null
  posted_at?: string
}
