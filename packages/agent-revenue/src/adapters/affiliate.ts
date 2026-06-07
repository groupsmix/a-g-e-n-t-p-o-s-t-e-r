/**
 * Generic affiliate-network adapter. Many networks (Impact,
 * ShareASale, Awin, PartnerStack, custom) expose a polling endpoint
 * that returns a list of commissions/transactions in JSON. Callers
 * configure the URL, header auth, and a small mapping function from
 * row → RevenueEvent.
 */

import { resolveAttribution } from '../pipeline/attribution'
import { revenueId } from '../pipeline/fingerprint'
import type { RevenueAdapter, RevenueEvent } from '../types'

export interface AffiliatePollConfig<Row = Record<string, unknown>> {
  /** Display name surfaced in the run summary. */
  label: string
  /** Endpoint to GET. {since} is substituted with the cursor ISO. */
  url: string
  headers?: Record<string, string>
  /** Path into the JSON response to find the array of rows. */
  rowsPath?: string
  /** Map a row to a partial RevenueEvent. */
  mapRow(row: Row): {
    external_id: string
    amount_usd_cents: number
    currency?: string
    product_id?: string
    description?: string
    occurred_at?: string
    referring_url?: string
    affiliate_subid?: string
  }
}

function deepGet(obj: unknown, path?: string): unknown {
  if (!path) return obj
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key]
    return undefined
  }, obj)
}

export class AffiliatePollAdapter<Row = Record<string, unknown>> implements RevenueAdapter {
  source = 'affiliate' as const
  constructor(
    private cfg: AffiliatePollConfig<Row>,
    private fetcher: typeof fetch = fetch,
  ) {}

  async fetchSince(since: Date): Promise<RevenueEvent[]> {
    const url = this.cfg.url.replace('{since}', encodeURIComponent(since.toISOString()))
    const res = await this.fetcher(url, { headers: this.cfg.headers })
    if (!res.ok) throw new Error(`${this.cfg.label} ${res.status}`)
    const json = await res.json()
    const rows = (deepGet(json, this.cfg.rowsPath) as Row[]) ?? []
    return rows.map((row) => {
      const m = this.cfg.mapRow(row)
      return {
        id: revenueId(this.cfg.label, m.external_id),
        source: 'affiliate',
        external_id: m.external_id,
        amount_usd_cents: m.amount_usd_cents,
        currency: m.currency ?? 'USD',
        product_id: m.product_id ?? null,
        description: m.description ?? null,
        occurred_at: m.occurred_at ?? new Date().toISOString(),
        attribution: resolveAttribution({
          referring_url: m.referring_url,
          affiliate_subid: m.affiliate_subid,
        }),
      } satisfies RevenueEvent
    })
  }
}
