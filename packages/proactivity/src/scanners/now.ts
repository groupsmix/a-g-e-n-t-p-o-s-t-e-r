/**
 * NOW scanner — surfaces a `now-stale` signal when the NOW scratchpad
 * is empty, expired, or older than 24h.
 *
 * The NOW scratchpad is the "what am I working on right now" line that
 * BaseAgent injects into every system prompt.  If it goes stale,
 * agents start operating on outdated context.  This scanner nags
 * gently when that happens.
 */

import type { Scanner, Signal, ScanContext } from '../types.js'

interface NowRow {
  scope: string
  content: string
  expires_at: string
  updated_at: string
}

export const nowScanner: Scanner = {
  name: 'now',
  async scan(ctx: ScanContext): Promise<Signal[]> {
    let rows: NowRow[] = []
    try {
      const res = await ctx.db
        .prepare(
          `SELECT scope, content, expires_at, updated_at
           FROM now_scratchpad`,
        )
        .all<NowRow>()
      rows = res.results ?? []
    } catch (err) {
      ctx.log.warn('now scanner: read failed', {
        error: err instanceof Error ? err.message : String(err),
      })
      return []
    }

    const signals: Signal[] = []
    const globalRow = rows.find((r) => r.scope === 'global')

    // No global NOW at all.
    if (!globalRow) {
      signals.push({
        key: 'now-stale:global:absent',
        kind: 'now-stale',
        severity: 'info',
        title: 'NOW scratchpad is empty',
        detail:
          'Set a current focus so agents know what to prioritise. Without it they fall back to recent tasks.',
        score: 0.4,
        sources: [{ kind: 'now', id: 'global' }],
        observedAt: ctx.now,
      })
      return signals
    }

    const expiresAt = new Date(globalRow.expires_at)
    const updatedAt = new Date(globalRow.updated_at)

    if (expiresAt.getTime() < ctx.now.getTime()) {
      signals.push({
        key: 'now-stale:global:expired',
        kind: 'now-stale',
        severity: 'notice',
        title: 'NOW scratchpad expired',
        detail: `Last set ${updatedAt.toISOString()} — agents are running without a current-focus prompt.`,
        score: 0.55,
        sources: [{ kind: 'now', id: 'global' }],
        observedAt: ctx.now,
      })
    } else if (ctx.now.getTime() - updatedAt.getTime() > 24 * 60 * 60_000) {
      // Not expired yet but hasnt been touched in a day.
      signals.push({
        key: 'now-stale:global:aged',
        kind: 'now-stale',
        severity: 'info',
        title: 'NOW scratchpad hasnt changed in 24h',
        detail: `Set ${updatedAt.toISOString()}. Refresh if your focus has shifted.`,
        score: 0.3,
        sources: [{ kind: 'now', id: 'global' }],
        observedAt: ctx.now,
      })
    }

    return signals
  },
}
