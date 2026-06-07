/**
 * Fetcher — fan-out trending fetches across niches in parallel.
 * Resilient to per-source failures; aggregates videos and tags each
 * with its source niche so downstream stages can group correctly.
 */

import type { TrendConfig, TrendSource, Video } from '../types.js'

export interface FetcherInput {
  niches: string[]
  source: TrendSource
  config: TrendConfig
  signal?: AbortSignal
  log?: {
    info(msg: string, meta?: Record<string, unknown>): void
    warn(msg: string, meta?: Record<string, unknown>): void
  }
}

export async function fetchTrending(input: FetcherInput): Promise<Video[]> {
  const publishedAfter = new Date(
    Date.now() - input.config.windowHours * 3600 * 1000,
  ).toISOString()

  const jobs = input.niches.map((niche) =>
    withTimeout(
      input.source.fetchTrending({
        niche,
        publishedAfter,
        maxResults: input.config.videosPerNiche,
        region: input.config.region,
        signal: input.signal,
      }),
      input.config.fetchTimeoutMs,
    )
      .then((videos) => videos.map((v) => ({ ...v, niche })))
      .catch((err: unknown) => {
        input.log?.warn('fetcher: niche failed', {
          niche,
          error: (err as Error).message,
        })
        return [] as Video[]
      }),
  )

  const grouped = await Promise.all(jobs)
  const flat = grouped.flat()
  input.log?.info('fetcher: complete', {
    niches: input.niches.length,
    videos: flat.length,
  })
  return flat
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
