/**
 * @posteragent/agent-research
 *
 * TASK-400 — Deep Research Agent (web).
 * TASK-401 — Agentic RAG over own data (memory lane).
 *
 * Public surface:
 *
 *   import { research } from '@posteragent/agent-research'
 *   import { createResearchHandler } from '@posteragent/agent-research'
 *   import { createAnthropicLLM, createTavilySearch } from '@posteragent/agent-research/adapters'
 *
 *   // Web-only (classic):
 *   const handler = createResearchHandler({ llm, search })
 *
 *   // Hybrid web + brain RAG:
 *   const handler = createResearchHandler({ llm, search, memory })
 *
 *   // Memory-only — pure RAG over the user's own data:
 *   const handler = createResearchHandler({ llm, memory })
 *
 *   registry.register('research', handler)
 */

export { research } from './pipeline/researcher.js'
export type { ResearchInput } from './pipeline/researcher.js'

export { planResearch } from './pipeline/planner.js'
export { runSearches } from './pipeline/searcher.js'
export { runMemoryRetrievals } from './pipeline/memory-retriever.js'
export type { MemoryFinding, RunMemoryInput } from './pipeline/memory-retriever.js'
export { synthesize } from './pipeline/synthesizer.js'

export { createResearchHandler } from './handler.js'
export type {
  ResearchHandlerDeps,
  ResearchPayload,
  ResearchHandlerOutcome,
} from './handler.js'

export type {
  LLMClient,
  LLMMessage,
  LLMCompletion,
  SearchClient,
  SearchResult,
  MemoryClient,
  RetrievedMemory,
  ResearchPlan,
  Finding,
  Citation,
  ResearchReport,
  ResearchConfig,
} from './types.js'

export { DEFAULT_CONFIG } from './types.js'
