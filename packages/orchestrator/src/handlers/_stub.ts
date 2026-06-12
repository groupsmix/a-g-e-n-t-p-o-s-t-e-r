/**
 * Shared scaffold for stub handlers.
 *
 * Most Phase 3 handlers are placeholders — the registry is wired so the
 * dashboard, command palette, and worker can dispatch by AgentTaskType,
 * but the actual logic ships in later phases (Research = Phase 4,
 * Builder = Phase 5, Content = Phase 6, etc.).
 *
 * `defineStub` produces a handler that:
 *   • returns a clean "not implemented" outcome (status=done, no data)
 *   • emits one follow-up so journal consolidation has something to
 *     surface to the proactivity engine ("this handler still needs
 *     implementation in Phase X")
 *   • never throws — so a stale `/api/agents/run` invocation against an
 *     unimplemented type degrades gracefully instead of erroring out
 */

import type { AgentTaskType } from '@posteragent/types'
import type { AgentContext, AgentHandler, HandlerOutcome } from '../types.js'

export interface DefineStubInput {
  type: AgentTaskType
  name: string
  description: string
  /** Which V2 phase ships the real implementation. */
  phase: string
}

export function defineStub(input: DefineStubInput): AgentHandler {
  return {
    type: input.type,
    name: input.name,
    description: input.description,
    async run(ctx: AgentContext): Promise<HandlerOutcome> {
      ctx.log.info('stub handler invoked', {
        type: input.type,
        phase: input.phase,
      })
      return {
        status: 'failed',
        data: {
          stub: true,
          phase: input.phase,
          message: `Handler "${input.name}" is a Phase 3 stub. Real implementation lands in ${input.phase}.`,
        },
        summary: `${input.name} (stub) acknowledged task ${ctx.task.id}; ${input.phase} not yet built.`,
        nextActions: [`Implement ${input.name} in ${input.phase}`],
      }
    },
  }
}
