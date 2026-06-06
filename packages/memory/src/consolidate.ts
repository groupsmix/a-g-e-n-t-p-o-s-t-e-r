/**
 * @posteragent/memory/consolidate
 *
 * Memory extraction from agent task results.
 *
 * Two strategies, both rule-based — no LLM call required at this layer.
 * (The LLM-driven consolidator is a separate task that will live in
 * packages/agents/src/agents/memory-consolidator.ts and will call into
 * this module to do the actual writes.)
 *
 *   1. extractFromJournal(journal) — turn a journal_entries row into 0..N
 *      memory_items.  Maps outcome + learnings + follow_ups to typed memories.
 *
 *   2. extractFromTaskResult(task, result) — heuristic mining of structured
 *      fields like { facts: string[] }, { preferences: string[] }, etc.
 *      Agents that produce these shapes will get free memory persistence.
 *
 * Both helpers are pure — they return PutOptions[] for the caller to feed
 * into MemoryStore.putMany().  Keeps consolidation testable without a DB.
 */

import type { MemoryItemType } from '@posteragent/types'
import type { PutOptions } from './store.js'

// ─── Journal-derived memories ───────────────────────────────────────────────

export interface JournalLike {
  taskId?: string
  agentId?: string
  summary: string
  outcome: 'success' | 'partial' | 'failed' | 'noop'
  learnings?: string[]
  followUps?: string[]
}

export function extractFromJournal(journal: JournalLike): PutOptions[] {
  const source = journal.taskId ? `task:${journal.taskId}` : `agent:${journal.agentId ?? 'unknown'}`
  const tags = [
    `outcome:${journal.outcome}`,
    journal.agentId ? `agent:${journal.agentId}` : null,
  ].filter((t): t is string => t !== null)

  const out: PutOptions[] = []

  // The summary itself becomes an 'event' — short-lived but searchable.
  if (journal.summary && journal.summary.trim()) {
    out.push({
      type: 'event',
      content: journal.summary.trim(),
      source,
      tags,
    })
  }

  // Each learning is a 'fact' (a transferable lesson with a 2-week half-life).
  for (const learning of journal.learnings ?? []) {
    if (!learning.trim()) continue
    out.push({
      type: 'fact',
      content: learning.trim(),
      source,
      tags: [...tags, 'kind:learning'],
    })
  }

  // Follow-ups are 'project'-scoped — they describe intended next work.
  for (const followUp of journal.followUps ?? []) {
    if (!followUp.trim()) continue
    out.push({
      type: 'project',
      content: followUp.trim(),
      source,
      tags: [...tags, 'kind:follow-up'],
    })
  }

  return out
}

// ─── Task-result mining ────────────────────────────────────────────────────

/**
 * A loose shape that agents can populate to advertise extractable memories.
 * Anything that matches one of these arrays gets persisted automatically.
 *
 *   { memories: { type, content, tags? }[] }   — explicit, preferred
 *   { facts: string[] }                         — quick fact mining
 *   { preferences: string[] }                   — owner preferences mined
 *
 * If the agent has nothing to advertise, this returns [] (silent no-op).
 */
export interface ExtractableResult {
  memories?: Array<{ type: MemoryItemType; content: string; tags?: string[] }>
  facts?: string[]
  preferences?: string[]
  projects?: string[]
}

export interface TaskRefLike {
  taskId: string
  agentId?: string
}

export function extractFromTaskResult(
  ref: TaskRefLike,
  result: ExtractableResult | undefined,
): PutOptions[] {
  if (!result) return []
  const source = `task:${ref.taskId}`
  const baseTags = ref.agentId ? [`agent:${ref.agentId}`] : []
  const out: PutOptions[] = []

  for (const m of result.memories ?? []) {
    if (!m.content?.trim()) continue
    out.push({
      type: m.type,
      content: m.content.trim(),
      source,
      tags: [...baseTags, ...(m.tags ?? [])],
    })
  }

  for (const fact of result.facts ?? []) {
    if (!fact.trim()) continue
    out.push({ type: 'fact', content: fact.trim(), source, tags: baseTags })
  }

  for (const pref of result.preferences ?? []) {
    if (!pref.trim()) continue
    out.push({ type: 'preference', content: pref.trim(), source, tags: baseTags })
  }

  for (const proj of result.projects ?? []) {
    if (!proj.trim()) continue
    out.push({ type: 'project', content: proj.trim(), source, tags: baseTags })
  }

  return out
}
