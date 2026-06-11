/**
 * runAgentTask — single entry point used by:
 *   • the nexus-api `/api/agents/run` route
 *   • the worker queue consumer
 *   • the proactivity engine (TASK-202) when it auto-queues tasks
 *
 * Responsibilities:
 *   1. Load the task row from `agent_tasks`
 *   2. Atomically mark it `running` (CAS on status='queued')
 *   3. Pick the right handler from the registry
 *   4. Wrap the handler in BaseAgent (memory + identity injection)
 *   5. Persist the outcome back to `agent_tasks` (done | failed) with
 *      cost + duration + token usage
 *   6. Return the AgentResult to the caller
 *
 * All steps are idempotent on retry — a `running` task can be re-run
 * by passing `force: true`.
 */

import type { AgentResult, AgentTask, AgentTaskType } from '@posteragent/types'
import type { EmbeddingProvider } from '@posteragent/memory'
import type { IdentityLayer } from '@posteragent/identity'

import { BaseAgent } from './base-agent.js'
import type { AgentLogger, DispatchOptions, OrchestratorDB, TaskBudgetGuard } from './types.js'
import { AgentRegistry } from './registry.js'

export interface RunAgentTaskDeps {
  db: OrchestratorDB
  registry: AgentRegistry
  embedder?: EmbeddingProvider
  identity?: IdentityLayer
  log?: AgentLogger
  /**
   * Audit #44: when provided, every dispatch is pre-flighted against the
   * configured spend caps and actual cost is recorded after the run. The
   * guard was previously wired into WireDeps but never consulted — caps
   * existed in the dashboard while tasks spent freely.
   */
  budget?: TaskBudgetGuard
}

export interface RunAgentTaskOptions extends DispatchOptions {
  /** Re-run a task that's already `running` or `done`. */
  force?: boolean
}

export async function runAgentTask(
  taskId: string,
  deps: RunAgentTaskDeps,
  opts: RunAgentTaskOptions = {},
): Promise<AgentResult> {
  const task = await loadTask(deps.db, taskId)
  if (!task) {
    throw new Error(`runAgentTask: task ${taskId} not found`)
  }

  if (!opts.force && task.status !== 'queued') {
    throw new Error(
      `runAgentTask: task ${taskId} is ${task.status} (use force:true to re-run)`,
    )
  }

  const handler = deps.registry.get(task.type)
  if (!handler) {
    await markFailed(deps.db, taskId, `no handler for type ${task.type}`)
    return {
      taskId,
      type: task.type,
      status: 'failed',
      error: `no handler for type ${task.type}`,
      durationMs: 0,
    }
  }

  // Audit #44: pre-flight the spend caps BEFORE claiming the task, so a
  // blocked task stays `failed` with an explicit budget error instead of
  // burning provider credits. Guard infrastructure errors fail OPEN (run
  // proceeds, warning logged): a broken D1 table must not halt the fleet,
  // and the post-run recording below is what keeps caps accurate.
  if (deps.budget) {
    let allowed = true
    let notes: string[] = []
    try {
      const decision = await deps.budget.approve({
        task_type: task.type,
        model: task.modelUsed,
        input_tokens: task.inputTokens,
        output_tokens: task.outputTokens,
      })
      allowed = decision.allowed
      notes = decision.notes
    } catch (err) {
      deps.log?.warn('budget pre-flight errored — failing open', {
        taskId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
    if (!allowed) {
      const msg = `budget cap exceeded: ${notes.join(' ') || 'estimated cost exceeds remaining budget'}`
      deps.log?.warn('task blocked by budget cap', { taskId, type: task.type, notes })
      await markFailed(deps.db, taskId, msg)
      return { taskId, type: task.type, status: 'failed', error: msg, durationMs: 0 }
    }
  }

  // Atomic transition queued → running.  If another worker beat us to
  // it, `meta.changes` will be 0 and we bail unless force is set.
  if (!opts.force) {
    const claimed = await claimTask(deps.db, taskId)
    if (!claimed) {
      throw new Error(`runAgentTask: task ${taskId} was claimed by another worker`)
    }
  } else {
    await markRunning(deps.db, taskId)
  }

  // Wrap + run.
  const agent = new BaseAgent(handler, {
    db: deps.db,
    embedder: deps.embedder,
    identity: deps.identity,
    log: deps.log,
  })

  const result = await agent.run(task, opts)

  // Persist final state.
  await finaliseTask(deps.db, result)

  // Audit #44: record actual spend so the caps reflect reality. Failed
  // runs are recorded too — a crash halfway through a run still spent
  // money. Recording errors are logged, never thrown: usage accounting
  // must not turn a successful task into a failed one.
  if (deps.budget && (result.costUsd ?? 0) > 0) {
    try {
      await deps.budget.afterRun({
        task_id: taskId,
        task_type: task.type,
        model: task.modelUsed ?? 'unknown',
        input_tokens: task.inputTokens ?? 0,
        output_tokens: task.outputTokens ?? 0,
        cost_usd: result.costUsd ?? 0,
        occurred_at: new Date().toISOString(),
      })
    } catch (err) {
      deps.log?.warn('budget usage recording failed', {
        taskId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return result
}

// ─── D1 helpers ────────────────────────────────────────────────────────

async function loadTask(db: OrchestratorDB, id: string): Promise<AgentTask | null> {
  const row = await db
    .prepare(
      `SELECT id, type, payload, status, result, error,
              estimated_cost_usd, actual_cost_usd, model_used,
              input_tokens, output_tokens, duration_ms, agent_id,
              created_at, updated_at
       FROM agent_tasks WHERE id = ?`,
    )
    .bind(id)
    .first<TaskRow>()
  if (!row) return null
  return rowToTask(row)
}

async function claimTask(db: OrchestratorDB, id: string): Promise<boolean> {
  const res = await db
    .prepare(
      `UPDATE agent_tasks
       SET status = 'running', updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'queued'`,
    )
    .bind(id)
    .run()
  // D1 reports changed rows in meta.changes.  Treat any successful run
  // with positive changes as a claim.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const meta = (res.meta ?? {}) as any
  return res.success && (meta.changes ?? meta.rows_written ?? 0) > 0
}

async function markRunning(db: OrchestratorDB, id: string): Promise<void> {
  await db
    .prepare(
      `UPDATE agent_tasks SET status = 'running', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    )
    .bind(id)
    .run()
}

async function markFailed(
  db: OrchestratorDB,
  id: string,
  error: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE agent_tasks
       SET status = 'failed', error = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    .bind(error.slice(0, 1000), id)
    .run()
}

async function finaliseTask(db: OrchestratorDB, result: AgentResult): Promise<void> {
  const resultJson = result.data === undefined ? null : safeJson(result.data)
  await db
    .prepare(
      `UPDATE agent_tasks
       SET status = ?,
           result = ?,
           error = ?,
           actual_cost_usd = ?,
           duration_ms = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    .bind(
      result.status,
      resultJson,
      result.error ?? null,
      result.costUsd ?? 0,
      result.durationMs ?? 0,
      result.taskId,
    )
    .run()
}

interface TaskRow {
  id: string
  type: string
  payload: string | null
  status: string
  result: string | null
  error: string | null
  estimated_cost_usd: number | null
  actual_cost_usd: number | null
  model_used: string | null
  input_tokens: number | null
  output_tokens: number | null
  duration_ms: number | null
  agent_id: string | null
  created_at: string
  updated_at: string
}

function rowToTask(row: TaskRow): AgentTask {
  return {
    id: row.id,
    type: row.type as AgentTaskType,
    payload: safeParse(row.payload) ?? {},
    status: row.status as AgentTask['status'],
    result: safeParse(row.result),
    error: row.error ?? undefined,
    estimatedCostUsd: row.estimated_cost_usd ?? undefined,
    actualCostUsd: row.actual_cost_usd ?? undefined,
    modelUsed: row.model_used ?? undefined,
    inputTokens: row.input_tokens ?? undefined,
    outputTokens: row.output_tokens ?? undefined,
    durationMs: row.duration_ms ?? undefined,
    agentId: row.agent_id ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }
}

function safeParse(v: string | null): Record<string, unknown> | undefined {
  if (!v) return undefined
  try {
    return JSON.parse(v) as Record<string, unknown>
  } catch {
    return undefined
  }
}

function safeJson(v: unknown): string | null {
  try {
    return JSON.stringify(v)
  } catch (err) {
    // AUDIT-PR20 #14: previously this silently returned null, so a row
    // with `result = NULL` could mean either "no data" or "data had a
    // circular ref". Log the failure so future-us can tell them apart.
    // eslint-disable-next-line no-console
    console.warn('[orch] safeJson failed — result will be stored as NULL', {
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}
