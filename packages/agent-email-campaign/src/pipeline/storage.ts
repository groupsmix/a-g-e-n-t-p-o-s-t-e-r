/**
 * CampaignStore implementations.
 *
 *   InMemoryCampaignStore — tests + dry runs.
 *   D1CampaignStore       — production. Backs onto migration 028:
 *                           email_sends + email_events.
 */

import type {
  CampaignEvent,
  CampaignStore,
  EventKind,
  RenderedEmail,
  SendReceipt,
} from '../types'

const EVENT_KINDS: EventKind[] = ['sent', 'open', 'click', 'bounce', 'reply', 'unsubscribe']

export class InMemoryCampaignStore implements CampaignStore {
  sends: Array<{ receipt: SendReceipt; email: RenderedEmail }> = []
  evts: CampaignEvent[] = []

  async recordSend(receipt: SendReceipt, email: RenderedEmail): Promise<void> {
    this.sends.push({ receipt, email })
  }
  async recordEvent(event: CampaignEvent): Promise<void> {
    this.evts.push(event)
  }
  async events(trackingId: string): Promise<CampaignEvent[]> {
    return this.evts
      .filter((e) => e.tracking_id === trackingId)
      .sort((a, b) => a.at.localeCompare(b.at))
  }
  async aggregate(campaignId: string): Promise<Record<EventKind, number>> {
    const tids = new Set(
      this.sends.filter((s) => s.email.campaign_id === campaignId).map((s) => s.email.tracking_id),
    )
    const out = Object.fromEntries(EVENT_KINDS.map((k) => [k, 0])) as Record<EventKind, number>
    for (const e of this.evts) if (tids.has(e.tracking_id)) out[e.kind] += 1
    return out
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

export class D1CampaignStore implements CampaignStore {
  constructor(private db: D1Like) {}

  async recordSend(receipt: SendReceipt, email: RenderedEmail): Promise<void> {
    await this.db
      .prepare(
        `INSERT OR REPLACE INTO email_sends
           (tracking_id, campaign_id, step_id, recipient, provider, provider_id, ok, error, sent_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      )
      .bind(
        email.tracking_id,
        email.campaign_id,
        email.step_id,
        email.to,
        receipt.provider,
        receipt.provider_id,
        receipt.ok ? 1 : 0,
        receipt.error ?? null,
      )
      .run()
  }

  async recordEvent(event: CampaignEvent): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO email_events (tracking_id, kind, at, meta)
         VALUES (?, ?, ?, ?)`,
      )
      .bind(event.tracking_id, event.kind, event.at, event.meta ?? null)
      .run()
  }

  async events(trackingId: string): Promise<CampaignEvent[]> {
    const r = await this.db
      .prepare(`SELECT tracking_id, kind, at, meta FROM email_events WHERE tracking_id = ? ORDER BY at ASC`)
      .bind(trackingId)
      .all<{ tracking_id: string; kind: EventKind; at: string; meta: string | null }>()
    return (r.results ?? []).map((x) => ({
      tracking_id: x.tracking_id,
      kind: x.kind,
      at: x.at,
      meta: x.meta ?? undefined,
    }))
  }

  async aggregate(campaignId: string): Promise<Record<EventKind, number>> {
    const r = await this.db
      .prepare(
        `SELECT e.kind AS kind, COUNT(*) AS n
           FROM email_events e
           JOIN email_sends s ON s.tracking_id = e.tracking_id
          WHERE s.campaign_id = ?
          GROUP BY e.kind`,
      )
      .bind(campaignId)
      .all<{ kind: EventKind; n: number }>()
    const out = Object.fromEntries(EVENT_KINDS.map((k) => [k, 0])) as Record<EventKind, number>
    for (const row of r.results ?? []) out[row.kind] = row.n
    return out
  }
}
