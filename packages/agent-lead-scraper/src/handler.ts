/**
 * Handler — registers the lead scraper under AgentTaskType
 * 'lead-scrape'. Inputs:
 *   { kind?: 'lead-scrape', query: ScrapeQuery,
 *     adapters: LeadSourceAdapter[], store?: LeadStore }
 *
 * Returns a ScrapeResult plus persisted-lead counts and nextActions
 * for downstream agents (e.g. queue an email-campaign for each hot
 * lead's author).
 */

import { scrape } from './pipeline/scraper'
import { InMemoryLeadStore } from './pipeline/storage'
import type { Lead, LeadSourceAdapter, LeadStore, ScrapeQuery, ScrapeResult } from './types'

export interface LeadScrapeHandlerInput {
  query: ScrapeQuery
  adapters: LeadSourceAdapter[]
  store?: LeadStore
  now?: () => Date
}

export interface LeadScrapeHandlerResult {
  scrape: ScrapeResult
  persisted: number
  inserted: number
  nextActions: Array<{ type: string; payload: Record<string, unknown> }>
}

export async function runLeadScrape(
  input: LeadScrapeHandlerInput,
): Promise<LeadScrapeHandlerResult> {
  const store = input.store ?? new InMemoryLeadStore()
  const result = await scrape({
    adapters: input.adapters,
    query: input.query,
    now: input.now,
  })

  let inserted = 0
  for (const lead of result.scored) {
    const { inserted: ins } = await store.upsert(lead)
    if (ins) inserted += 1
  }

  const hot = result.scored.filter((l) => l.score.intent === 'hot').slice(0, 10)
  const nextActions = hot.map((l: Lead) => ({
    type: 'email-campaign',
    payload: {
      kind: 'lead-followup',
      lead_fingerprint: l.fingerprint,
      author: l.author,
      source: l.source,
      hint_text: l.text.slice(0, 240),
    },
  }))

  return {
    scrape: result,
    persisted: result.scored.length,
    inserted,
    nextActions,
  }
}
