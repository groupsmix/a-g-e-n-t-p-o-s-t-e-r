/**
 * @posteragent/agent-research — types
 *
 * The deep research pipeline is provider-agnostic.  It depends only
 * on the LLMClient, SearchClient, and MemoryClient interfaces below —
 * concrete provider adapters (Anthropic, OpenAI, Brave, Tavily, Exa,
 * Serper) and memory backends (D1+FTS, Vectorize, etc.) are wired at
 * boot.  Tests inject mocks of these same interfaces.
 *
 * Pipeline shape:
 *
 *   Query
 *     → Planner             (LLM call → list of N sub-questions)
 *     → Per sub-question, in parallel:
 *         ├── Searcher      (SearchClient call → web results)
 *         └── Memory lane   (MemoryClient call → brain hits)        ← TASK-401
 *     → Synthesizer         (LLM call → narrative + inline citations)
 *     → ResearchReport
 *
 * At least one of SearchClient or MemoryClient must be provided.
 * "Memory-only" mode (no SearchClient) is pure RAG over the brain.
 *
 * Every step is independently testable and individually swappable.
 */

// ─── LLM ───────────────────────────────────────────────────────────────

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface LLMCompletion {
  text: string
  model: string
  usage: {
    inputTokens: number
    outputTokens: number
  }
}

export interface LLMClient {
  /** Stable name used in logs and cost ledger. */
  readonly name: string
  complete(input: {
    messages: LLMMessage[]
    /** Optional override; otherwise the client picks its default. */
    model?: string
    maxTokens?: number
    temperature?: number
    /** Caller-supplied abort signal. */
    signal?: AbortSignal
  }): Promise<LLMCompletion>
}

// ─── Search ────────────────────────────────────────────────────────────

export interface SearchResult {
  /** Stable id used by the synthesizer for inline citation refs. */
  id: string
  title: string
  url: string
  snippet: string
  /** Optional retrieval relevance from the upstream API in [0,1]. */
  score?: number
  publishedAt?: string
  source?: string
}

export interface SearchClient {
  readonly name: string
  search(input: {
    query: string
    maxResults?: number
    signal?: AbortSignal
  }): Promise<SearchResult[]>
}

// ─── Memory (TASK-401) ─────────────────────────────────────────────────

/**
 * A single retrieved memory item, surfaced from the user's own brain
 * via the @posteragent/memory store (or any compatible backend).
 *
 * Identifiers are upstream-supplied; the memory-retriever lane will
 * re-stamp them with `m001`, `m002`... so the synthesizer can cite
 * them with the same `[^ref]` mechanism it uses for web sources.
 */
export interface RetrievedMemory {
  /** Stable id used by the synthesizer for inline citation refs. */
  id: string
  /** Memory type label — typically 'fact' | 'event' | 'preference' | 'project' | 'identity'. */
  type: string
  content: string
  /** Where the memory came from — e.g. 'journal:2026-06-06', 'agent:research', 'user'. */
  source: string
  tags?: string[]
  /** Original creation time as ISO string. */
  createdAt?: string
  /** Optional retrieval relevance — typically the RRF score from memory's internal fusion. */
  score?: number
}

export interface MemoryClient {
  readonly name: string
  retrieve(input: {
    query: string
    maxResults?: number
    /** Optional type filter passed through to the backing store. */
    types?: string[]
    signal?: AbortSignal
  }): Promise<RetrievedMemory[]>
}

// ─── Plan ──────────────────────────────────────────────────────────────

export interface ResearchPlan {
  query: string
  /** Sub-questions the searcher will fan out to in parallel. */
  subQuestions: string[]
  /** Optional rationale the LLM produced. */
  rationale?: string
}

// ─── Finding ───────────────────────────────────────────────────────────

/**
 * A finding is a sub-question paired with the top sources that answered
 * it — both web results and (optionally) memory hits.  The synthesizer
 * reads findings and produces the narrative.
 *
 * `memories` is undefined when no MemoryClient was provided.
 * `results` is an empty array (not undefined) when no web search ran,
 * preserving the existing field shape for legacy consumers.
 */
export interface Finding {
  subQuestion: string
  results: SearchResult[]
  memories?: RetrievedMemory[]
}

// ─── Report ────────────────────────────────────────────────────────────

export interface Citation {
  /** Matches SearchResult.id or RetrievedMemory.id from one of the findings. */
  ref: string
  url: string
  title: string
  /** Which lane this citation came from.  Defaults to 'web' for back-compat. */
  kind?: 'web' | 'memory'
}

export interface ResearchReport {
  query: string
  plan: ResearchPlan
  findings: Finding[]
  /**
   * The synthesized narrative.  Uses inline [^ref] markers that point
   * at `citations[].ref`.  The dashboard renders these as footnotes.
   */
  narrative: string
  citations: Citation[]
  /** Token + cost accounting across every LLM call in the pipeline. */
  usage: {
    plannerInputTokens: number
    plannerOutputTokens: number
    synthInputTokens: number
    synthOutputTokens: number
    /** Cost is added by the orchestrator's BaseAgent, not the agent itself. */
  }
  /** Wall-clock per stage, for the dashboard timeline. */
  timings: {
    plannerMs: number
    searchMs: number
    /** Memory retrieval lane wall-clock.  0 when no MemoryClient was provided. */
    memoryMs: number
    synthMs: number
    totalMs: number
  }
}

// ─── Pipeline config ───────────────────────────────────────────────────

export interface ResearchConfig {
  /** Number of sub-questions the planner produces.  Default 4. */
  maxSubQuestions: number
  /** Max results per sub-question search.  Default 6. */
  resultsPerQuery: number
  /** Max concurrent searches (1 = serial, N = full fanout).  Default 4. */
  searchConcurrency: number
  /** Per-stage hard timeouts in ms. */
  plannerTimeoutMs: number
  searchTimeoutMs: number
  synthTimeoutMs: number
  /** Optional model overrides — adapter chooses default otherwise. */
  plannerModel?: string
  synthModel?: string

  // ─── Memory lane (TASK-401) ─────────────────────────────────────────

  /** Max memory hits per sub-question.  Default 4. */
  memoriesPerQuery: number
  /** Memory retrieval timeout in ms.  Default 10s. */
  memoryTimeoutMs: number
  /** Max concurrent memory retrievals.  Default 4. */
  memoryConcurrency: number
}

export const DEFAULT_CONFIG: ResearchConfig = {
  maxSubQuestions: 4,
  resultsPerQuery: 6,
  searchConcurrency: 4,
  plannerTimeoutMs: 30_000,
  searchTimeoutMs: 20_000,
  synthTimeoutMs: 90_000,
  memoriesPerQuery: 4,
  memoryTimeoutMs: 10_000,
  memoryConcurrency: 4,
}
