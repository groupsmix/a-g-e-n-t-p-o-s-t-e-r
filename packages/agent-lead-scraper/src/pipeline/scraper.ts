/**
 * Scraper — fans out a ScrapeQuery across every configured source
 * adapter, dedupes by fingerprint, scores, and returns Leads sorted
 * by score (descending). Per-source errors are caught.
 */

import type {
  Lead,
  LeadSourceAdapter,
  RawLead,
  ScrapeQuery,
  ScrapeResult,
  LeadSource,
} from '../types'
import { fingerprint, toLead } from './scorer'

export interface ScrapeInput {
  adapters: LeadSourceAdapter[]
  query: ScrapeQuery
  now?: () => Date
}

export async function scrape(input: ScrapeInput): Promise<ScrapeResult> {
  const clock = input.now ?? (() => new Date())
  const result: ScrapeResult = {
    attempted_sources: input.adapters.length,
    raw_count: 0,
    unique_count: 0,
    scored: [],
    errors: [],
  }

  const settled = await Promise.allSettled(
    input.adapters.map((a) => a.fetch(input.query)),
  )
  const rawByPrint = new Map<string, RawLead>()
  settled.forEach((r, i) => {
    const source: LeadSource = input.adapters[i]!.source
    if (r.status === 'rejected') {
      result.errors.push({
        source,
        error: r.reason instanceof Error ? r.reason.message : String(r.reason),
      })
      return
    }
    for (const raw of r.value) {
      result.raw_count += 1
      // Drop excluded
      const lower = raw.text.toLowerCase()
      const excluded = (input.query.excludeTerms ?? []).some((t) =>
        lower.includes(t.toLowerCase()),
      )
      if (excluded) continue
      const fp = fingerprint(raw)
      if (!rawByPrint.has(fp)) rawByPrint.set(fp, raw)
    }
  })

  const now = clock()
  const leads: Lead[] = []
  for (const raw of rawByPrint.values()) leads.push(toLead(raw, now))
  leads.sort((a, b) => b.score.total - a.score.total)
  result.unique_count = leads.length
  result.scored = leads
  return result
}
