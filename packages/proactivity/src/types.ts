/**
 * @posteragent/proactivity — type surface
 *
 * The proactivity engine produces `Signal`s — observations about the
 * system that may warrant action. Signals are ranked, deduped, and
 * either emitted to the caller (dashboard, notifier) or auto-actioned
 * (e.g. queuing a memory-consolidate task).
 *
 * Design rules:
 *   • Scanners are pure — they read state and return Signals.
 *     They never write.
 *   • The runner is the only thing that may write (auto-queue
 *     follow-up tasks). All writes are opt-in via config.
 *   • Signals are stable shapes — the dashboard renders them and the
 *     notifier picks them up.
 */

import type { AgentTaskType } from '@posteragent/types'

// ─── Database binding (D1-compatible) ──────────────────────────────────

export interface ProactivityDB {
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

// ─── Signal model ──────────────────────────────────────────────────────

export type SignalKind =
  | 'follow-up'           // a journal entry left an unresolved follow_up
  | 'now-stale'           // the NOW scratchpad is empty / expired
  | 'task-stalled'        // a task has been running too long
  | 'task-failed-burst'   // multiple recent failures of the same type
  | 'consolidation-due'   // many unconsolidated journal entries piling up
  | 'idle'                // no tasks created recently — system is quiet

export type SignalSeverity = 'info' | 'notice' | 'warn' | 'urgent'

export interface Signal {
  /** Stable key so dedupe across runs works.  Same key = same signal. */
  key: string
  kind: SignalKind
  severity: SignalSeverity
  title: string
  detail?: string
  /** Score in 0..1 — higher is more important.  Used for ranking. */
  score: number
  /** Sources the signal observed (journal ids, task ids, etc.). */
  sources: Array<{ kind: 'journal' | 'task' | 'now' | 'meta'; id: string }>
  /**
   * Suggested next move.  If the runner is configured to auto-queue,
   * it will create an `agent_tasks` row of this type with this payload.
   */
  suggestion?: {
    taskType: AgentTaskType
    payload: Record<string, unknown>
    /** Human-readable reason logged alongside the queued task. */
    reason: string
  }
  /** When this signal was observed. */
  observedAt: Date
}

// ─── Scanner contract ──────────────────────────────────────────────────

/**
 * A scanner is anything that reads state and returns Signals.  They
 * receive a context shared by the run (db, clock, config thresholds).
 */
export interface Scanner {
  /** Stable identifier shown in logs. */
  name: string
  /** Return zero or more signals.  MUST NOT throw — use try/catch. */
  scan(ctx: ScanContext): Promise<Signal[]>
}

export interface ScanContext {
  db: ProactivityDB
  /** Current wall-clock used for staleness math.  Tests inject a fixed date. */
  now: Date
  thresholds: Thresholds
  log: ProactivityLogger
}

export interface ProactivityLogger {
  debug(msg: string, meta?: Record<string, unknown>): void
  info(msg: string, meta?: Record<string, unknown>): void
  warn(msg: string, meta?: Record<string, unknown>): void
  error(msg: string, meta?: Record<string, unknown>): void
}

// ─── Configuration ─────────────────────────────────────────────────────

export interface Thresholds {
  /** A 'running' task older than this is considered stalled.  Default 30 min. */
  taskStalledMs: number
  /** How many failed tasks of the same type within `failureBurstWindowMs`
   *  trip a `task-failed-burst` signal.  Default 3. */
  failureBurstCount: number
  failureBurstWindowMs: number
  /** Journal entries unconsolidated beyond this trip `consolidation-due`.
   *  Default 25. */
  consolidationDueCount: number
  /** No queued/running tasks created within this window → `idle`.
   *  Default 6 hours. */
  idleWindowMs: number
  /** How far back the journal scanner reads when picking up follow-ups.
   *  Default 24 hours. */
  followUpLookbackMs: number
  /** Max signals returned to the caller per run.  Default 25. */
  maxSignals: number
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  taskStalledMs: 30 * 60_000,
  failureBurstCount: 3,
  failureBurstWindowMs: 60 * 60_000,
  consolidationDueCount: 25,
  idleWindowMs: 6 * 60 * 60_000,
  followUpLookbackMs: 24 * 60 * 60_000,
  maxSignals: 25,
}

// ─── Run result ────────────────────────────────────────────────────────

export interface ProactivityReport {
  scannedAt: Date
  signals: Signal[]
  /** Signals that were auto-queued (if autoQueue enabled).  Same items as
   *  `signals`, just the subset that resulted in a new task row. */
  queued: Array<{
    signalKey: string
    taskId: string
    taskType: AgentTaskType
  }>
  durationMs: number
}
