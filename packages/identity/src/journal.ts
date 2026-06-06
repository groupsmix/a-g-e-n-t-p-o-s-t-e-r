/**
 * @posteragent/identity/journal
 *
 * Per-task reflections.  Every agent run ends with a journal_entries row
 * — the agent narrating what it just did, what it learned, what it'd do
 * differently.  These are the raw material for memory consolidation
 * (TASK-200's consolidate.ts).
 *
 * Schema lives in migration 024_brain_layer.sql.
 */

import type { D1Database } from '@posteragent/memory'
import { createLogger } from '@posteragent/logger'

const log = createLogger('identity:journal')

export type JournalOutcome = 'success' | 'partial' | 'failed' | 'noop'

export interface JournalEntry {
  id: string
  taskId: string | null
  agentId: string | null
  summary: string
  outcome: JournalOutcome
  learnings: string[]
  followUps: string[]
  consolidated: boolean
  createdAt: Date
}

export interface AppendJournalInput {
  taskId?: string
  agentId?: string
  summary: string
  outcome: JournalOutcome
  learnings?: string[]
  followUps?: string[]
}

interface JournalRow {
  id: string
  task_id: string | null
  agent_id: string | null
  summary: string
  outcome: JournalOutcome
  learnings: string | null
  follow_ups: string | null
  consolidated: number
  created_at: string
}

function rowToJournalEntry(row: JournalRow): JournalEntry {
  return {
    id: row.id,
    taskId: row.task_id,
    agentId: row.agent_id,
    summary: row.summary,
    outcome: row.outcome,
    learnings: row.learnings ? (JSON.parse(row.learnings) as string[]) : [],
    followUps: row.follow_ups ? (JSON.parse(row.follow_ups) as string[]) : [],
    consolidated: row.consolidated === 1,
    createdAt: new Date(row.created_at),
  }
}

export class Journal {
  constructor(private db: D1Database) {}

  async append(input: AppendJournalInput): Promise<JournalEntry> {
    const id = crypto.randomUUID().replace(/-/g, '')
    const now = new Date()

    await this.db
      .prepare(
        `INSERT INTO journal_entries
           (id, task_id, agent_id, summary, outcome, learnings, follow_ups, consolidated, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      )
      .bind(
        id,
        input.taskId ?? null,
        input.agentId ?? null,
        input.summary.trim(),
        input.outcome,
        input.learnings && input.learnings.length ? JSON.stringify(input.learnings) : null,
        input.followUps && input.followUps.length ? JSON.stringify(input.followUps) : null,
        now.toISOString(),
      )
      .run()

    log.debug('journal.append', { id, taskId: input.taskId, outcome: input.outcome })

    return {
      id,
      taskId: input.taskId ?? null,
      agentId: input.agentId ?? null,
      summary: input.summary.trim(),
      outcome: input.outcome,
      learnings: input.learnings ?? [],
      followUps: input.followUps ?? [],
      consolidated: false,
      createdAt: now,
    }
  }

  /** Recent N entries, newest first. */
  async recent(limit = 20): Promise<JournalEntry[]> {
    const result = await this.db
      .prepare(
        `SELECT id, task_id, agent_id, summary, outcome, learnings, follow_ups,
                consolidated, created_at
         FROM journal_entries
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .bind(limit)
      .all<JournalRow>()
    return (result.results ?? []).map(rowToJournalEntry)
  }

  /** Entries not yet folded into memory_items. */
  async unconsolidated(limit = 50): Promise<JournalEntry[]> {
    const result = await this.db
      .prepare(
        `SELECT id, task_id, agent_id, summary, outcome, learnings, follow_ups,
                consolidated, created_at
         FROM journal_entries
         WHERE consolidated = 0
         ORDER BY created_at ASC
         LIMIT ?`,
      )
      .bind(limit)
      .all<JournalRow>()
    return (result.results ?? []).map(rowToJournalEntry)
  }

  async markConsolidated(ids: string[]): Promise<void> {
    if (ids.length === 0) return
    for (let i = 0; i < ids.length; i += 50) {
      const chunk = ids.slice(i, i + 50)
      const placeholders = chunk.map(() => '?').join(',')
      await this.db
        .prepare(`UPDATE journal_entries SET consolidated = 1 WHERE id IN (${placeholders})`)
        .bind(...chunk)
        .run()
    }
  }

  async byTask(taskId: string): Promise<JournalEntry[]> {
    const result = await this.db
      .prepare(
        `SELECT id, task_id, agent_id, summary, outcome, learnings, follow_ups,
                consolidated, created_at
         FROM journal_entries
         WHERE task_id = ?
         ORDER BY created_at ASC`,
      )
      .bind(taskId)
      .all<JournalRow>()
    return (result.results ?? []).map(rowToJournalEntry)
  }
}
