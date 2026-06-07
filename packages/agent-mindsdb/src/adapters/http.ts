/**
 * MindsDBHttpClient — POST /api/sql/query. Works against both
 * MindsDB Cloud and self-hosted instances. Authenticates with a
 * username/password basic header (the API key field on Cloud is the
 * same primitive).
 */

import type { MindsDBClient, SqlResult, SqlRow } from '../types'

export interface MindsDBHttpConfig {
  baseUrl: string
  authHeader?: string
}

interface RawResponse {
  column_names?: string[]
  data?: Array<Array<string | number | boolean | null>>
  error_message?: string
}

export class MindsDBHttpClient implements MindsDBClient {
  constructor(private cfg: MindsDBHttpConfig, private fetcher: typeof fetch = fetch) {}
  async query(sql: string): Promise<SqlResult> {
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    if (this.cfg.authHeader) headers.authorization = this.cfg.authHeader
    const res = await this.fetcher(`${this.cfg.baseUrl.replace(/\/$/, '')}/api/sql/query`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query: sql }),
    })
    if (!res.ok) throw new Error(`mindsdb ${res.status}`)
    const json = (await res.json()) as RawResponse
    if (json.error_message) throw new Error(`mindsdb: ${json.error_message}`)
    const columns = json.column_names ?? []
    const rows: SqlRow[] = (json.data ?? []).map((row) => {
      const out: SqlRow = {}
      columns.forEach((c, i) => { out[c] = row[i] ?? null })
      return out
    })
    return { columns, rows }
  }
}
