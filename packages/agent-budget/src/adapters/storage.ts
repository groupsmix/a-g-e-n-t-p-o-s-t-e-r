/**
 * Concrete BudgetStore implementations. In-memory backs the tests
 * and dev smoke runs; D1BudgetStore persists to migration 032.
 */

import type { BudgetCap, BudgetStore, CapPeriod, UsageRecord } from '../types'

interface D1Like {
  prepare(sql: string): {
    bind(...args: unknown[]): {
      run(): Promise<unknown>
      first<T = unknown>(): Promise<T | null>
      all<T = unknown>(): Promise<{ results?: T[] }>
    }
  }
}

function periodStart(period: CapPeriod, now: Date): Date {
  const d = new Date(now)
  d.setUTCHours(0, 0, 0, 0)
  if (period === 'day') return d
  if (period === 'week') {
    const dow = (d.getUTCDay() + 6) % 7
    d.setUTCDate(d.getUTCDate() - dow)
    return d
  }
  d.setUTCDate(1)
  return d
}

export class InMemoryBudgetStore implements BudgetStore {
  private _caps: BudgetCap[] = []
  private _usage: UsageRecord[] = []
  constructor(caps: BudgetCap[] = []) { this._caps = caps.slice() }
  async caps() { return this._caps.slice() }
  async setCap(cap: BudgetCap) {
    const i = this._caps.findIndex((c) => c.scope === cap.scope && c.match === cap.match && c.period === cap.period)
    if (i >= 0) this._caps[i] = cap
    else this._caps.push(cap)
  }
  async spendIn(scope: BudgetCap['scope'], match: string | undefined, period: CapPeriod) {
    const since = periodStart(period, new Date()).toISOString()
    return this._usage
      .filter((u) => u.occurred_at >= since)
      .filter((u) => scope === 'global'
        || (scope === 'task_type' && u.task_type === match)
        || (scope === 'model' && u.model === match))
      .reduce((s, u) => s + u.cost_usd, 0)
  }
  async recordUsage(u: UsageRecord) { this._usage.push(u) }
  async listUsage(opts: { since: string; until: string; model?: string; task_type?: string }) {
    return this._usage.filter((u) =>
      u.occurred_at >= opts.since &&
      u.occurred_at < opts.until &&
      (!opts.model || u.model === opts.model) &&
      (!opts.task_type || u.task_type === opts.task_type),
    )
  }
}

export class D1BudgetStore implements BudgetStore {
  constructor(private db: D1Like) {}
  async caps(): Promise<BudgetCap[]> {
    const r = await this.db
      .prepare(`SELECT scope, match, period, limit_usd, warn_at, enabled FROM budget_caps`)
      .bind()
      .all<{ scope: string; match: string | null; period: string; limit_usd: number; warn_at: number | null; enabled: number }>()
    return (r.results ?? []).map((row) => ({
      scope: row.scope as BudgetCap['scope'],
      match: row.match ?? undefined,
      period: row.period as CapPeriod,
      limit_usd: row.limit_usd,
      warn_at: row.warn_at ?? undefined,
      enabled: !!row.enabled,
    }))
  }
  async setCap(cap: BudgetCap): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO budget_caps (scope, match, period, limit_usd, warn_at, enabled, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(scope, match, period) DO UPDATE SET
           limit_usd = excluded.limit_usd,
           warn_at   = excluded.warn_at,
           enabled   = excluded.enabled,
           updated_at = datetime('now')`,
      )
      .bind(cap.scope, cap.match ?? null, cap.period, cap.limit_usd, cap.warn_at ?? null, cap.enabled ? 1 : 0)
      .run()
  }
  async spendIn(scope: BudgetCap['scope'], match: string | undefined, period: CapPeriod) {
    const since = periodStart(period, new Date()).toISOString()
    let sql = `SELECT COALESCE(SUM(cost_usd), 0) AS n FROM agent_usage WHERE occurred_at >= ?`
    const binds: unknown[] = [since]
    if (scope === 'task_type') { sql += ' AND task_type = ?'; binds.push(match) }
    else if (scope === 'model') { sql += ' AND model = ?'; binds.push(match) }
    const r = await this.db.prepare(sql).bind(...binds).first<{ n: number }>()
    return r?.n ?? 0
  }
  async recordUsage(u: UsageRecord): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO agent_usage
           (task_id, task_type, model, input_tokens, output_tokens, cost_usd, occurred_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(u.task_id, u.task_type, u.model, u.input_tokens, u.output_tokens, u.cost_usd, u.occurred_at)
      .run()
  }
  async listUsage(opts: { since: string; until: string; model?: string; task_type?: string }) {
    let sql = `SELECT task_id, task_type, model, input_tokens, output_tokens, cost_usd, occurred_at
                 FROM agent_usage WHERE occurred_at >= ? AND occurred_at < ?`
    const binds: unknown[] = [opts.since, opts.until]
    if (opts.model) { sql += ' AND model = ?'; binds.push(opts.model) }
    if (opts.task_type) { sql += ' AND task_type = ?'; binds.push(opts.task_type) }
    const r = await this.db.prepare(sql).bind(...binds).all<UsageRecord>()
    return r.results ?? []
  }
}
