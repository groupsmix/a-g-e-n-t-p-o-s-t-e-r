/**
 * Orchestrator handler shim.
 *
 * The orchestrator's AgentHandler contract expects an object with
 * `{ type, name, description, run(ctx) }`.  This module wraps the
 * `research()` pipeline so the orchestrator can register it as the
 * 'research' handler.
 *
 * The factory takes LLM + Search clients as deps so the dashboard /
 * Workers boot code can inject real adapters and tests can inject
 * mocks.  The handler itself stays small.
 *
 * Returned HandlerOutcome has:
 *   - data: the full ResearchReport (so the dashboard can render it)
 *   - summary: a one-line description for journal_entries
 *   - memories: one 'fact' per citation, so future agents can cite
 *               the same sources without re-searching
 *   - nextActions: hints for what to do with the research
 *   - usage: aggregated tokens (cost is added by BaseAgent)
 */

import type { LLMClient, ResearchConfig, ResearchReport, SearchClient } from './types.js'
import { research } from './pipeline/researcher.js'

export interface ResearchHandlerDeps {
  llm: LLMClient
  search: SearchClient
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
  return {
    type: 'research' as const,
    name: 'Deep Research Agent',
    description:
      'Planner → Search × N → Synthesis → Citation → Memory pipeline. Produces a cited Markdown narrative.',
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
        config: { ...deps.config, ...ctx.task.payload?.config },
        signal: ctx.signal,
        log: ctx.log,
      })

      const totalResults = report.findings.reduce((n, f) => n + f.results.length, 0)
      const summary = `Researched "${truncate(query, 100)}": ${report.plan.subQuestions.length} sub-questions, ${totalResults} sources, ${report.citations.length} citations`

      // One fact memory per citation — gives future agents a head start
      // and lets the memory layer dedupe by URL on consolidation.
      const memories = report.citations.map((c) => ({
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
