/**
 * Content planner handler. Registers under 'analyse' with
 * payload.kind='content-calendar'. Emits one write nextAction per
 * scheduled post so the Writer agent picks them up.
 */

import type { BrandProfile, ContentCalendar, Signal, SignalSource } from './types.js'
import {
  runContentPlanner,
  type ContentPlannerDeps,
  type ContentPlannerInput,
} from './pipeline/planner.js'

export interface ContentPlannerPayload extends Omit<ContentPlannerInput, 'sources'> {
  kind?: 'content-calendar'
  /** Adapters supply sources at orchestrator boot, not via payload. */
}

export interface ContentPlannerHandlerDeps extends ContentPlannerDeps {
  sources?: SignalSource[]
}

export interface ContentPlannerHandlerOutcome {
  data: ContentCalendar
  summary: string
  memories: Array<{ kind: 'fact'; content: string; meta?: Record<string, unknown> }>
  nextActions: Array<{ type: string; reason: string; payload?: Record<string, unknown> }>
  usage: { inputTokens: number; outputTokens: number }
}

export function createContentPlannerHandler(deps: ContentPlannerHandlerDeps) {
  return {
    type: 'analyse' as const,
    name: 'content-planner',
    description: 'Weekly calendar from trends + monitor + research. TASK-600.',
    async run(ctx: { payload: ContentPlannerPayload }): Promise<ContentPlannerHandlerOutcome> {
      const calendar = await runContentPlanner(
        { ...ctx.payload, sources: deps.sources },
        deps,
      )
      const summary =
        `Planned ${calendar.schedule.length} posts across ${new Set(calendar.schedule.map((s) => s.platform)).size} platforms ` +
        `from ${calendar.ideas.length} ranked ideas.`
      const nextActions: ContentPlannerHandlerOutcome['nextActions'] = calendar.schedule.map((s) => ({
        type: 'write',
        reason: `scheduled ${s.platform} post`,
        payload: {
          ideaId: s.ideaId,
          platform: s.platform,
          format: s.format,
          publishAt: s.publishAt,
          idea: calendar.ideas.find((i) => i.id === s.ideaId),
        },
      }))
      return {
        data: calendar,
        summary,
        memories: [],
        nextActions,
        usage: { inputTokens: 0, outputTokens: 0 },
      }
    },
  }
}
