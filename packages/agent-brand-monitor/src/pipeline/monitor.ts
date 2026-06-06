/**
 * Top-level pipeline:
 *   scanMentions → scoreMentions → detectAlerts → MonitorReport
 *
 * Pure over injected (sources, scorer) clients. No I/O of its own.
 * The orchestrator's BaseAgent handles persistence, journal entries,
 * and dispatching follow-ups (e.g. queueing a write task to respond
 * to a viral mention).
 */

import type {
  MentionPlatform,
  MentionSource,
  MonitorConfig,
  MonitorReport,
  SentimentScorer,
} from '../types.js'
import { DEFAULT_CONFIG } from '../types.js'
import { scanMentions } from './scanner.js'
import { scoreMentions } from './scorer.js'
import { detectAlerts } from './alerter.js'

export interface MonitorInput {
  brand: string[]
  competitors?: string[]
  sources: MentionSource[]
  scorer?: SentimentScorer
  config?: Partial<MonitorConfig>
  signal?: AbortSignal
  log?: {
    info(msg: string, meta?: Record<string, unknown>): void
    warn(msg: string, meta?: Record<string, unknown>): void
  }
}

export async function monitor(input: MonitorInput): Promise<MonitorReport> {
  if (!input.brand?.length) {
    throw new Error('monitor(): `brand` must contain at least one term')
  }
  if (!input.sources?.length) {
    throw new Error('monitor(): at least one MentionSource is required')
  }

  const config: MonitorConfig = { ...DEFAULT_CONFIG, ...input.config }
  const competitors = input.competitors ?? []
  const startedAt = Date.now()

  // ── 1. Scan ───────────────────────────────────────────────────────
  const scanStart = Date.now()
  const { mentions, competitorIds } = await scanMentions({
    brand: input.brand,
    competitors,
    sources: input.sources,
    config,
    signal: input.signal,
    log: input.log,
  })
  const scanMs = Date.now() - scanStart

  // ── 2. Score ──────────────────────────────────────────────────────
  const sentimentStart = Date.now()
  const { scored, usage } = await scoreMentions({
    mentions,
    competitorIds,
    brand: input.brand,
    scorer: input.scorer,
    config,
    signal: input.signal,
    log: input.log,
  })
  const sentimentMs = Date.now() - sentimentStart

  // ── 3. Alert ──────────────────────────────────────────────────────
  const alertStart = Date.now()
  const alerts = detectAlerts({ scored, config })
  const alertMs = Date.now() - alertStart

  // ── 4. Summarise ──────────────────────────────────────────────────
  const summary = summarise(scored)

  const totalMs = Date.now() - startedAt
  input.log?.info('monitor: complete', {
    total: summary.total,
    alerts: alerts.length,
    totalMs,
  })

  return {
    brand: input.brand,
    competitors,
    sinceHours: config.sinceHours,
    mentions: scored,
    alerts,
    summary,
    timings: { scanMs, sentimentMs, alertMs, totalMs },
    usage,
  }
}

function summarise(scored: MonitorReport['mentions']): MonitorReport['summary'] {
  const byPlatform: Record<MentionPlatform, number> = {
    reddit: 0,
    hackernews: 0,
    news: 0,
    youtube: 0,
    twitter: 0,
    other: 0,
  }
  let pos = 0
  let neu = 0
  let neg = 0
  let viralitySum = 0
  for (const m of scored) {
    byPlatform[m.platform] += 1
    if (m.sentiment.label === 'positive') pos += 1
    else if (m.sentiment.label === 'negative') neg += 1
    else neu += 1
    viralitySum += m.virality
  }
  return {
    total: scored.length,
    positive: pos,
    neutral: neu,
    negative: neg,
    byPlatform,
    avgVirality: scored.length ? Math.round(viralitySum / scored.length) : 0,
  }
}
