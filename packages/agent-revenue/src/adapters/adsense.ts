/**
 * AdSense / YouTube monetisation — the AdSense Management API returns
 * a row-oriented report. The shape we expect:
 *   { rows: [{ DATE, EARNINGS, DOMAIN_NAME?, AD_UNIT_ID? }, ...] }
 *
 * The caller passes us a function that resolves an access token (we
 * don't want this package to know about OAuth refresh flows).
 */

import { resolveAttribution } from '../pipeline/attribution'
import { revenueId } from '../pipeline/fingerprint'
import type { RevenueAdapter, RevenueEvent } from '../types'

export interface AdsenseConfig {
  accountId: string
  getAccessToken: () => Promise<string>
}

interface AdsenseRow {
  DATE?: string
  EARNINGS?: string | number
  DOMAIN_NAME?: string
  AD_UNIT_ID?: string
}

export class AdsenseAdapter implements RevenueAdapter {
  source = 'adsense' as const
  constructor(
    private cfg: AdsenseConfig,
    private fetcher: typeof fetch = fetch,
  ) {}

  async fetchSince(since: Date, now: Date): Promise<RevenueEvent[]> {
    const token = await this.cfg.getAccessToken()
    const startDate = since.toISOString().slice(0, 10)
    const endDate = now.toISOString().slice(0, 10)
    const url =
      `https://adsense.googleapis.com/v2/accounts/${encodeURIComponent(this.cfg.accountId)}` +
      `/reports:generate?dateRange=CUSTOM&startDate.year=${startDate.slice(0, 4)}` +
      `&startDate.month=${startDate.slice(5, 7)}&startDate.day=${startDate.slice(8, 10)}` +
      `&endDate.year=${endDate.slice(0, 4)}&endDate.month=${endDate.slice(5, 7)}` +
      `&endDate.day=${endDate.slice(8, 10)}` +
      `&metrics=ESTIMATED_EARNINGS&dimensions=DATE&dimensions=DOMAIN_NAME`
    const res = await this.fetcher(url, {
      headers: { authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw new Error(`adsense ${res.status}`)
    const json = (await res.json()) as {
      rows?: Array<{ cells: Array<{ value: string }> }>
      headers?: Array<{ name: string }>
    }
    const headers = (json.headers ?? []).map((h) => h.name)
    const dateIdx = headers.indexOf('DATE')
    const earnIdx = headers.indexOf('ESTIMATED_EARNINGS')
    const domainIdx = headers.indexOf('DOMAIN_NAME')
    const out: RevenueEvent[] = []
    for (const r of json.rows ?? []) {
      const date = r.cells[dateIdx]?.value ?? ''
      const earnings = Number(r.cells[earnIdx]?.value ?? 0)
      const domain = domainIdx >= 0 ? r.cells[domainIdx]?.value : undefined
      if (!Number.isFinite(earnings) || earnings <= 0) continue
      const externalId = `${date}|${domain ?? 'all'}`
      out.push({
        id: revenueId('adsense', externalId),
        source: 'adsense',
        external_id: externalId,
        amount_usd_cents: Math.round(earnings * 100),
        currency: 'USD',
        description: domain ? `AdSense — ${domain}` : 'AdSense earnings',
        occurred_at: new Date(date).toISOString(),
        attribution: resolveAttribution({
          referring_url: domain ? `https://${domain}` : undefined,
        }),
      })
    }
    return out as AdsenseRow extends never ? never : RevenueEvent[]
  }
}
