/**
 * Orchestrator handler shim.
 *
 * The orchestrator's AgentHandler contract expects an object with
 * `{ type, name, description, run(ctx) }`.  This module wraps the
 * `research()` pipeline so the orchestrator can register it as the
 * 'research' handler.
 *
 * The factory takes LLM + Search + Memory clients as deps so the
 * dashboard / Workers boot code can inject real adapters and tests
 * can inject mocks.  The handler itself stays small.
 *
 * `search` and `memory` are individually optional but at least one
 * must be supplied.  Common configs:
 *
 *   { llm, search }          — classic web-only research (TASK-400)
 *   { llm, search, memory }  — hybrid: web + brain RAG (TASK-401)
 *   { llm, memory }          — pure RAG over the user's own data
 *
 * Returned HandlerOutcome has:
 *   - data: the full ResearchReport (so the dashboard can render it)
 *   - summary: a one-line description for journal_entries
 *   - memories: one 'fact' per WEB citation, so future agents can
 *               cite the same sources without re-searching.  Brain
 *               citations are NOT re-memorized (would be a no-op
 *               loop — they came from memory).
 *   - nextActions: hints for what to do with the research
 *   - usage: aggregated tokens (cost is added by BaseAgent)
 */

import type {
  LLMClient,
  MemoryClient,
  ResearchConfig,
  ResearchReport,
  SearchClient,
} from './types.js'
import { research } from './pipeline/researcher.js'

export interface ResearchHandlerDeps {
  llm: LLMClient
  /** Provide at least one of `search` or `memory`. */
  search?: SearchClient
  /** Provide at least one of `search` or `memory`. */
  memory?: MemoryClient
  config?: Partial<ResearchConfig>
}

export interface ResearchPayload {
  query: string
  /** Per-task overrides. */
  config?: Partial<ResearchConfig>
}

export interface ResearchHandlerOutcome {
  data: ResearchReport
  summary: string
  memories: Array<{
    type: 'fact' | 'event' | 'preference' | 'project' | 'identity'
    content: string
    tags?: string[]
  }>
  nextActions: string[]
  usage: {
    model?: string
    inputTokens: number
    outputTokens: number
  }
}

export function createResearchHandler(deps: ResearchHandlerDeps) {
  if (!deps.search && !deps.memory) {
    throw new Error(
      'createResearchHandler(): at least one of `search` or `memory` must be provided',
    )
  }

  return {
    type: 'research' as const,
    name: 'Deep Research Agent',
    description:
      'Planner → (Web Search + Memory RAG) → Synthesis → Citation → Memory pipeline. Produces a cited Markdown narrative. Web-only, memory-only, and hybrid modes all supported.',
    async run(ctx: {
      task: { id: string; payload: ResearchPayload }
      log?: {
        info(msg: string, meta?: Record<string, unknown>): void
        warn(msg: string, meta?: Record<string, unknown>): void
      }
      signal?: AbortSignal
    }): Promise<ResearchHandlerOutcome> {
      const query = (ctx.task.payload?.query ?? '').trim()
      if (!query) {
        throw new Error("research handler: payload.query is required and was empty")
      }

      const report = await research({
        query,
        llm: deps.llm,
        search: deps.search,
        memory: deps.memory,
        config: { ...deps.config, ...ctx.task.payload?.config },
        signal: ctx.signal,
        log: ctx.log,
      })

      const totalResults = report.findings.reduce((n, f) => n + f.results.length, 0)
      const totalMemories = report.findings.reduce(
        (n, f) => n + (f.memories?.length ?? 0),
        0,
      )
      const webCitations = report.citations.filter((c) => c.kind !== 'memory')
      const memCitations = report.citations.filter((c) => c.kind === 'memory')
      const mode = deps.search && deps.memory ? 'hybrid' : deps.memory ? 'memory-only' : 'web'
      const summary = `Researched "${truncate(query, 100)}" (${mode}): ${report.plan.subQuestions.length} sub-questions, ${totalResults} web + ${totalMemories} brain sources, ${webCitations.length}/${memCitations.length} web/brain citations`

      // Persist ONLY web citations as facts.  Brain citations would
      // round-trip a memory back into memory; the orchestrator
      // doesn't need that.
      const memories = webCitations.map((c) => ({
        type: 'fact' as const,
        content: `Source: ${c.title} — ${c.url}`,
        tags: ['research', 'citation', report.query.toLowerCase().slice(0, 32)],
      }))

      return {
        data: report,
        summary,
        memories,
        nextActions: [
          'Review the report and approve citations',
          'Queue a write task to turn this into a blog post or thread',
        ],
        usage: {
          model: deps.config?.synthModel ?? deps.config?.plannerModel,
          inputTokens: report.usage.plannerInputTokens + report.usage.synthInputTokens,
          outputTokens: report.usage.plannerOutputTokens + report.usage.synthOutputTokens,
        },
      }
    },
  }
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}
