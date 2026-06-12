/**
 * BaseAgent — wraps a raw handler with the brain layer.
 *
 * Responsibilities:
 *   1. Retrieve top-K memories for the task (MemoryRetriever)
 *   2. Assemble system prompt (IdentityLayer.buildSystemPrompt)
 *   3. Invoke the handler with the assembled context
 *   4. Persist the outcome (journal entry + new memories + cost)
 *   5. Tolerate brain-layer failures — never block task execution on
 *      retrieval or persistence errors.  The whole point of separating
 *      orchestration from handlers is that the handler should never
 *      have to care whether D1 is reachable.
 *
 * The class is intentionally small.  Composition over inheritance:
 * handlers are plain objects; BaseAgent runs them; nothing extends it.
 */

import type {
  AgentResult,
  AgentTask,
  AgentTaskType,
  MemoryItem,
} from '@posteragent/types'
import { MemoryRetriever, type EmbeddingProvider } from '@posteragent/memory'
import { IdentityLayer } from '@posteragent/identity'

import type {
  AgentContext,
  AgentHandler,
  AgentLogger,
  DispatchOptions,
  HandlerOutcome,
  OrchestratorDB,
} from './types.js'
import { estimateCostUsd } from './cost.js'
import { evaluateApprovalPolicy } from './approval-policy.js'

// Re-cast our DB binding through `as any` at construction time — the
// memory + identity packages declare their own `D1Database` shape and
// the orchestrator carries its own.  Structurally identical; we just
// don't want a hard import cycle.

export interface BaseAgentOptions {
  db: OrchestratorDB
  embedder?: EmbeddingProvider
  identity?: IdentityLayer
  /** Top-K memories to inject into the system prompt.  Default: 8. */
  memoryK?: number
  /** Logger used for orchestration events (not handler logs). */
  log?: AgentLogger
}

export class BaseAgent {
  private readonly db: OrchestratorDB
  private readonly identity: IdentityLayer
  private readonly retriever: MemoryRetriever | null
  private readonly memoryK: number
  private readonly log: AgentLogger

  constructor(private readonly handler: AgentHandler, opts: BaseAgentOptions) {
    this.db = opts.db
    this.log = opts.log ?? consoleLogger
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.identity = opts.identity ?? new IdentityLayer(opts.db as any)
    this.retriever = opts.embedder
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? new MemoryRetriever(opts.db as any, opts.embedder)
      : null
    this.memoryK = opts.memoryK ?? 8
  }

  get type(): AgentTaskType {
    return this.handler.type
  }

  get name(): string {
    return this.handler.name
  }

  /**
   * Execute the handler against the given task.  All persistence is
   * best-effort — the AgentResult is the source of truth returned to
   * the caller (queue worker / API route).
   */
  async run(task: AgentTask, opts: DispatchOptions = {}): Promise<AgentResult> {
    const startedAt = Date.now()
    const taskLog = childLogger(this.log, {
      taskId: task.id,
      agent: this.handler.name,
      type: task.type,
    })

    // ── 0. Check Approval Policy ──────────────────────────────────────
    const decision = evaluateApprovalPolicy(task)
    if (decision.requiresApproval && !opts.skipApproval) {
      let approval: { status: string } | null = null
      try {
        approval = await this.db
          .prepare(
            `SELECT status FROM approval_requests WHERE task_id = ? ORDER BY created_at DESC LIMIT 1`
          )
          .bind(task.id)
          .first<{ status: string }>()
      } catch (err) {
        taskLog.warn('failed to check approval request', {
          taskId: task.id,
          error: err instanceof Error ? err.message : String(err),
        })
      }

      if (!approval) {
        try {
          const approvalId = crypto.randomUUID().replace(/-/g, '').slice(0, 32)
          await this.db
            .prepare(
              `INSERT INTO approval_requests (id, task_id, action_type, risk_level, status) VALUES (?, ?, ?, ?, 'pending')`
            )
            .bind(approvalId, task.id, decision.actionType!, decision.riskLevel!)
            .run()

          const notificationId = crypto.randomUUID().replace(/-/g, '').slice(0, 32)
          await this.db
            .prepare(
              `INSERT INTO notifications (id, type, title, message, read) VALUES (?, 'approval_needed', ?, ?, 0)`
            )
            .bind(notificationId, `Approval Required`, `Task ${task.id} (${task.type}) requires approval: ${decision.reason}`)
            .run()
        } catch (err) {
          taskLog.warn('failed to create approval request/notification', {
            taskId: task.id,
            error: err instanceof Error ? err.message : String(err),
          })
        }

        await this.logEventSafely(
          task.id,
          'approval_requested',
          `Approval requested. Reason: ${decision.reason}`,
          taskLog
        )

        return {
          taskId: task.id,
          type: task.type,
          status: 'needs_me',
          error: `Task requires manual approval: ${decision.reason}`,
          costUsd: 0,
          durationMs: Date.now() - startedAt,
        }
      } else if (approval.status === 'pending') {
        return {
          taskId: task.id,
          type: task.type,
          status: 'needs_me',
          error: 'Task is awaiting approval.',
          costUsd: 0,
          durationMs: Date.now() - startedAt,
        }
      } else if (approval.status === 'changes_requested') {
        return {
          taskId: task.id,
          type: task.type,
          status: 'needs_me',
          error: 'Changes were requested by user.',
          costUsd: 0,
          durationMs: Date.now() - startedAt,
        }
      } else if (approval.status === 'rejected') {
        return {
          taskId: task.id,
          type: task.type,
          status: 'failed',
          error: 'Task was rejected by user.',
          costUsd: 0,
          durationMs: Date.now() - startedAt,
        }
      }
    }

    // Log start event
    await this.logEventSafely(task.id, 'started', `Agent ${this.handler.name} started task execution`, taskLog)

    // ── 1. Retrieve memories (best-effort) ────────────────────────────
    const memories = await this.retrieveSafely(task, taskLog)

    // ── 2. Assemble system prompt (best-effort, fall back to soul-only)
    const systemPrompt =
      opts.systemPromptOverride ??
      (await this.buildPromptSafely(task, memories, taskLog))

    // ── 3. Build abort signal that respects external + timeout ────────
    const controller = new AbortController()
    const timeoutMs = opts.timeoutMs ?? 5 * 60_000
    const timer = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs)
    if (opts.signal) {
      opts.signal.addEventListener('abort', () => controller.abort(opts.signal!.reason), {
        once: true,
      })
    }

    const logEvent = async (eventType: string, message: string) => {
      await this.logEventSafely(task.id, eventType, message, taskLog)
    }

    const ctx: AgentContext = {
      task,
      systemPrompt,
      memories,
      log: taskLog,
      db: this.db,
      signal: controller.signal,
      logEvent,
    }

    // ── 4. Run the handler ────────────────────────────────────────────
    let outcome: HandlerOutcome | null = null
    let runError: Error | null = null
    try {
      outcome = await this.handler.run(ctx)
    } catch (err) {
      runError = err instanceof Error ? err : new Error(String(err))
      taskLog.error('handler threw', { error: runError.message })
    } finally {
      clearTimeout(timer)
    }

    const durationMs = Date.now() - startedAt
    const status: 'done' | 'failed' | 'needs_me' = runError ? 'failed' : (outcome?.status ?? 'done')

    // Log completion / failure event
    if (status === 'failed') {
      await this.logEventSafely(task.id, 'failed', `Task failed: ${runError?.message ?? outcome?.summary}`, taskLog)
    } else {
      await this.logEventSafely(task.id, 'completed', `Task completed: ${outcome?.summary}`, taskLog)
    }

    // ── 5. Persist journal + memories (best-effort) ───────────────────
    if (!opts.skipPersist) {
      await this.persistSafely(task, outcome, runError, taskLog)
    }

    // Persist artifacts if any
    if (outcome?.artifacts && outcome.artifacts.length > 0) {
      for (const art of outcome.artifacts) {
        try {
          const artId = crypto.randomUUID().replace(/-/g, '').slice(0, 32)
          await this.db
            .prepare(`INSERT INTO artifacts (id, task_id, kind, url, content) VALUES (?, ?, ?, ?, ?)`)
            .bind(artId, task.id, art.kind, art.url ?? null, art.content ?? null)
            .run()

          await this.logEventSafely(
            task.id,
            'artifact_created',
            `Saved artifact: ${art.kind}${art.url ? ` (${art.url})` : ''}`,
            taskLog
          )
        } catch (err) {
          taskLog.warn('failed to persist artifact', {
            taskId: task.id,
            error: err instanceof Error ? err.message : String(err),
          })
        }
      }
    }

    // ── 6. Compute cost + build AgentResult ───────────────────────────
    const usage = outcome?.usage ?? {}
    const costUsd =
      usage.costUsd ??
      estimateCostUsd(usage.model, usage.inputTokens ?? 0, usage.outputTokens ?? 0)

    return {
      taskId: task.id,
      type: task.type,
      status,
      data: outcome?.data,
      error: runError?.message,
      costUsd,
      durationMs,
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  private async retrieveSafely(task: AgentTask, log: AgentLogger): Promise<MemoryItem[]> {
    if (!this.retriever) return []
    try {
      const query = buildRetrievalQuery(task)
      const hits = await this.retriever.retrieve(query, { limit: this.memoryK })
      // The retriever returns ScoredMemory[]; strip the score so handlers
      // get plain MemoryItem (still typed via @posteragent/types).
      return hits.map((h) => stripScore(h))
    } catch (err) {
      log.warn('memory retrieve failed; continuing with no memories', {
        error: err instanceof Error ? err.message : String(err),
      })
      return []
    }
  }

  private async buildPromptSafely(
    task: AgentTask,
    memories: MemoryItem[],
    log: AgentLogger,
  ): Promise<string> {
    try {
      return await this.identity.buildSystemPrompt({
        agent: this.handler.name,
        nowScope: 'global',
        memories: memories.map((m) => `[${m.type}] ${m.content}`),
      })
    } catch (err) {
      log.warn('system prompt assembly failed; falling back to soul-only', {
        error: err instanceof Error ? err.message : String(err),
      })
      try {
        const soul = await this.identity.soul.load()
        return soul
      } catch {
        return `You are NEXUS. Task: ${task.type}.`
      }
    }
  }

  private async persistSafely(
    task: AgentTask,
    outcome: HandlerOutcome | null,
    runError: Error | null,
    log: AgentLogger,
  ): Promise<void> {
    try {
      await this.identity.journal.append({
        taskId: task.id,
        agentId: this.handler.name,
        summary: runError
          ? `[failed] ${runError.message.slice(0, 240)}`
          : outcome?.summary ?? `${this.handler.name} ran with no summary`,
        outcome: runError ? 'failed' : 'success',
        learnings: outcome?.memories?.map((m) => m.content) ?? [],
        followUps: outcome?.nextActions ?? [],
      })
    } catch (err) {
      log.warn('journal append failed', {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  private async logEventSafely(
    taskId: string,
    eventType: string,
    message: string,
    log: AgentLogger,
  ): Promise<void> {
    try {
      const id = crypto.randomUUID().replace(/-/g, '').slice(0, 32)
      await this.db
        .prepare(`INSERT INTO task_events (id, task_id, event_type, message) VALUES (?, ?, ?, ?)`)
        .bind(id, taskId, eventType, message)
        .run()
    } catch (err) {
      log.warn('failed to insert task event', {
        taskId,
        eventType,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }
}

// ─── Module-level helpers ──────────────────────────────────────────────

function buildRetrievalQuery(task: AgentTask): string {
  // Use task type + first 200 chars of stringified payload as the retrieval
  // hook.  Cheap, deterministic, and good enough for hybrid search.
  const payloadStr = (() => {
    try {
      return JSON.stringify(task.payload).slice(0, 200)
    } catch {
      return ''
    }
  })()
  return `${task.type} ${payloadStr}`.trim()
}

function stripScore<T extends { item?: MemoryItem }>(hit: T): MemoryItem {
  // Memory retriever returns either ScoredMemory ({ item, score }) or a
  // bare MemoryItem depending on lane.  Normalise.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (hit as any).item ?? (hit as unknown as MemoryItem)
}

const consoleLogger: AgentLogger = {
  debug(msg, meta) {
    // `process` is undefined in Cloudflare Workers unless nodejs_compat is
    // enabled with the right flags. Guard so calling `log.debug(...)` on a
    // BaseAgent without an explicit logger doesn't ReferenceError.
    // AUDIT-PR20 #6.
    if (typeof process !== 'undefined' && process.env?.ORCHESTRATOR_DEBUG === '1') {
      console.info(`[orch] ${msg}`, meta)
    }
  },
  info(msg, meta) {
    console.info(`[orch] ${msg}`, meta ?? '')
  },
  warn(msg, meta) {
    console.warn(`[orch] ${msg}`, meta ?? '')
  },
  error(msg, meta) {
    console.error(`[orch] ${msg}`, meta ?? '')
  },
}

function childLogger(parent: AgentLogger, bindings: Record<string, unknown>): AgentLogger {
  const prefix = Object.entries(bindings)
    .map(([k, v]) => `${k}=${v}`)
    .join(' ')
  return {
    debug: (msg, meta) => parent.debug(`${prefix} ${msg}`, meta),
    info: (msg, meta) => parent.info(`${prefix} ${msg}`, meta),
    warn: (msg, meta) => parent.warn(`${prefix} ${msg}`, meta),
    error: (msg, meta) => parent.error(`${prefix} ${msg}`, meta),
  }
}
