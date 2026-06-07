/**
 * Top-level pipeline: fetch → extract → cluster → gap → brief.
 */

import type {
  LLMClient,
  TranscriptSource,
  TrendConfig,
  TrendReport,
  TrendSource,
} from '../types.js'
import { DEFAULT_CONFIG } from '../types.js'
import { fetchTrending } from './fetcher.js'
import {
  extractHooks,
  extractThumbnailPatterns,
  extractTitlePatterns,
  extractVelocity,
} from './extractor.js'
import { clusterTopics } from './cluster.js'
import { findGaps } from './gap-finder.js'
import { generateBriefs } from './brief-gen.js'

export interface TrendInput {
  niches: string[]
  source: TrendSource
  transcripts?: TranscriptSource
  llm?: LLMClient
  config?: Partial<TrendConfig>
  signal?: AbortSignal
  log?: {
    info(msg: string, meta?: Record<string, unknown>): void
    warn(msg: string, meta?: Record<string, unknown>): void
  }
}

export async function analyseTrends(input: TrendInput): Promise<TrendReport> {
  if (!input.niches?.length) {
    throw new Error('analyseTrends(): at least one niche is required')
  }

  const config: TrendConfig = { ...DEFAULT_CONFIG, ...input.config }
  const startedAt = Date.now()

  // ── 1. Fetch ─────────────────────────────────────────────────────
  const fetchStart = Date.now()
  const videos = await fetchTrending({
    niches: input.niches,
    source: input.source,
    config,
    signal: input.signal,
    log: input.log,
  })
  const fetchMs = Date.now() - fetchStart

  // ── 2. Extract patterns (synchronous, cheap) ────────────────────
  const extractStart = Date.now()
  const titlePatterns = extractTitlePatterns(videos)
  const hooks = await extractHooks({
    videos,
    transcripts: input.transcripts,
    signal: input.signal,
  })
  const thumbnails = extractThumbnailPatterns(videos)
  const velocity = extractVelocity(videos)
  const extractMs = Date.now() - extractStart

  // ── 3. Cluster ───────────────────────────────────────────────────
  const clusterStart = Date.now()
  const { clusters, usage: clusterUsage } = await clusterTopics({
    videos,
    llm: input.llm,
    config,
    signal: input.signal,
  })
  const clusterMs = Date.now() - clusterStart

  // ── 4. Gap-find ──────────────────────────────────────────────────
  const gapStart = Date.now()
  const gaps = findGaps({ clusters, videos, velocity, config })
  const gapMs = Date.now() - gapStart

  // ── 5. Briefs ────────────────────────────────────────────────────
  const briefStart = Date.now()
  const { briefs, usage: briefUsage } = await generateBriefs({
    gaps,
    videos,
    llm: input.llm,
    config,
    signal: input.signal,
    log: input.log,
  })
  const briefMs = Date.now() - briefStart

  const totalMs = Date.now() - startedAt
  input.log?.info('trends: complete', {
    videos: videos.length,
    clusters: clusters.length,
    gaps: gaps.length,
    briefs: briefs.length,
    totalMs,
  })

  return {
    niches: input.niches,
    videos,
    titlePatterns,
    hooks,
    thumbnails,
    velocity,
    clusters,
    gaps,
    briefs,
    timings: { fetchMs, extractMs, clusterMs, gapMs, briefMs, totalMs },
    usage: {
      ...clusterUsage,
      ...briefUsage,
    },
  }
}
