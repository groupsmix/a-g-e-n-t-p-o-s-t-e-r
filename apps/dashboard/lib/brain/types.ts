/**
 * Brain dashboard — shared types for client + server.
 *
 * These mirror the shapes from @posteragent/memory, @posteragent/identity,
 * and @posteragent/proactivity but are decoupled so the dashboard doesn't
 * need to import server-only D1 code into client components.
 */

export interface MemoryItemDTO {
  id: string
  type: 'fact' | 'event' | 'preference' | 'project' | 'identity'
  content: string
  tags: string[]
  source: string | null
  importance: number
  createdAt: string
  updatedAt: string
}

export interface JournalEntryDTO {
  id: string
  taskId: string | null
  agentId: string | null
  summary: string
  outcome: 'success' | 'failed' | 'partial' | 'cancelled'
  learnings: string[]
  followUps: string[]
  consolidated: boolean
  createdAt: string
}

export interface PersonaDTO {
  name: string
  emoji: string
  tagline: string
  /** Free-form Markdown — voice + working preferences. */
  soul: string
  updatedAt: string
}

export interface NowEntryDTO {
  scope: string
  content: string
  setBy: string | null
  expiresAt: string
  updatedAt: string
  /** Computed server-side: ms until expiry (negative = expired). */
  expiresInMs: number
}

export interface SignalDTO {
  key: string
  kind:
    | 'follow-up'
    | 'now-stale'
    | 'task-stalled'
    | 'task-failed-burst'
    | 'consolidation-due'
    | 'idle'
  severity: 'info' | 'notice' | 'warn' | 'urgent'
  title: string
  detail?: string
  score: number
  sources: Array<{ kind: 'journal' | 'task' | 'now' | 'meta'; id: string }>
  suggestion?: {
    taskType: string
    payload: Record<string, unknown>
    reason: string
  }
  observedAt: string
}

export interface BrainSummaryDTO {
  memories: { total: number; byType: Record<string, number> }
  journal: { last7d: number; unconsolidated: number }
  signals: { total: number; urgent: number }
  persona: { name: string; emoji: string; tagline: string }
  now: { scope: string; content: string; expiresInMs: number } | null
}
