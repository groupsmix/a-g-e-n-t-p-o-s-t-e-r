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

    const ctx: AgentContext = {
      task,
      systemPrompt,
      memories,
      log: taskLog,
      db: this.db,
      signal: controller.signal,
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
    const status: 'done' | 'failed' = runError ? 'failed' : 'done'

    // ── 5. Persist journal + memories (best-effort) ───────────────────
    if (!opts.skipPersist) {
      await this.persistSafely(task, outcome, runError, taskLog)
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
    if (process.env.ORCHESTRATOR_DEBUG === '1') console.debug(`[orch] ${msg}`, meta)
  },
  info(msg, meta) {
    console.log(`[orch] ${msg}`, meta ?? '')
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
