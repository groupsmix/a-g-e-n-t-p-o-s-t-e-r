/**
 * @posteragent/orchestrator — type surface
 *
 * The orchestrator is the glue layer that takes a queued `AgentTask`,
 * loads identity + memory context, dispatches to the right handler,
 * and writes the outcome back to D1.
 *
 * Every concrete agent is just an object that satisfies `AgentHandler`.
 * Handlers stay tiny — heavy lifting (LLM calls, tool use, web fetches)
 * happens in the body, but the orchestrator owns the contract.
 */

import type { AgentResult, AgentTask, AgentTaskType } from '@posteragent/types'
import type { MemoryItem } from '@posteragent/memory'

// ─── Database binding (D1-compatible) ─────────────────────────────────────

/**
 * Minimal D1 surface used by orchestrator.  Mirrors the binding from
 * `@posteragent/memory` so the same `env.DB` works for both packages.
 */
export interface OrchestratorDB {
  prepare(query: string): {
    bind: (...values: unknown[]) => {
      run(): Promise<{ success: boolean; meta?: unknown }>
      first<T = unknown>(): Promise<T | null>
      all<T = unknown>(): Promise<{ results: T[] }>
    }
    run(): Promise<{ success: boolean; meta?: unknown }>
    first<T = unknown>(): Promise<T | null>
    all<T = unknown>(): Promise<{ results: T[] }>
  }
}

// ─── Agent execution context ──────────────────────────────────────────────

/**
 * What a handler receives at call time.  It carries:
 *   • the parsed task row (id, type, payload)
 *   • the assembled system prompt (soul + persona + NOW + memories)
 *   • the raw memory items used (so handlers can cite them)
 *   • a logger child bound to taskId
 *   • the DB binding for ad-hoc reads (rare; most handlers shouldn't write)
 *   • abort signal for cancellation
 */
export interface AgentContext<P = Record<string, unknown>> {
  task: AgentTask & { payload: P }
  systemPrompt: string
  memories: MemoryItem[]
  log: AgentLogger
  db: OrchestratorDB
  signal: AbortSignal
  /**
   * Helper to write a task event to the control-plane database.
   */
  logEvent?: (eventType: string, message: string) => Promise<void>
  /**
   * If set, the handler should attribute LLM calls to this owner-scoped
   * model alias.  Resolved from settings / env at dispatch time.
   */
  modelHint?: string
}

/**
 * Slim logger surface so the orchestrator doesn't hard-depend on pino.
 * Implementations can wrap `@posteragent/logger` or stdout.
 */
export interface AgentLogger {
  debug(msg: string, meta?: Record<string, unknown>): void
  info(msg: string, meta?: Record<string, unknown>): void
  warn(msg: string, meta?: Record<string, unknown>): void
  error(msg: string, meta?: Record<string, unknown>): void
}

// ─── Budget guard contract ─────────────────────────────────────────────────

/**
 * Structural slice of @posteragent/agent-budget's BudgetGuard (audit #44).
 * Declared here so the orchestrator can ENFORCE caps at dispatch time
 * without a hard package dependency. `approve` runs before a task is
 * claimed; `afterRun` records actual spend so caps see real usage.
 */
export interface TaskBudgetGuard {
  approve(args: {
    task_type: string
    model?: string
    input_tokens?: number
    output_tokens?: number
  }): Promise<{ allowed: boolean; notes: string[] }>
  afterRun(usage: {
    task_id: string
    task_type: string
    model: string
    input_tokens: number
    output_tokens: number
    cost_usd: number
    occurred_at: string
  }): Promise<void>
}

// ─── Handler contract ─────────────────────────────────────────────────────

/**
 * Outcome the handler returns.  The orchestrator translates this into an
 * `AgentResult`, persists the row, and writes follow-up memories.
 */
export interface HandlerOutcome<T = unknown> {
  status?: 'done' | 'failed' | 'needs_me'
  data: T
  /** What the orchestrator should persist to the journal entry. */
  summary: string
  /**
   * Optional memories to consolidate after this run.  Use sparingly —
   * the orchestrator also runs auto-consolidation from the journal.
   */
  memories?: Array<{
    type: 'fact' | 'event' | 'preference' | 'project' | 'identity'
    content: string
    tags?: string[]
  }>
  /** What we want the next planning loop to do (becomes NOW + persona hints). */
  nextActions?: string[]
  /** Token usage for cost accounting. */
  usage?: {
    model?: string
    inputTokens?: number
    outputTokens?: number
    costUsd?: number
  }
  /** Artifacts produced by this run. */
  artifacts?: Array<{
    kind: string
    url?: string
    content?: string
  }>
}

/**
 * A handler is anything with a `.run()` method.  Implementations are
 * typically defined as `defineAgent({ type, name, run })` for ergonomics.
 */
export interface AgentHandler<P = Record<string, unknown>, R = unknown> {
  /** The AgentTaskType this handler serves. */
  type: AgentTaskType
  /** Human-readable identifier (used in journal entries + dashboard). */
  name: string
  /** One-line capability statement (shown in /agents/registry response). */
  description: string
  /** The handler entry point. */
  run(ctx: AgentContext<P>): Promise<HandlerOutcome<R>>
}

// ─── Dispatch options ─────────────────────────────────────────────────────

export interface DispatchOptions {
  /** Max wall-clock for handler execution.  Default: 5 minutes. */
  timeoutMs?: number
  /** External abort signal — merged with the timeout. */
  signal?: AbortSignal
  /** Override system prompt assembly (e.g. for replay). */
  systemPromptOverride?: string
  /** Skip writing journal + memories on success.  Use for dry runs. */
  skipPersist?: boolean
  /** Skip manual approval policy check. Useful for tests. */
  skipApproval?: boolean
}

// ─── Public result alias (re-export for convenience) ──────────────────────

export type { AgentResult, AgentTask, AgentTaskType }
