/**
 * UnifiedQueryRouter — picks the right backend. If a MindsDBClient is
 * configured AND the query id has a registered SQL template, use
 * MindsDB (so MindsDB's federation can reach external databases the
 * dashboard's D1 can't). Otherwise delegate to the local runner.
 *
 * For now we forward every UnifiedQueryId to the local runner. The
 * MindsDB path is reserved for queries that span sources outside
 * D1 (e.g. external CRMs joined with our revenue). Callers can pass
 * a raw SQL through router.raw() when they need MindsDB directly.
 */

import type {
  MindsDBClient, SqlResult, UnifiedQueryId, UnifiedQueryParams, UnifiedQueryRunner,
} from '../types'

export interface UnifiedQueryRouterInput {
  local: UnifiedQueryRunner
  remote?: MindsDBClient
}

export class UnifiedQueryRouter {
  constructor(private input: UnifiedQueryRouterInput) {}
  run(id: UnifiedQueryId, params?: UnifiedQueryParams): Promise<SqlResult> {
    return this.input.local.run(id, params)
  }
  async raw(sql: string): Promise<SqlResult> {
    if (!this.input.remote) throw new Error('mindsdb client not configured')
    return this.input.remote.query(sql)
  }
}
