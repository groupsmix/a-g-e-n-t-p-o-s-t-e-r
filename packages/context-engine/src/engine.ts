/**
 * Top-level ContextEngine. Composes all stages and emits a
 * ContextBundle + ContextUsageReport.
 *
 *   const engine = createContextEngine({ memory, pastTasks, signals, summariser })
 *   const { bundle, usage } = await engine.build({ taskType, query, payload })
 *   const result = await handler.run({ task, context: bundle })
 *   await engine.recordUsage(usage, {
 *     usedMemoryIds: ['m003','m007'],
 *     usedPastTaskIds: ['t002'],
 *   })
 */

import type {
  ContextBundle,
  ContextConfig,
  ContextRequest,
  ContextSummariser,
  ContextUsageReport,
  MemoryRetriever,
  PastTaskRetriever,
  SystemSignalsProvider,
} from './types.js'
import { DEFAULT_CONFIG } from './types.js'
import { retrieveContext } from './stages/retrieve.js'
import { compressIfNeeded } from './stages/compress.js'
import { loadSignals } from './stages/signals.js'
import { assemblePrelude } from './stages/assemble.js'
import { estimateTokens } from './tokens.js'

export interface ContextEngineDeps {
  memory?: MemoryRetriever
  pastTasks?: PastTaskRetriever
  signals?: SystemSignalsProvider
  summariser?: ContextSummariser
  config?: Partial<ContextConfig>
  log?: {
    info(msg: string, meta?: Record<string, unknown>): void
    warn(msg: string, meta?: Record<string, unknown>): void
  }
  /** Optional observability sink — called when recordUsage() fires. */
  onUsage?(report: ContextUsageReport): Promise<void> | void
}

export interface BuildResult {
  bundle: ContextBundle
  /** Pre-populated usage report; caller updates `*Used` arrays then calls recordUsage(). */
  usage: ContextUsageReport
}

export function createContextEngine(deps: ContextEngineDeps) {
  const cfg: ContextConfig = { ...DEFAULT_CONFIG, ...deps.config }

  return {
    async build(request: ContextRequest): Promise<BuildResult> {
      const config: ContextConfig = { ...cfg, ...request.config }
      const startedAt = Date.now()
      const bundleId = generateId()

      const [retrieved, signals] = await Promise.all([
        retrieveContext({
          query: request.query,
          taskType: request.taskType,
          memory: deps.memory,
          pastTasks: deps.pastTasks,
          config,
          signal: request.signal,
          log: deps.log,
        }),
        loadSignals({
          provider: deps.signals,
          config,
          signal: request.signal,
          log: deps.log,
        }),
      ])

      const prelude = assemblePrelude({
        query: request.query,
        taskType: request.taskType,
        memories: retrieved.memories,
        pastTasks: retrieved.pastTasks,
        signals,
      })

      const compressed = await compressIfNeeded({
        prelude,
        config,
        summariser: deps.summariser,
        signal: request.signal,
      })

      const totalRetrievedTokens =
        retrieved.memories.reduce((n, m) => n + estimateTokens(m.content), 0) +
        retrieved.pastTasks.reduce((n, t) => n + estimateTokens(t.summary), 0)

      const bundle: ContextBundle = {
        taskType: request.taskType,
        query: request.query,
        prelude: compressed.prelude,
        memories: retrieved.memories,
        pastTasks: retrieved.pastTasks,
        signals,
        preludeTokens: compressed.finalTokens,
        compressed: compressed.compressed
          ? {
              originalTokens: compressed.originalTokens,
              summarisedTokens: compressed.finalTokens,
              summariserName: compressed.summariserUsage?.name ?? 'truncate',
            }
          : undefined,
      }

      const usage: ContextUsageReport = {
        bundleId,
        taskType: request.taskType,
        query: request.query,
        memoryIdsRetrieved: retrieved.memories.map((m) => m.id),
        memoryIdsUsed: [],
        pastTaskIdsRetrieved: retrieved.pastTasks.map((t) => t.id),
        pastTaskIdsUsed: [],
        totalRetrievedTokens,
        compressed: compressed.compressed,
        engineMs: Date.now() - startedAt,
      }

      deps.log?.info('context-engine: built', {
        bundleId,
        taskType: request.taskType,
        memories: retrieved.memories.length,
        pastTasks: retrieved.pastTasks.length,
        preludeTokens: bundle.preludeTokens,
        compressed: bundle.compressed != null,
        engineMs: usage.engineMs,
      })

      return { bundle, usage }
    },

    async recordUsage(
      usage: ContextUsageReport,
      used: { memoryIds?: string[]; pastTaskIds?: string[] },
    ): Promise<void> {
      const merged: ContextUsageReport = {
        ...usage,
        memoryIdsUsed: dedupe([...(usage.memoryIdsUsed ?? []), ...(used.memoryIds ?? [])]),
        pastTaskIdsUsed: dedupe([
          ...(usage.pastTaskIdsUsed ?? []),
          ...(used.pastTaskIds ?? []),
        ]),
      }
      await deps.onUsage?.(merged)
    },
  }
}

function dedupe<T>(arr: T[]): T[] {
  return Array.from(new Set(arr))
}

function generateId(): string {
  // ULID-ish; small enough to dedupe globally for our volume.
  return (
    'cb_' +
    Date.now().toString(36) +
    '_' +
    Math.random().toString(36).slice(2, 8)
  )
}
