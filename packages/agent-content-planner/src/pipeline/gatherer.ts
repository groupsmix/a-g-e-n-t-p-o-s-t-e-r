/**
 * Stage 1 — fan out to every signal source in parallel, swallow
 * individual failures, return a flat Signal[].
 */

import type { Signal, SignalSource } from '../types.js'

export async function gatherSignals(
  sources: SignalSource[],
  since: Date,
): Promise<Signal[]> {
  const results = await Promise.allSettled(sources.map((s) => s.fetch(since)))
  const out: Signal[] = []
  for (const r of results) {
    if (r.status === 'fulfilled') out.push(...r.value)
  }
  return out
}
