/**
 * Worker-side signal builder — mirrors @posteragent/proactivity's
 * scanner output so the dashboard can render real nudges from D1
 * data instead of the demo fixtures.
 *
 * The scanners look at:
 *   • journal follow-ups (recent)
 *   • now scratchpad staleness
 *   • stalled / failed-burst tasks in agent_tasks
 *   • consolidation-due threshold (unconsolidated journal count)
 *
 * Each signal is keyed by a stable `key` so the dashboard can dedupe
 * across polls.  Severity is one of info | notice | warn | urgent and
 * `score` (0..1) drives the sort order.
 *
 * Pure data → no side effects, no auto-queue here.  Auto-queue lives in
 * @posteragent/proactivity (called by the cron tick).
 */

import type { D1Database } from '@cloudflare/workers-types'

export type SignalKind =
  | 'follow-up'
  | 'now-stale'
  | 'task-stalled'
  | 'task-failed-burst'
  | 'consolidation-due'
  | 'idle'

export type Severity = 'info' | 'notice' | 'warn' | 'urgent'

export interface SignalDescriptor {
  key: string
  kind: SignalKind
  severity: Severity
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

export interface ListSignalsOpts {
  limit?: number
  /** Cutoff for "recent" — defaults to last 24h. */
  windowMs?: number
}

const FAILED_BURST_WINDOW_MS = 60 * 60 * 1000 // 1h
const FAILED_BURST_THRESHOLD = 3
const STALLED_WINDOW_MS = 30 * 60 * 1000 // 30min
const NOW_STALE_MULTIPLIER = 1.5
const CONSOLIDATION_THRESHOLD = 20

export async function listSignals(
  db: D1Database,
  opts: ListSignalsOpts = {},
): Promise<SignalDescriptor[]> {
  const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100)
  const windowMs = opts.windowMs ?? 24 * 60 * 60 * 1000

  const out: SignalDescriptor[] = []
  const observedAt = new Date().toISOString()
  const sinceISO = new Date(Date.now() - windowMs).toISOString()

  // ── follow-up signals ──
  const journalRows = await db
    .prepare(
      `SELECT id, agent_id, summary, outcome, follow_ups, created_at
         FROM journal_entries
        WHERE created_at > ?
        ORDER BY created_at DESC
        LIMIT 50`,
    )
    .bind(sinceISO)
    .all<{
      id: string
      agent_id: string | null
      summary: string
      outcome: string
      follow_ups: string | null
      created_at: string
    }>()

  for (const row of journalRows.results ?? []) {
    const followUps = parseJsonArray(row.follow_ups)
    for (let i = 0; i < followUps.length; i++) {
      const detail = `From ${row.agent_id ?? 'agent'} (${row.outcome}): "${truncate(row.summary, 60)}"`
      out.push({
        key: `follow-up:${row.id}:${i}`,
        kind: 'follow-up',
        severity: row.outcome === 'failed' ? 'warn' : 'notice',
        title: followUps[i],
        detail,
        score: row.outcome === 'failed' ? 0.78 : 0.6,
        sources: [{ kind: 'journal', id: row.id }],
        observedAt,
      })
    }
  }

  // ── failed-burst signal (per-type) ──
  const burstWindow = new Date(Date.now() - FAILED_BURST_WINDOW_MS).toISOString()
  const burstRows = await db
    .prepare(
      `SELECT type, COUNT(*) AS n
         FROM agent_tasks
        WHERE status = 'failed' AND finished_at > ?
        GROUP BY type
        HAVING n >= ?`,
    )
    .bind(burstWindow, FAILED_BURST_THRESHOLD)
    .all<{ type: string; n: number }>()
  for (const row of burstRows.results ?? []) {
    out.push({
      key: `task-failed-burst:${row.type}`,
      kind: 'task-failed-burst',
      severity: 'urgent',
      title: `${row.n} failures of '${row.type}' in the last hour`,
      detail:
        'Pause queuing more of this type and inspect logs. Likely an upstream / config issue.',
      score: 0.95,
      sources: [{ kind: 'task', id: row.type }],
      observedAt,
    })
  }

  // ── stalled signal ──
  const stalledCutoff = new Date(Date.now() - STALLED_WINDOW_MS).toISOString()
  const stalledRows = await db
    .prepare(
      `SELECT id, type, started_at FROM agent_tasks
        WHERE status = 'running' AND started_at < ?
        ORDER BY started_at ASC LIMIT 10`,
    )
    .bind(stalledCutoff)
    .all<{ id: string; type: string; started_at: string }>()
  for (const row of stalledRows.results ?? []) {
    out.push({
      key: `task-stalled:${row.id}`,
      kind: 'task-stalled',
      severity: 'warn',
      title: `${row.type} task stalled for >30m`,
      detail: `Task ${row.id} started ${row.started_at} and never reported done/failed.`,
      score: 0.82,
      sources: [{ kind: 'task', id: row.id }],
      observedAt,
    })
  }

  // ── now-stale signal ──
  const staleNows = await db
    .prepare(
      `SELECT scope, expires_at FROM now_scratchpad
        WHERE expires_at < datetime('now', '-1 hour')`,
    )
    .all<{ scope: string; expires_at: string }>()
  for (const row of staleNows.results ?? []) {
    out.push({
      key: `now-stale:${row.scope}`,
      kind: 'now-stale',
      severity: 'info',
      title: `Scratchpad "${row.scope}" expired`,
      detail: `Owner-set focus has expired (was due ${row.expires_at}).`,
      score: 0.5 * NOW_STALE_MULTIPLIER,
      sources: [{ kind: 'now', id: row.scope }],
      observedAt,
    })
  }

  // ── consolidation-due signal ──
  const unconsolidated = await db
    .prepare(`SELECT COUNT(*) AS n FROM journal_entries WHERE consolidated = 0`)
    .first<{ n: number }>()
  if ((unconsolidated?.n ?? 0) >= CONSOLIDATION_THRESHOLD) {
    out.push({
      key: 'consolidation-due:global',
      kind: 'consolidation-due',
      severity: 'notice',
      title: `${unconsolidated!.n} unconsolidated journal entries`,
      detail:
        "Memory consolidation hasn't run recently; long-term recall will drift if this keeps growing.",
      score: 0.7,
      sources: [{ kind: 'meta', id: 'journal' }],
      suggestion: {
        taskType: 'memory-consolidate',
        payload: { reason: 'consolidation-due', count: unconsolidated!.n },
        reason: 'crossed threshold',
      },
      observedAt,
    })
  }

  // ── idle marker (no actionable signals) ──
  if (out.length === 0) {
    out.push({
      key: 'idle:global',
      kind: 'idle',
      severity: 'info',
      title: 'No active signals',
      detail: 'Everything looks calm. Nothing needs attention.',
      score: 0.1,
      sources: [{ kind: 'meta', id: 'global' }],
      observedAt,
    })
  }

  return out
    .sort((a, b) => b.score - a.score || a.key.localeCompare(b.key))
    .slice(0, limit)
}

function parseJsonArray(s: string | null): string[] {
  if (!s) return []
  try {
    const parsed = JSON.parse(s)
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s
  return s.slice(0, n - 1) + '…'
}
