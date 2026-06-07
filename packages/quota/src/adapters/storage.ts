/**
 * Storage adapters.
 *
 *   InMemoryQuotaStore — tests & ephemeral dev.
 *   D1QuotaStore       — backs the manager with two tables in
 *                        migration 033 (quota_policies, quota_state).
 *   KVQuotaStore       — uses a Cloudflare KV-shaped object when the
 *                        caller wants per-Worker-isolate-shared state.
 */

import type { QuotaPolicy, QuotaState, QuotaStore } from '../types'

interface D1Like {
  prepare(sql: string): {
    bind(...args: unknown[]): {
      run(): Promise<unknown>
      first<T = unknown>(): Promise<T | null>
      all<T = unknown>(): Promise<{ results?: T[] }>
    }
  }
}

interface KVLike {
  get(key: string, type?: 'text' | 'json'): Promise<string | null>
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>
}

export class InMemoryQuotaStore implements QuotaStore {
  private policies: QuotaPolicy[] = []
  private states = new Map<string, QuotaState>()
  constructor(policies: QuotaPolicy[] = []) { this.policies = policies.slice() }
  async loadPolicies() { return this.policies.slice() }
  async upsertPolicy(p: QuotaPolicy) {
    const i = this.policies.findIndex((x) => x.provider === p.provider && (x.action ?? '*') === (p.action ?? '*'))
    if (i >= 0) this.policies[i] = p; else this.policies.push(p)
  }
  async getState(provider: string, action: string) {
    return this.states.get(`${provider}|${action}`) ?? null
  }
  async saveState(s: QuotaState) {
    this.states.set(`${s.provider}|${s.action}`, s)
  }
}

export class D1QuotaStore implements QuotaStore {
  constructor(private db: D1Like) {}
  async loadPolicies() {
    const r = await this.db.prepare(
      `SELECT provider, action, limit_n, window_ms, daily_limit, cooldown_ms FROM quota_policies`,
    ).bind().all<{ provider: string; action: string | null; limit_n: number; window_ms: number; daily_limit: number | null; cooldown_ms: number | null }>()
    return (r.results ?? []).map((row) => ({
      provider: row.provider,
      action: row.action ?? '*',
      limit: row.limit_n,
      window_ms: row.window_ms,
      daily_limit: row.daily_limit ?? undefined,
      cooldown_ms: row.cooldown_ms ?? undefined,
    }))
  }
  async upsertPolicy(p: QuotaPolicy) {
    await this.db.prepare(
      `INSERT INTO quota_policies (provider, action, limit_n, window_ms, daily_limit, cooldown_ms)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(provider, action) DO UPDATE SET
         limit_n=excluded.limit_n, window_ms=excluded.window_ms,
         daily_limit=excluded.daily_limit, cooldown_ms=excluded.cooldown_ms`,
    ).bind(p.provider, p.action ?? '*', p.limit, p.window_ms, p.daily_limit ?? null, p.cooldown_ms ?? null).run()
  }
  async getState(provider: string, action: string) {
    const row = await this.db.prepare(
      `SELECT state_json FROM quota_state WHERE provider = ? AND action = ?`,
    ).bind(provider, action).first<{ state_json: string }>()
    if (!row) return null
    try { return JSON.parse(row.state_json) as QuotaState } catch { return null }
  }
  async saveState(s: QuotaState) {
    await this.db.prepare(
      `INSERT INTO quota_state (provider, action, state_json, updated_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(provider, action) DO UPDATE SET state_json=excluded.state_json, updated_at=datetime('now')`,
    ).bind(s.provider, s.action, JSON.stringify(s)).run()
  }
}

export class KVQuotaStore implements QuotaStore {
  constructor(private kv: KVLike, private policiesKey = 'quota:policies') {}
  async loadPolicies() {
    const raw = await this.kv.get(this.policiesKey, 'text')
    if (!raw) return []
    try { return JSON.parse(raw) as QuotaPolicy[] } catch { return [] }
  }
  async upsertPolicy(p: QuotaPolicy) {
    const existing = await this.loadPolicies()
    const i = existing.findIndex((x) => x.provider === p.provider && (x.action ?? '*') === (p.action ?? '*'))
    if (i >= 0) existing[i] = p; else existing.push(p)
    await this.kv.put(this.policiesKey, JSON.stringify(existing))
  }
  async getState(provider: string, action: string) {
    const raw = await this.kv.get(`quota:state:${provider}:${action}`, 'text')
    if (!raw) return null
    try { return JSON.parse(raw) as QuotaState } catch { return null }
  }
  async saveState(s: QuotaState) {
    await this.kv.put(`quota:state:${s.provider}:${s.action}`, JSON.stringify(s), { expirationTtl: 86_400 * 7 })
  }
}
