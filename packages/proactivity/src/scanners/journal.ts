/**
 * Journal scanner — reads recent journal entries, surfaces unresolved
 * follow_ups as `follow-up` signals, and tracks consolidation backlog.
 *
 * Why journal entries get the proactivity treatment:
 *
 * Every BaseAgent run produces a journal_entries row with `follow_ups`
 * pointing at what the agent thinks should happen next.  Without a
 * proactive read these die in the database.  The scanner walks the last
 * 24h of entries, picks ones that have unresolved follow_ups and aren't
 * already consolidated, and emits one signal per (entry, follow_up).
 *
 * Dedupe key is `follow-up:<journal_id>:<index>` so re-runs are stable.
 */

import type { Scanner, Signal, ScanContext } from '../types.js'

interface JournalRow {
  id: string
  task_id: string | null
  agent_id: string | null
  summary: string
  outcome: string
  follow_ups: string | null
  consolidated: number
  created_at: string
}

export const journalScanner: Scanner = {
  name: 'journal',
  async scan(ctx: ScanContext): Promise<Signal[]> {
    const signals: Signal[] = []
    const since = new Date(ctx.now.getTime() - ctx.thresholds.followUpLookbackMs)

    let rows: JournalRow[] = []
    try {
      const res = await ctx.db
        .prepare(
          `SELECT id, task_id, agent_id, summary, outcome, follow_ups, consolidated, created_at
           FROM journal_entries
           WHERE created_at >= ? AND consolidated = 0
           ORDER BY created_at DESC
           LIMIT 200`,
        )
        .bind(since.toISOString())
        .all<JournalRow>()
      rows = res.results ?? []
    } catch (err) {
      ctx.log.warn('journal scanner: read failed', {
        error: err instanceof Error ? err.message : String(err),
      })
      return []
    }

    // 1. Follow-up signals
    for (const row of rows) {
      const followUps = parseList(row.follow_ups)
      followUps.forEach((followUp, idx) => {
        signals.push({
          key: `follow-up:${row.id}:${idx}`,
          kind: 'follow-up',
          severity: row.outcome === 'failed' ? 'warn' : 'notice',
          title: clamp(followUp, 120),
          detail: `From ${row.agent_id ?? 'an agent'} (${row.outcome}): "${clamp(row.summary, 200)}"`,
          // Slight recency boost — newer entries score a bit higher.
          score: scoreByRecency(new Date(row.created_at), ctx.now, 0.5, 0.85),
          sources: [{ kind: 'journal', id: row.id }],
          observedAt: ctx.now,
        })
      })
    }

    // 2. Consolidation backlog signal (count unconsolidated entries in
    //    the window — single signal regardless of count)
    if (rows.length >= ctx.thresholds.consolidationDueCount) {
      signals.push({
        key: 'consolidation-due:global',
        kind: 'consolidation-due',
        severity: 'notice',
        title: `${rows.length} unconsolidated journal entries`,
        detail:
          'Memory consolidation hasnt run recently; long-term recall will drift if this keeps growing.',
        score: 0.7,
        sources: rows.slice(0, 10).map((r) => ({ kind: 'journal' as const, id: r.id })),
        suggestion: {
          taskType: 'memory-consolidate',
          payload: { reason: 'consolidation-due', count: rows.length },
          reason: `${rows.length} unconsolidated entries crossed threshold ${ctx.thresholds.consolidationDueCount}`,
        },
        observedAt: ctx.now,
      })
    }

    return signals
  },
}

// ─── helpers ───────────────────────────────────────────────────────────

function parseList(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
      .map((s) => s.trim())
  } catch {
    return []
  }
}

function clamp(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}

/** Map age (ms) → score in [min,max].  Newer = higher. */
function scoreByRecency(
  createdAt: Date,
  now: Date,
  min: number,
  max: number,
): number {
  const ageMs = Math.max(0, now.getTime() - createdAt.getTime())
  const dayMs = 24 * 60 * 60_000
  const t = Math.min(1, ageMs / dayMs)
  // Linear interpolation from max (fresh) to min (a day old).
  return Math.round((max - (max - min) * t) * 1000) / 1000
}
