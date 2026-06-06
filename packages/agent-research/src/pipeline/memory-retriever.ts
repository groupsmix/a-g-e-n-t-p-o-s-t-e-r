/**
 * Memory retriever — fans out the plan's sub-questions to the
 * MemoryClient in parallel, with bounded concurrency.
 *
 * The MemoryClient backs onto the user's own brain (D1 + FTS + vector
 * + recency, fused internally by @posteragent/memory).  This lane is
 * what makes agent-research "agentic RAG over own data":
 *
 *   - Each future research run gets cheaper as the brain grows.
 *   - Prior research outcomes are re-citeable without re-searching.
 *   - Memory-only mode (no SearchClient) is pure RAG.
 *
 * Shape and error semantics mirror searcher.ts deliberately:
 *
 *   - Bounded concurrency to avoid hammering D1 with parallel scans.
 *   - Per-query errors swallowed → empty memory finding, never throw.
 *   - Plan order preserved in the returned array.
 *
 * Why we re-stamp ids with the `m` prefix:
 *   Search results use `s001…`; memory items use `m001…`.  The
 *   synthesizer cites both via the same `[^ref]` mechanism but the
 *   prefix lets the dashboard distinguish brain hits from web hits.
 */

import type {
  MemoryClient,
  ResearchConfig,
  ResearchPlan,
  RetrievedMemory,
} from '../types.js'

export interface MemoryFinding {
  subQuestion: string
  memories: RetrievedMemory[]
}

export interface RunMemoryInput {
  plan: ResearchPlan
  memory: MemoryClient
  config: ResearchConfig
  log?: {
    warn(msg: string, meta?: Record<string, unknown>): void
  }
  signal?: AbortSignal
}

export async function runMemoryRetrievals(input: RunMemoryInput): Promise<MemoryFinding[]> {
  const { plan, memory, config } = input
  const queue = [...plan.subQuestions]
  const findings: MemoryFinding[] = []
  const workerCount = Math.max(1, Math.min(config.memoryConcurrency, queue.length))

  let nextId = 1
  const reserve = () => `m${(nextId++).toString().padStart(3, '0')}`

  const work = async () => {
    while (queue.length > 0) {
      const sq = queue.shift()
      if (sq === undefined) return
      try {
        const memories = await withTimeout(
          memory.retrieve({
            query: sq,
            maxResults: config.memoriesPerQuery,
            signal: input.signal,
          }),
          config.memoryTimeoutMs,
        )
        // Re-id memories with stable refs the synthesizer can cite.
        const stamped = memories.map((m) => ({ ...m, id: reserve() }))
        findings.push({ subQuestion: sq, memories: stamped })
      } catch (err) {
        input.log?.warn('memory retrieval failed for sub-question', {
          subQuestion: sq,
          error: err instanceof Error ? err.message : String(err),
        })
        findings.push({ subQuestion: sq, memories: [] })
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => work()))

  // Preserve plan order in the returned findings.
  const bySq = new Map(findings.map((f) => [f.subQuestion, f]))
  return plan.subQuestions
    .map((sq) => bySq.get(sq))
    .filter((f): f is MemoryFinding => f !== undefined)
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`memory retrieval timed out after ${ms}ms`)),
      ms,
    )
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
