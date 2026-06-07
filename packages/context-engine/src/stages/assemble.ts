/**
 * Assemble stage. Takes the retrieved memories + past tasks + signals
 * and formats them into a single Markdown prelude that any agent can
 * drop into a system or user message.
 *
 * Format is intentionally stable so consumers can grep it for sections,
 * and so the observability layer can reason about which sections were
 * actually used.
 */

import type {
  PastTask,
  RetrievedMemory,
  SystemSignals,
} from '../types.js'

export interface AssembleInput {
  query: string
  taskType: string
  memories: RetrievedMemory[]
  pastTasks: PastTask[]
  signals: SystemSignals
}

export function assemblePrelude(input: AssembleInput): string {
  const lines: string[] = []

  // ── System signals (always first; date is critical) ────────────
  lines.push('## System signals')
  lines.push(`- now: ${input.signals.nowIso}`)
  if (input.signals.activeGoals?.length) {
    lines.push(`- active goals:`)
    for (const g of input.signals.activeGoals) lines.push(`  - ${g}`)
  }
  if (input.signals.recentPerformance) {
    const rp = input.signals.recentPerformance
    lines.push(
      `- recent perf: ${rp.tasksLast7d} tasks/7d, ` +
        `success ${(rp.successRate * 100).toFixed(0)}%, ` +
        `avg cost $${rp.avgCostUsd.toFixed(3)}, ` +
        `avg duration ${rp.avgDurationMs}ms`,
    )
  }
  if (input.signals.ambient) {
    for (const [k, v] of Object.entries(input.signals.ambient)) {
      lines.push(`- ${k}: ${v}`)
    }
  }
  lines.push('')

  // ── Relevant memories ──────────────────────────────────────────
  if (input.memories.length) {
    lines.push('## Relevant memories')
    for (const m of input.memories) {
      const score = m.score != null ? ` (score ${m.score.toFixed(2)})` : ''
      lines.push(`- [${m.type}] ${m.content}${score}  _${m.source}_`)
    }
    lines.push('')
  }

  // ── Past task results ──────────────────────────────────────────
  if (input.pastTasks.length) {
    lines.push('## Past task results')
    for (const t of input.pastTasks) {
      const score = t.score != null ? ` (score ${t.score.toFixed(2)})` : ''
      lines.push(
        `- ${t.taskType} · ${t.status} · ${t.finishedAt}${score}`,
      )
      lines.push(`  - ${t.summary}`)
      if (t.resultExcerpt) {
        lines.push(`  - excerpt: ${truncate(t.resultExcerpt, 320)}`)
      }
    }
    lines.push('')
  }

  // ── The actual task ────────────────────────────────────────────
  lines.push('## Task')
  lines.push(`- type: ${input.taskType}`)
  lines.push(`- query: ${input.query}`)

  return lines.join('\n')
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}
