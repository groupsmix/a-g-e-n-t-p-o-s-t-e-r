/**
 * Scanner — fan-out across every registered MentionSource, in parallel,
 * for every brand/competitor term. Dedupes by URL and re-stamps stable
 * `m###` ids so downstream stages can refer to mentions in citations.
 *
 * Failures in one source never bring down the others — they're logged
 * and recorded as gaps. This keeps the cron loop robust against API
 * outages and rate limits.
 */

import type {
  Mention,
  MentionSource,
  MonitorConfig,
} from '../types.js'

export interface ScannerInput {
  brand: string[]
  competitors: string[]
  sources: MentionSource[]
  config: MonitorConfig
  signal?: AbortSignal
  log?: {
    info(msg: string, meta?: Record<string, unknown>): void
    warn(msg: string, meta?: Record<string, unknown>): void
  }
}

export interface ScannerOutput {
  mentions: Mention[]
  /** True when the term originated from the competitors list. Keyed by mention id. */
  competitorIds: Set<string>
}

export async function scanMentions(input: ScannerInput): Promise<ScannerOutput> {
  const { brand, competitors, sources, config } = input
  const allTerms = [
    ...brand.map((t) => ({ term: t, isCompetitor: false })),
    ...competitors.map((t) => ({ term: t, isCompetitor: true })),
  ]

  // Cross-product (source × term), then race them concurrently with
  // a soft per-call timeout so a slow API doesn't stall the whole scan.
  const jobs: Array<Promise<{
    mentions: Mention[]
    isCompetitor: boolean
    sourceName: string
  }>> = []

  for (const src of sources) {
    for (const { term, isCompetitor } of allTerms) {
      jobs.push(
        withTimeout(
          src.scan({
            terms: [term],
            sinceHours: config.sinceHours,
            maxResults: config.maxResultsPerSource,
            signal: input.signal,
          }),
          config.scanTimeoutMs,
        )
          .then((mentions) => ({
            mentions: mentions.map((m) => ({ ...m, matchedTerm: m.matchedTerm ?? term })),
            isCompetitor,
            sourceName: src.name,
          }))
          .catch((err: unknown) => {
            input.log?.warn('scan: source failed', {
              source: src.name,
              term,
              error: (err as Error).message,
            })
            return {
              mentions: [] as Mention[],
              isCompetitor,
              sourceName: src.name,
            }
          }),
      )
    }
  }

  const results = await Promise.all(jobs)

  // Dedupe by URL — same Reddit thread might match "Posteragent" AND
  // "AGENTPOSTER" if the user fat-fingers a competitor list.
  const byUrl = new Map<string, { mention: Mention; isCompetitor: boolean }>()
  for (const { mentions, isCompetitor } of results) {
    for (const m of mentions) {
      const existing = byUrl.get(m.url)
      if (!existing) {
        byUrl.set(m.url, { mention: m, isCompetitor })
      } else if (existing.isCompetitor && !isCompetitor) {
        // Prefer brand-matched over competitor-matched for the same URL.
        byUrl.set(m.url, { mention: m, isCompetitor })
      }
    }
  }

  // Re-stamp ids and split competitor flags.
  const mentions: Mention[] = []
  const competitorIds = new Set<string>()
  let i = 1
  for (const { mention, isCompetitor } of byUrl.values()) {
    const newId = `m${String(i).padStart(3, '0')}`
    mentions.push({ ...mention, id: newId })
    if (isCompetitor) competitorIds.add(newId)
    i += 1
  }

  // Most recent first so the dashboard feed reads top-down.
  mentions.sort((a, b) => {
    const ta = a.publishedAt ? Date.parse(a.publishedAt) : 0
    const tb = b.publishedAt ? Date.parse(b.publishedAt) : 0
    return tb - ta
  })

  input.log?.info('scan: complete', {
    totalRaw: results.reduce((n, r) => n + r.mentions.length, 0),
    unique: mentions.length,
    sources: sources.map((s) => s.name),
  })

  return { mentions, competitorIds }
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      p,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timeout ${ms}ms`)), ms)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}
