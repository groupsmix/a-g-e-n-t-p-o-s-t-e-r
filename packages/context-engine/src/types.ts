/**
 * @posteragent/context-engine — types
 *
 * The engine is middleware: it sits between the orchestrator's
 * BaseAgent.run() entrypoint and the per-task handler. Every handler
 * gets a richer, more relevant context object than it could have
 * assembled on its own — and importantly, every handler gets the SAME
 * shape, so future handlers don't reinvent the wheel.
 *
 * Pipeline shape:
 *
 *   ContextRequest (taskType, query, payload)
 *     → retrieveMemories   (top-K relevant facts/events/preferences)
 *     → retrievePastTasks  (RAG over prior successful task results)
 *     → compressIfNeeded   (sliding-window summarisation when over cap)
 *     → injectSystemSignals (today's date, active goals, perf stats)
 *     → emit ContextBundle + UsageReport
 *
 * The handler reads the bundle, runs its real work, and the
 * UsageReport flows back into the journal so we can observe which
 * pieces of context actually drove behaviour.
 */

import type { AgentTaskType } from '@posteragent/types'

// ─── Inputs ───────────────────────────────────────────────────────────

export interface ContextRequest {
  taskType: AgentTaskType
  /** The user-facing prompt / query / topic — what the agent will act on. */
  query: string
  /** Free-form payload the orchestrator received. */
  payload?: Record<string, unknown>
  /** Caller-supplied limit override. */
  config?: Partial<ContextConfig>
  signal?: AbortSignal
}

// ─── Memory + past-task retrieval (provider-agnostic) ─────────────────

export interface RetrievedMemory {
  id: string
  type: string
  content: string
  source: string
  createdAt?: string
  /** Retrieval relevance (0..1) from the backing store. */
  score?: number
}

export interface MemoryRetriever {
  readonly name: string
  retrieve(input: {
    query: string
    maxResults?: number
    types?: string[]
    signal?: AbortSignal
  }): Promise<RetrievedMemory[]>
}

export interface PastTask {
  id: string
  taskType: AgentTaskType
  summary: string
  /** Pulled from the journal — the durable side. */
  resultExcerpt?: string
  status: 'done' | 'failed'
  finishedAt: string
  /** Retrieval relevance (0..1) from the journal store. */
  score?: number
}

export interface PastTaskRetriever {
  readonly name: string
  retrieve(input: {
    query: string
    taskType?: AgentTaskType
    maxResults?: number
    signal?: AbortSignal
  }): Promise<PastTask[]>
}

// ─── System signals ──────────────────────────────────────────────────

export interface SystemSignals {
  /** ISO; injected so models never trust their training cutoff again. */
  nowIso: string
  /** Owner's active goals, surfaced from identity layer. */
  activeGoals?: string[]
  /** Rolling perf stats (last 7d task success rate, avg cost, etc.) */
  recentPerformance?: {
    successRate: number
    tasksLast7d: number
    avgCostUsd: number
    avgDurationMs: number
  }
  /** Free-form owner-defined context (timezone, language, persona). */
  ambient?: Record<string, string>
}

export interface SystemSignalsProvider {
  readonly name: string
  load(input: { signal?: AbortSignal }): Promise<SystemSignals>
}

// ─── Compressor ──────────────────────────────────────────────────────

export interface ContextSummariser {
  readonly name: string
  /**
   * Compresses a chunk of context to ≤ targetTokens. Returns a
   * shorter string and an estimate of tokens consumed by the call
   * itself (so the budget accounting stays honest).
   */
  summarise(input: {
    text: string
    targetTokens: number
    signal?: AbortSignal
  }): Promise<{ text: string; inputTokens: number; outputTokens: number }>
}

// ─── Output ──────────────────────────────────────────────────────────

export interface ContextBundle {
  taskType: AgentTaskType
  query: string
  /** A serialised, model-ready prelude that handlers can drop into a
   *  system or user message. */
  prelude: string
  memories: RetrievedMemory[]
  pastTasks: PastTask[]
  signals: SystemSignals
  /** Estimated total tokens in `prelude`. */
  preludeTokens: number
  /** Compression metadata when summarisation ran. */
  compressed?: {
    originalTokens: number
    summarisedTokens: number
    summariserName: string
  }
}

/**
 * Observability report. After the handler runs, callers can mark which
 * memories / past-tasks were actually used; the engine records that
 * onto the next snapshot so future retrievals can learn.
 */
export interface ContextUsageReport {
  bundleId: string
  taskType: AgentTaskType
  query: string
  memoryIdsRetrieved: string[]
  memoryIdsUsed: string[]
  pastTaskIdsRetrieved: string[]
  pastTaskIdsUsed: string[]
  totalRetrievedTokens: number
  /** True when injection budget was exceeded and summarisation kicked in. */
  compressed: boolean
  /** Wall-clock for the engine pass itself. */
  engineMs: number
}

// ─── Config ──────────────────────────────────────────────────────────

export interface ContextConfig {
  /** Top-K memories. Default 6. */
  maxMemories: number
  /** Top-K past tasks. Default 4. */
  maxPastTasks: number
  /** Max tokens the prelude is allowed to consume. Default 4000. */
  preludeTokenCap: number
  /** When the assembled prelude exceeds this, run the summariser. */
  compressionTrigger: number
  /** Filter memory retrieval to these types when set. */
  memoryTypes?: string[]
  /** Per-stage timeouts. */
  retrieveTimeoutMs: number
  summariseTimeoutMs: number
}

export const DEFAULT_CONFIG: ContextConfig = {
  maxMemories: 6,
  maxPastTasks: 4,
  preludeTokenCap: 4000,
  compressionTrigger: 3500,
  retrieveTimeoutMs: 15_000,
  summariseTimeoutMs: 30_000,
}
