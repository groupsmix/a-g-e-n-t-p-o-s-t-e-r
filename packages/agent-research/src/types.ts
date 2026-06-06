/**
 * @posteragent/agent-research — types
 *
 * The deep research pipeline is provider-agnostic.  It depends only
 * on the LLMClient and SearchClient interfaces below — concrete
 * provider adapters (Anthropic, OpenAI, Brave, Tavily, Exa, Serper)
 * are wired at boot.  Tests inject mocks of these same interfaces.
 *
 * Pipeline shape:
 *
 *   Query
 *     → Planner       (LLM call → list of N sub-questions)
 *     → Searcher × N  (parallel SearchClient calls)
 *     → Synthesizer   (LLM call → narrative + inline citations)
 *     → ResearchReport
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
 * A finding is a sub-question paired with the top search results that
 * answered it.  The synthesizer reads findings and produces the
 * narrative.
 */
export interface Finding {
  subQuestion: string
  results: SearchResult[]
}

// ─── Report ────────────────────────────────────────────────────────────

export interface Citation {
  /** Matches SearchResult.id from one of the findings. */
  ref: string
  url: string
  title: string
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
}

export const DEFAULT_CONFIG: ResearchConfig = {
  maxSubQuestions: 4,
  resultsPerQuery: 6,
  searchConcurrency: 4,
  plannerTimeoutMs: 30_000,
  searchTimeoutMs: 20_000,
  synthTimeoutMs: 90_000,
}
