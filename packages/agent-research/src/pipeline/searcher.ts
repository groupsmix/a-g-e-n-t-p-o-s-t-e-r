/**
 * Searcher — fans out the plan's sub-questions to the SearchClient
 * in parallel, with bounded concurrency.
 *
 * Why bounded concurrency:
 *   Most search providers rate-limit per second.  An unbounded
 *   Promise.all() will burst and trip 429s.
 *
 * Why we swallow per-query errors:
 *   One failed sub-search shouldn't kill the whole research run.
 *   The finding for that sub-question gets an empty results array,
 *   and the synthesizer notes the gap.
 */

import type { Finding, ResearchConfig, ResearchPlan, SearchClient } from '../types.js'

export interface RunSearchInput {
  plan: ResearchPlan
  search: SearchClient
  config: ResearchConfig
  log?: {
    warn(msg: string, meta?: Record<string, unknown>): void
  }
  signal?: AbortSignal
}

export async function runSearches(input: RunSearchInput): Promise<Finding[]> {
  const { plan, search, config } = input
  const queue = [...plan.subQuestions]
  const findings: Finding[] = []
  const workerCount = Math.max(1, Math.min(config.searchConcurrency, queue.length))

  let nextId = 1
  const reserve = () => `s${(nextId++).toString().padStart(3, '0')}`

  const work = async () => {
    while (queue.length > 0) {
      const sq = queue.shift()
      if (sq === undefined) return
      try {
        const results = await withTimeout(
          search.search({
            query: sq,
            maxResults: config.resultsPerQuery,
            signal: input.signal,
          }),
          config.searchTimeoutMs,
        )
        // Re-id results with stable refs the synthesizer can cite.
        const stamped = results.map((r) => ({ ...r, id: reserve() }))
        findings.push({ subQuestion: sq, results: stamped })
      } catch (err) {
        input.log?.warn('search failed for sub-question', {
          subQuestion: sq,
          error: err instanceof Error ? err.message : String(err),
        })
        findings.push({ subQuestion: sq, results: [] })
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => work()))

  // Preserve plan order in the returned findings.
  const byQuestion = new Map(findings.map((f) => [f.subQuestion, f]))
  return plan.subQuestions
    .map((sq) => byQuestion.get(sq))
    .filter((f): f is Finding => f !== undefined)
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`search timed out after ${ms}ms`)), ms)
    p.then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      (e) => {
        clearTimeout(timer)
        reject(e)
      },
    )
  })
}
