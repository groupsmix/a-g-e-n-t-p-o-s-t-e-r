/**
 * Convenience adapters that turn other agent outputs into Signal[].
 *
 * The orchestrator can wire these directly:
 *   sources: [
 *     fromBrandMonitor(monitor),
 *     fromTrendFinder(trends),
 *     fromResearchMemory(memory),
 *   ]
 *
 * Each adapter is just a SignalSource — small, swappable, no DB coupling.
 */

import type { Signal, SignalSource } from '../types.js'

export interface BrandMonitorSummaryRow {
  topic: string
  sentiment: number    // -1..1
  mentions: number
  observedAt: number
}

/**
 * Wrap a brand-monitor read function in a SignalSource. Sentiment
 * far from 0 (positive or negative) is interesting; mentions count
 * boosts the base score.
 */
export function fromBrandMonitor(
  fetcher: (since: Date) => Promise<BrandMonitorSummaryRow[]>,
): SignalSource {
  return {
    async fetch(since: Date): Promise<Signal[]> {
      const rows = await fetcher(since)
      return rows.map((r) => ({
        topic: r.topic,
        source: 'monitor',
        score: Math.min(1, Math.abs(r.sentiment) * 0.6 + Math.log10(r.mentions + 1) * 0.2),
        observedAt: r.observedAt,
        note: `${r.mentions} mentions, sentiment ${r.sentiment.toFixed(2)}`,
      }))
    },
  }
}

export interface TrendRow {
  topic: string
  velocityScore: number   // 0..1
  observedAt: number
  url?: string
}

export function fromTrendFinder(
  fetcher: (since: Date) => Promise<TrendRow[]>,
): SignalSource {
  return {
    async fetch(since: Date): Promise<Signal[]> {
      const rows = await fetcher(since)
      return rows.map((r) => ({
        topic: r.topic,
        source: 'trend',
        score: r.velocityScore,
        observedAt: r.observedAt,
        url: r.url,
        note: 'YouTube/trend gap',
      }))
    },
  }
}

export interface PastWinnerRow {
  topic: string
  /** revenue / engagement composite, raw */
  weight: number
  observedAt: number
}

export function fromPastWinners(
  fetcher: (since: Date) => Promise<PastWinnerRow[]>,
): SignalSource {
  return {
    async fetch(since: Date): Promise<Signal[]> {
      const rows = await fetcher(since)
      const max = rows.reduce((m, r) => Math.max(m, r.weight), 1)
      return rows.map((r) => ({
        topic: r.topic,
        source: 'past-winner',
        score: r.weight / max,
        observedAt: r.observedAt,
        note: 'past winner',
      }))
    },
  }
}
