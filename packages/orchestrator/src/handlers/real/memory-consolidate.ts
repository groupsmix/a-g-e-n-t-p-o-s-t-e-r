/**
 * Real `memory-consolidate` handler — pulls every unconsolidated journal
 * entry, runs the rule-based extractor in @posteragent/memory, and
 * persists the produced PutOptions[] into the memory store. Flips the
 * journal row's `consolidated` flag so we don't reprocess.
 *
 * Payload: { limit?: number } (default 50)
 */

import type { AgentContext, AgentHandler, HandlerOutcome } from '../../types.js'
import { Journal } from '@posteragent/identity/journal'
import { MemoryStore, type EmbeddingProvider, extractFromJournal } from '@posteragent/memory'

export interface MemoryConsolidatePayload {
  limit?: number
}

export interface MemoryConsolidateData {
  journalEntriesProcessed: number
  memoriesWritten: number
}

export interface MemoryConsolidateHandlerDeps {
  embedder?: EmbeddingProvider
  /** Override default 50. */
  defaultLimit?: number
}

export function createMemoryConsolidateHandler(
  deps: MemoryConsolidateHandlerDeps = {},
): AgentHandler<MemoryConsolidatePayload, MemoryConsolidateData> {
  return {
    type: 'memory-consolidate',
    name: 'Memory Consolidator',
    description: 'Reads unconsolidated journal entries and extracts memories (facts / events / preferences).',

    async run(ctx: AgentContext<MemoryConsolidatePayload>): Promise<HandlerOutcome<MemoryConsolidateData>> {
      const limit = ctx.task.payload.limit ?? deps.defaultLimit ?? 50

      // Both Journal and MemoryStore expect a D1Database — OrchestratorDB
      // is structurally compatible (same prepare/bind/run/first/all surface).
      const journal = new Journal(ctx.db as never)
      const store = new MemoryStore(ctx.db as never, deps.embedder)

      const entries = await journal.unconsolidated(limit)

      let memoriesWritten = 0
      const consolidatedIds: string[] = []
      const failedEntries: Array<{ id: string; error: string }> = []
      for (const e of entries) {
        const puts = extractFromJournal({
          taskId: e.taskId ?? undefined,
          agentId: e.agentId ?? undefined,
          summary: e.summary,
          outcome: e.outcome,
          learnings: e.learnings,
          followUps: e.followUps,
        })
        // AUDIT-PR20 #8: previously a single failing `store.put` on entry
        // N would exit the outer loop, leaving entries 1..N-1 unmarked.
        // The next run would re-process them → duplicate memories. We
        // now record the entry as consolidated only if ALL of its puts
        // succeed; partial-success entries are skipped and surfaced so
        // they can be retried on the next tick.
        let allPutsOk = true
        for (const p of puts) {
          try {
            await store.put(p)
            memoriesWritten++
          } catch (err) {
            allPutsOk = false
            failedEntries.push({
              id: e.id,
              error: err instanceof Error ? err.message : String(err),
            })
            ctx.log.warn('memory-consolidate: store.put failed', {
              entryId: e.id,
              error: err instanceof Error ? err.message : String(err),
            })
            break
          }
        }
        if (allPutsOk) consolidatedIds.push(e.id)
      }
      if (consolidatedIds.length) await journal.markConsolidated(consolidatedIds)

      const nextActions: string[] = []
      if (entries.length === limit) {
        nextActions.push('Run memory-consolidate again — pages of journal still pending')
      }
      if (failedEntries.length > 0) {
        nextActions.push(
          `Retry memory-consolidate for ${failedEntries.length} entries that failed mid-put`,
        )
      }

      return {
        data: { journalEntriesProcessed: entries.length, memoriesWritten },
        summary:
          failedEntries.length > 0
            ? `Consolidated ${consolidatedIds.length}/${entries.length} entries → ${memoriesWritten} memories (${failedEntries.length} partial-failures)`
            : `Consolidated ${entries.length} journal entries → ${memoriesWritten} memories`,
        memories: [],
        nextActions,
        usage: {},
      }
    },
  }
}
