/**
 * @posteragent/context-engine
 *
 * TASK-405 — Every agent call passes through this engine, which:
 *
 *   1. Retrieves top-K relevant memories from the brain.
 *   2. Retrieves top-K past task results (RAG over the journal).
 *   3. Loads live system signals (now, active goals, recent perf).
 *   4. Assembles a clean Markdown prelude.
 *   5. Compresses to fit a token budget (LLM summariser or truncate
 *      fallback).
 *   6. Returns a ContextBundle + a ContextUsageReport the handler
 *      updates to mark which items it actually used.
 *
 * Wire-up (orchestrator BaseAgent.run):
 *
 *   const engine = createContextEngine({
 *     memory: memoryRetrieverAdapter,
 *     pastTasks: journalPastTaskAdapter,
 *     signals: identitySignalsAdapter,
 *     summariser: anthropicSummariser,
 *     onUsage: (report) => journal.recordContextUsage(report),
 *   })
 *
 *   const { bundle, usage } = await engine.build({ taskType, query, payload })
 *   const outcome = await handler.run({ task, context: bundle })
 *   await engine.recordUsage(usage, {
 *     memoryIds: outcome.usedContext?.memoryIds,
 *     pastTaskIds: outcome.usedContext?.pastTaskIds,
 *   })
 */

export { createContextEngine } from './engine.js'
export type { ContextEngineDeps, BuildResult } from './engine.js'

export {
  retrieveContext,
  compressIfNeeded,
  loadSignals,
  assemblePrelude,
} from './stages/index.js'

export { estimateTokens } from './tokens.js'

export type {
  ContextRequest,
  ContextBundle,
  ContextUsageReport,
  ContextConfig,
  RetrievedMemory,
  MemoryRetriever,
  PastTask,
  PastTaskRetriever,
  SystemSignals,
  SystemSignalsProvider,
  ContextSummariser,
} from './types.js'

export { DEFAULT_CONFIG } from './types.js'
