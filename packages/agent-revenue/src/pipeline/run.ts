/**
 * The revenue collection loop. Each tick:
 *   1. Asks every adapter for events since its last cursor.
 *   2. Upserts them into the store (dedupe by stable id).
 *   3. Advances the cursor to "now" only on success.
 *
 * Adapter failures are isolated per-source — one broken integration
 * doesn't tank the whole tick.
 */

import type {
  RevenueAdapter,
  RevenueRunResult,
  RevenueStore,
} from '../types'

export interface RevenueRunInput {
  adapters: RevenueAdapter[]
  store: RevenueStore
  now?: () => Date
  /** Default lookback if no cursor exists (defaults to 7 days). */
  initialLookbackMs?: number
}

export async function runRevenueOnce(
  input: RevenueRunInput,
): Promise<RevenueRunResult> {
  const now = input.now?.() ?? new Date()
  const initial = input.initialLookbackMs ?? 7 * 24 * 60 * 60 * 1000
  const result: RevenueRunResult = {
    generated_at: now.toISOString(),
    fetched: 0,
    inserted: 0,
    errors: 0,
    adapters: [],
  }
  for (const ad of input.adapters) {
    try {
      const cursor = await input.store.getCursor(ad.source)
      const since = cursor ? new Date(cursor) : new Date(now.getTime() - initial)
      const events = await ad.fetchSince(since, now)
      const inserted = events.length ? await input.store.upsert(events) : 0
      result.fetched += events.length
      result.inserted += inserted
      result.adapters.push({ source: ad.source, fetched: events.length, inserted })
      await input.store.setCursor(ad.source, now.toISOString())
    } catch (err) {
      result.errors += 1
      result.adapters.push({
        source: ad.source,
        fetched: 0,
        inserted: 0,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }
  return result
}
