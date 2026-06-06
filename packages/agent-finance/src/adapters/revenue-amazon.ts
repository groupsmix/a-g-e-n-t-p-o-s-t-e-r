/**
 * Amazon Associates revenue adapter.
 *
 * Amazon's PA-API doesn't expose earnings directly — earnings come
 * from the Associates Central CSV export or the Earnings API
 * (limited regions). This adapter is intentionally pluggable: pass a
 * `fetchEarningsCsv()` callback that returns a CSV string in
 * Associates' standard format, and we parse it into RevenueEntry[].
 *
 * For local-first single-owner workflow, the user usually drops the
 * CSV into a Workers KV / R2 bucket on a schedule.
 */

import type { RevenueEntry, RevenueSource } from '../types.js'

export interface AmazonAssociatesOptions {
  /** Returns the latest earnings CSV as a string. */
  fetchEarningsCsv: (input: { sinceIso: string; signal?: AbortSignal }) => Promise<string>
  /** Override which columns map to what. Defaults match the US Associates export. */
  columnMap?: {
    date: string
    earnings: string
    asin: string
    productTitle?: string
  }
}

const DEFAULT_COLUMNS = {
  date: 'Date Shipped',
  earnings: 'Earnings',
  asin: 'ASIN',
  productTitle: 'Title',
}

export function createAmazonAssociatesSource(
  opts: AmazonAssociatesOptions,
): RevenueSource {
  const cols = { ...DEFAULT_COLUMNS, ...(opts.columnMap ?? {}) }
  return {
    name: 'amazon-associates',
    async fetchEntries(input) {
      let csv = ''
      try {
        csv = await opts.fetchEarningsCsv({
          sinceIso: input.sinceIso,
          signal: input.signal,
        })
      } catch {
        return []
      }
      if (!csv) return []
      const rows = parseCsv(csv)
      if (!rows.length) return []
      const header = rows[0]
      const ixDate = header.indexOf(cols.date)
      const ixEarn = header.indexOf(cols.earnings)
      const ixAsin = header.indexOf(cols.asin)
      const ixTitle = cols.productTitle ? header.indexOf(cols.productTitle) : -1
      if (ixDate < 0 || ixEarn < 0) return []
      const out: RevenueEntry[] = []
      const since = Date.parse(input.sinceIso)
      for (let r = 1; r < rows.length; r++) {
        const row = rows[r]
        const rawDate = row[ixDate]
        const rawEarn = row[ixEarn]
        if (!rawDate || !rawEarn) continue
        const date = parseDate(rawDate)
        if (!date) continue
        if (Number.isFinite(since) && date.getTime() < since) continue
        const amount = parseUsd(rawEarn)
        if (!Number.isFinite(amount)) continue
        const asin = ixAsin >= 0 ? row[ixAsin] : ''
        const title = ixTitle >= 0 ? row[ixTitle] : undefined
        out.push({
          id: `amzn:${asin}:${date.toISOString()}`,
          source: 'amazon-associates',
          postedAt: date.toISOString(),
          amountUsd: amount,
          kind: 'commission',
          description: title,
        })
      }
      return out
    },
  }
}

function parseCsv(text: string): string[][] {
  // Minimal CSV parser: handles quotes + commas. Sufficient for
  // Amazon's export shape; for anything weirder, swap to papaparse
  // and inject it as a dep.
  const lines: string[][] = []
  let cur: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (c === '"') {
        inQuotes = false
      } else {
        field += c
      }
    } else {
      if (c === '"') inQuotes = true
      else if (c === ',') {
        cur.push(field)
        field = ''
      } else if (c === '\n') {
        cur.push(field)
        lines.push(cur)
        cur = []
        field = ''
      } else if (c === '\r') {
        // skip
      } else {
        field += c
      }
    }
  }
  if (field.length || cur.length) {
    cur.push(field)
    lines.push(cur)
  }
  return lines.filter((row) => row.some((c) => c.length))
}

function parseDate(s: string): Date | undefined {
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? undefined : d
}

function parseUsd(s: string): number {
  const cleaned = s.replace(/[\s$,]/g, '')
  const n = Number.parseFloat(cleaned)
  return Number.isFinite(n) ? n : NaN
}
