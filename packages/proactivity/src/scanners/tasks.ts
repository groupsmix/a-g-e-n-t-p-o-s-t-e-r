/**
 * Task scanner — emits:
 *
 *   • `task-stalled`        — a task is still 'running' past the
 *                             stall threshold (likely crashed / hung).
 *   • `task-failed-burst`   — N failures of the same type within a window
 *                             (likely a config issue or upstream outage).
 *   • `idle`                — no tasks created within `idleWindowMs`
 *                             (the system has gone quiet — maybe queue
 *                             a memory-consolidate run).
 *
 * All three are read-only against `agent_tasks`.
 */

import type { AgentTaskType } from '@posteragent/types'
import type { Scanner, Signal, ScanContext } from '../types.js'

interface TaskRow {
  id: string
  type: string
  status: string
  error: string | null
  created_at: string
  updated_at: string
}

export const taskScanner: Scanner = {
  name: 'tasks',
  async scan(ctx: ScanContext): Promise<Signal[]> {
    const signals: Signal[] = []

    // ── 1. Stalled tasks ────────────────────────────────────────────
    const stallCutoff = new Date(ctx.now.getTime() - ctx.thresholds.taskStalledMs)
    try {
      const res = await ctx.db
        .prepare(
          `SELECT id, type, status, error, created_at, updated_at
           FROM agent_tasks
           WHERE status = 'running' AND updated_at < ?
           ORDER BY updated_at ASC
           LIMIT 50`,
        )
        .bind(stallCutoff.toISOString())
        .all<TaskRow>()
      for (const row of res.results ?? []) {
        const ageMin = Math.round(
          (ctx.now.getTime() - new Date(row.updated_at).getTime()) / 60_000,
        )
        signals.push({
          key: `task-stalled:${row.id}`,
          kind: 'task-stalled',
          severity: 'warn',
          title: `Task ${row.type} stalled (${ageMin}m no update)`,
          detail: `id=${row.id} stuck in 'running'. Likely crashed; mark cancelled or re-run.`,
          score: 0.85,
          sources: [{ kind: 'task', id: row.id }],
          observedAt: ctx.now,
        })
      }
    } catch (err) {
      ctx.log.warn('task scanner: stall read failed', {
        error: err instanceof Error ? err.message : String(err),
      })
    }

    // ── 2. Failure burst by type ────────────────────────────────────
    const burstCutoff = new Date(
      ctx.now.getTime() - ctx.thresholds.failureBurstWindowMs,
    )
    try {
      const res = await ctx.db
        .prepare(
          `SELECT type, COUNT(*) as cnt
           FROM agent_tasks
           WHERE status = 'failed' AND updated_at >= ?
           GROUP BY type
           HAVING cnt >= ?`,
        )
        .bind(burstCutoff.toISOString(), ctx.thresholds.failureBurstCount)
        .all<{ type: string; cnt: number }>()
      for (const row of res.results ?? []) {
        signals.push({
          key: `task-failed-burst:${row.type}:${burstCutoff.toISOString()}`,
          kind: 'task-failed-burst',
          severity: 'urgent',
          title: `${row.cnt} failures of '${row.type}' in the last hour`,
          detail: `Pause queuing more of this type and inspect logs — likely an upstream / config issue.`,
          score: 0.95,
          sources: [{ kind: 'task', id: row.type }],
          observedAt: ctx.now,
        })
      }
    } catch (err) {
      ctx.log.warn('task scanner: burst read failed', {
        error: err instanceof Error ? err.message : String(err),
      })
    }

    // ── 3. Idle window ──────────────────────────────────────────────
    const idleCutoff = new Date(ctx.now.getTime() - ctx.thresholds.idleWindowMs)
    try {
      const res = await ctx.db
        .prepare(
          `SELECT COUNT(*) as cnt FROM agent_tasks WHERE created_at >= ?`,
        )
        .bind(idleCutoff.toISOString())
        .first<{ cnt: number }>()
      const cnt = res?.cnt ?? 0
      if (cnt === 0) {
        signals.push({
          key: `idle:${idleCutoff.toISOString()}`,
          kind: 'idle',
          severity: 'info',
          title: 'No tasks queued recently',
          detail: `No agent_tasks created since ${idleCutoff.toISOString()}. Good window for consolidation.`,
          score: 0.45,
          sources: [{ kind: 'meta', id: 'idle' }],
          suggestion: {
            taskType: 'memory-consolidate' as AgentTaskType,
            payload: { reason: 'idle-window' },
            reason: 'idle window crossed',
          },
          observedAt: ctx.now,
        })
      }
    } catch (err) {
      ctx.log.warn('task scanner: idle read failed', {
        error: err instanceof Error ? err.message : String(err),
      })
    }

    return signals
  },
}
