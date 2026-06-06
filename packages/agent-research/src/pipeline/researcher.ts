/**
 * Researcher — top-level pipeline orchestration.
 *
 *   plan → fan-out search + memory (parallel) → synthesize → ResearchReport
 *
 * Pure function over injected (LLM, search, memory) clients.  No I/O
 * of its own except through those clients.  The orchestrator's
 * BaseAgent handles persistence; we just return a structured report.
 *
 * At least one of `search` or `memory` must be provided.  Both are
 * supported simultaneously — they run in parallel and the synthesizer
 * sees both lanes' results per sub-question.  "Memory-only" mode
 * (no SearchClient) makes the whole pipeline pure RAG over the brain.
 */

import type {
  Finding,
  LLMClient,
  MemoryClient,
  ResearchConfig,
  ResearchReport,
  SearchClient,
} from '../types.js'
import { DEFAULT_CONFIG } from '../types.js'
import { planResearch } from './planner.js'
import { runSearches } from './searcher.js'
import { runMemoryRetrievals } from './memory-retriever.js'
import { synthesize } from './synthesizer.js'

export interface ResearchInput {
  query: string
  llm: LLMClient
  /** Provide at least one of `search` or `memory`. */
  search?: SearchClient
  /** Provide at least one of `search` or `memory`. */
  memory?: MemoryClient
  config?: Partial<ResearchConfig>
  signal?: AbortSignal
  log?: {
    info(msg: string, meta?: Record<string, unknown>): void
    warn(msg: string, meta?: Record<string, unknown>): void
  }
}

export async function research(input: ResearchInput): Promise<ResearchReport> {
  if (!input.search && !input.memory) {
    throw new Error(
      'research(): at least one of `search` or `memory` must be provided',
    )
  }

  const config: ResearchConfig = { ...DEFAULT_CONFIG, ...input.config }
  const startedAt = Date.now()

  // ── 1. Plan ──────────────────────────────────────────────────────
  const planStart = Date.now()
  const { plan, usage: plannerUsage } = await planResearch({
    query: input.query,
    llm: input.llm,
    config,
    signal: input.signal,
  })
  const plannerMs = Date.now() - planStart
  input.log?.info('research: plan complete', {
    subQuestions: plan.subQuestions.length,
    plannerMs,
  })

  // ── 2. Search + Memory (parallel) ────────────────────────────────
  const lanesStart = Date.now()
  const searchStart = input.search ? Date.now() : 0
  const memoryStart = input.memory ? Date.now() : 0

  const searchPromise = input.search
    ? runSearches({
        plan,
        search: input.search,
        config,
        log: input.log,
        signal: input.signal,
      }).then((r) => ({ findings: r, ms: Date.now() - searchStart }))
    : Promise.resolve({ findings: [] as Finding[], ms: 0 })

  const memoryPromise = input.memory
    ? runMemoryRetrievals({
        plan,
        memory: input.memory,
        config,
        log: input.log,
        signal: input.signal,
      }).then((r) => ({ findings: r, ms: Date.now() - memoryStart }))
    : Promise.resolve({ findings: [], ms: 0 })

  const [searchOut, memoryOut] = await Promise.all([searchPromise, memoryPromise])
  const lanesMs = Date.now() - lanesStart

  // ── 3. Merge into Finding[] preserving plan order ────────────────
  const webBySq = new Map(searchOut.findings.map((f) => [f.subQuestion, f]))
  const memBySq = new Map(memoryOut.findings.map((f) => [f.subQuestion, f]))
  const findings: Finding[] = plan.subQuestions.map((sq) => {
    const web = webBySq.get(sq)
    const mem = memBySq.get(sq)
    return {
      subQuestion: sq,
      results: web?.results ?? [],
      memories: input.memory ? (mem?.memories ?? []) : undefined,
    }
  })

  const totalResults = findings.reduce((n, f) => n + f.results.length, 0)
  const totalMemories = findings.reduce(
    (n, f) => n + (f.memories?.length ?? 0),
    0,
  )
  input.log?.info('research: retrieval complete', {
    findings: findings.length,
    totalResults,
    totalMemories,
    searchMs: searchOut.ms,
    memoryMs: memoryOut.ms,
    lanesMs,
  })

  // ── 4. Synthesize ────────────────────────────────────────────────
  const synthStart = Date.now()
  const { narrative, citations, usage: synthUsage } = await synthesize({
    query: input.query,
    findings,
    llm: input.llm,
    config,
    signal: input.signal,
  })
  const synthMs = Date.now() - synthStart
  input.log?.info('research: synthesis complete', {
    citations: citations.length,
    narrativeChars: narrative.length,
    synthMs,
  })

  return {
    query: input.query,
    plan,
    findings,
    narrative,
    citations,
    usage: {
      plannerInputTokens: plannerUsage.input,
      plannerOutputTokens: plannerUsage.output,
      synthInputTokens: synthUsage.input,
      synthOutputTokens: synthUsage.output,
    },
    timings: {
      plannerMs,
      searchMs: searchOut.ms,
      memoryMs: memoryOut.ms,
      synthMs,
      totalMs: Date.now() - startedAt,
    },
  }
}
