/**
 * Researcher — top-level pipeline orchestration.
 *
 *   plan → fan-out search → synthesize → ResearchReport
 *
 * Pure function over injected (LLM, search) clients.  No I/O of its
 * own except through those clients.  The orchestrator's BaseAgent
 * handles persistence; we just return a structured report.
 */

import type {
  LLMClient,
  ResearchConfig,
  ResearchReport,
  SearchClient,
} from '../types.js'
import { DEFAULT_CONFIG } from '../types.js'
import { planResearch } from './planner.js'
import { runSearches } from './searcher.js'
import { synthesize } from './synthesizer.js'

export interface ResearchInput {
  query: string
  llm: LLMClient
  search: SearchClient
  config?: Partial<ResearchConfig>
  signal?: AbortSignal
  log?: {
    info(msg: string, meta?: Record<string, unknown>): void
    warn(msg: string, meta?: Record<string, unknown>): void
  }
}

export async function research(input: ResearchInput): Promise<ResearchReport> {
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

  // ── 2. Search ────────────────────────────────────────────────────
  const searchStart = Date.now()
  const findings = await runSearches({
    plan,
    search: input.search,
    config,
    log: input.log,
    signal: input.signal,
  })
  const searchMs = Date.now() - searchStart
  const totalResults = findings.reduce((n, f) => n + f.results.length, 0)
  input.log?.info('research: search complete', {
    findings: findings.length,
    totalResults,
    searchMs,
  })

  // ── 3. Synthesize ────────────────────────────────────────────────
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
      searchMs,
      synthMs,
      totalMs: Date.now() - startedAt,
    },
  }
}
