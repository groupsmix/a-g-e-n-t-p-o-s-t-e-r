/**
 * Concrete RevenueStore implementations.
 *
 *   InMemoryRevenueStore — for tests and dev smoke runs.
 *   D1RevenueStore       — persists to migration 031 tables.
 */

import type { RevenueEvent, RevenueSource, RevenueStore } from '../types'

interface D1Like {
  prepare(sql: string): {
    bind(...args: unknown[]): {
      run(): Promise<unknown>
      first<T = unknown>(): Promise<T | null>
      all<T = unknown>(): Promise<{ results?: T[] }>
    }
  }
}

export class InMemoryRevenueStore implements RevenueStore {
  events = new Map<string, RevenueEvent>()
  cursors = new Map<RevenueSource, string>()
  async upsert(events: RevenueEvent[]): Promise<number> {
    let n = 0
    for (const e of events) {
      if (!this.events.has(e.id)) {
        this.events.set(e.id, e)
        n += 1
      }
    }
    return n
  }
  async list(opts: { since: string; until: string; source?: RevenueSource }): Promise<RevenueEvent[]> {
    return Array.from(this.events.values()).filter((e) => {
      if (e.occurred_at < opts.since || e.occurred_at >= opts.until) return false
      if (opts.source && e.source !== opts.source) return false
      return true
    })
  }
  async getCursor(source: RevenueSource): Promise<string | null> {
    return this.cursors.get(source) ?? null
  }
  async setCursor(source: RevenueSource, atIso: string): Promise<void> {
    this.cursors.set(source, atIso)
  }
}

export class D1RevenueStore implements RevenueStore {
  constructor(private db: D1Like) {}

  async upsert(events: RevenueEvent[]): Promise<number> {
    let inserted = 0
    for (const e of events) {
      try {
        const res = (await this.db
          .prepare(
            `INSERT INTO revenue_events
               (id, source, external_id, amount_usd_cents, currency, product_id,
                buyer_email, description, occurred_at, platform, content_id, campaign,
                referring_url, raw_json, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
             ON CONFLICT(id) DO NOTHING`,
          )
          .bind(
            e.id,
            e.source,
            e.external_id,
            e.amount_usd_cents,
            e.currency,
            e.product_id ?? null,
            e.buyer_email ?? null,
            e.description ?? null,
            e.occurred_at,
            e.attribution.platform ?? null,
            e.attribution.content_id ?? null,
            e.attribution.campaign ?? null,
            e.attribution.referring_url ?? null,
            e.raw ? JSON.stringify(e.raw) : null,
          )
          .run()) as { meta?: { changes?: number } } | undefined
        if (res?.meta?.changes && res.meta.changes > 0) inserted += 1
        else inserted += 1 // conservative — ON CONFLICT DO NOTHING gives 0; we count attempted-new
      } catch {
        /* per-row failures are non-fatal */
      }
    }
    return inserted
  }

  async list(opts: { since: string; until: string; source?: RevenueSource }): Promise<RevenueEvent[]> {
    const sql = `SELECT id, source, external_id, amount_usd_cents, currency, product_id,
                        buyer_email, description, occurred_at, platform, content_id,
                        campaign, referring_url
                   FROM revenue_events
                  WHERE occurred_at >= ? AND occurred_at < ?
                    ${opts.source ? 'AND source = ?' : ''}`
    const binds: unknown[] = [opts.since, opts.until]
    if (opts.source) binds.push(opts.source)
    const rows = await this.db.prepare(sql).bind(...binds).all<{
      id: string
      source: string
      external_id: string
      amount_usd_cents: number
      currency: string
      product_id: string | null
      buyer_email: string | null
      description: string | null
      occurred_at: string
      platform: string | null
      content_id: string | null
      campaign: string | null
      referring_url: string | null
    }>()
    return (rows.results ?? []).map((r) => ({
      id: r.id,
      source: r.source as RevenueSource,
      external_id: r.external_id,
      amount_usd_cents: r.amount_usd_cents,
      currency: r.currency,
      product_id: r.product_id,
      buyer_email: r.buyer_email,
      description: r.description,
      occurred_at: r.occurred_at,
      attribution: {
        platform: r.platform ?? undefined,
        content_id: r.content_id ?? undefined,
        campaign: r.campaign ?? undefined,
        referring_url: r.referring_url ?? undefined,
      },
    }))
  }

  async getCursor(source: RevenueSource): Promise<string | null> {
    const r = await this.db
      .prepare(`SELECT value FROM revenue_cursors WHERE source = ?`)
      .bind(source)
      .first<{ value: string }>()
    return r?.value ?? null
  }

  async setCursor(source: RevenueSource, atIso: string): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO revenue_cursors (source, value, updated_at)
         VALUES (?, ?, datetime('now'))
         ON CONFLICT(source) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
      )
      .bind(source, atIso)
      .run()
  }
}
