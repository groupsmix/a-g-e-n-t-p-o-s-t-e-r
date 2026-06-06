/**
 * Deep Research Agent handler — registered for AgentTaskType 'research'.
 *
 * This file ships a stub so the orchestrator stays self-contained and
 * the default registry remains exhaustive.  The real handler lives in
 * `@posteragent/agent-research` (TASK-400).  Boot code wires it by
 * overriding the registry:
 *
 *   import { createResearchHandler } from '@posteragent/agent-research'
 *   import { createAnthropicLLM, createTavilySearch }
 *     from '@posteragent/agent-research/adapters'
 *
 *   const registry = defaultRegistry()
 *   registry.override(createResearchHandler({
 *     llm: createAnthropicLLM({ apiKey: env.ANTHROPIC_API_KEY }),
 *     search: createTavilySearch({ apiKey: env.TAVILY_API_KEY }),
 *   }))
 *
 * Keeping the agent in its own package avoids forcing every orchestrator
 * consumer (tests, registry typechecks) to pull in Anthropic + Tavily.
 */
import { defineStub } from './_stub.js'

export const researchHandler = defineStub({
  type: 'research',
  name: 'Deep Research Agent (stub)',
  description:
    'Planner → Search × N → Synthesis → Citation → Memory pipeline. Real handler in @posteragent/agent-research; boot code calls registry.override().',
  phase: 'Phase 4 (TASK-400) — real handler shipped, wiring pending',
})
