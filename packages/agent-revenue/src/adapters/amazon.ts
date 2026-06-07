/**
 * Amazon Associates — CSV import. Amazon doesn't expose a real-time
 * sales API for affiliates, so the workflow is:
 *   1. User exports Earnings or Orders CSV from the affiliate console.
 *   2. They POST it to /api/revenue/amazon/csv.
 *   3. parseAmazonCsv() turns each row into a RevenueEvent.
 *
 * We accept either the "Earnings Report" shape (Date, Earnings, Items
 * Shipped, …) or the "Orders Report" shape (Date, Earnings, ASIN,
 * Title, …). Heuristic: presence of ASIN/Tracking ID columns.
 */

import { resolveAttribution } from '../pipeline/attribution'
import { revenueId } from '../pipeline/fingerprint'
import type { RevenueAdapter, RevenueEvent } from '../types'

function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuote = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') {
        cur += '"'
        i += 1
      } else {
        inQuote = !inQuote
      }
    } else if (ch === ',' && !inQuote) {
      out.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out.map((s) => s.trim())
}

function parseMoney(v: string | undefined): number {
  if (!v) return 0
  const cleaned = v.replace(/[$,]/g, '').trim()
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : 0
}

export function parseAmazonCsv(csv: string, opts?: { trackingId?: string }): RevenueEvent[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length < 2) return []
  const header = splitCsvLine(lines[0]!).map((c) => c.toLowerCase())
  const idx = (name: string) => header.findIndex((c) => c.includes(name))
  const dateIdx = idx('date')
  const earningsIdx = idx('earnings')
  const asinIdx = idx('asin')
  const titleIdx = idx('title')
  const trackingIdx = idx('tracking')
  const orderIdx = idx('order')

  const events: RevenueEvent[] = []
  for (let i = 1; i < lines.length; i++) {
    const row = splitCsvLine(lines[i]!)
    const earnings = parseMoney(row[earningsIdx])
    if (earnings <= 0) continue
    const date = row[dateIdx] ?? new Date().toISOString()
    const asin = asinIdx >= 0 ? row[asinIdx] : undefined
    const title = titleIdx >= 0 ? row[titleIdx] : undefined
    const trackingId = trackingIdx >= 0 ? row[trackingIdx] : opts?.trackingId
    const orderId = orderIdx >= 0 ? row[orderIdx] : undefined
    const externalId = orderId ?? `${date}|${asin ?? title ?? i}`
    events.push({
      id: revenueId('amazon', externalId),
      source: 'amazon',
      external_id: externalId,
      amount_usd_cents: Math.round(earnings * 100),
      currency: 'USD',
      product_id: asin ?? null,
      description: title ?? null,
      occurred_at: new Date(date).toISOString(),
      attribution: resolveAttribution({
        affiliate_subid: trackingId,
      }),
    })
  }
  return events
}

export class AmazonCsvAdapter implements RevenueAdapter {
  source = 'amazon' as const
  /** Cached events queued by the HTTP route; drained on next tick. */
  private queued: RevenueEvent[] = []
  push(events: RevenueEvent[]): void {
    this.queued.push(...events)
  }
  async fetchSince(): Promise<RevenueEvent[]> {
    const out = this.queued
    this.queued = []
    return out
  }
}
