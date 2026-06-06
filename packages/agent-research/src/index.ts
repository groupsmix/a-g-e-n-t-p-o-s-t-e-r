/**
 * @posteragent/agent-research
 *
 * TASK-400 — Deep Research Agent.
 *
 * Public surface:
 *
 *   import { research } from '@posteragent/agent-research'      // raw pipeline
 *   import { createResearchHandler } from '@posteragent/agent-research'  // orchestrator handler
 *   import { createAnthropicLLM, createTavilySearch } from '@posteragent/agent-research/adapters'
 *
 *   const llm = createAnthropicLLM({ apiKey: env.ANTHROPIC_API_KEY })
 *   const search = createTavilySearch({ apiKey: env.TAVILY_API_KEY })
 *   const handler = createResearchHandler({ llm, search })
 *
 *   registry.register('research', handler)
 */

export { research } from './pipeline/researcher.js'
export type { ResearchInput } from './pipeline/researcher.js'

export { planResearch } from './pipeline/planner.js'
export { runSearches } from './pipeline/searcher.js'
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
  ResearchPlan,
  Finding,
  Citation,
  ResearchReport,
  ResearchConfig,
} from './types.js'

export { DEFAULT_CONFIG } from './types.js'
