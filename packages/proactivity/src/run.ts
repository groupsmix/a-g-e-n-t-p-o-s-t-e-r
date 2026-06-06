/**
 * runProactivity — single entry point for the proactivity engine.
 *
 * Caller wires this to a scheduler:
 *
 *   • Cloudflare Worker `scheduled` handler (cron trigger)
 *   • GitHub Actions hourly run via tsx
 *   • Local dev loop with setInterval
 *
 * Responsibilities:
 *   1. Run every scanner in parallel (errors swallowed per-scanner)
 *   2. Dedupe by `signal.key` (later scanners lose ties)
 *   3. Sort by score desc, truncate to thresholds.maxSignals
 *   4. If `autoQueue` is enabled, insert agent_tasks rows for any
 *      signal whose `suggestion` is present and whose key isn't
 *      already represented by an open queued/running task
 *   5. Return a `ProactivityReport` for the dashboard / notifier
 *
 * Writes are isolated to step 4 — every other step is read-only.
 */

import type {
  ProactivityDB,
  ProactivityLogger,
  ProactivityReport,
  Scanner,
  Signal,
  Thresholds,
} from './types.js'
import { DEFAULT_THRESHOLDS } from './types.js'
import { defaultScanners } from './scanners/index.js'

export interface RunProactivityOptions {
  db: ProactivityDB
  scanners?: Scanner[]
  thresholds?: Partial<Thresholds>
  log?: ProactivityLogger
  /** Inject a fixed clock — tests use this. */
  now?: Date
  /**
   * When true, signals with a `suggestion` produce a new `agent_tasks`
   * row.  Default false — first integration runs read-only.
   */
  autoQueue?: boolean
}

export async function runProactivity(
  opts: RunProactivityOptions,
): Promise<ProactivityReport> {
  const startedAt = Date.now()
  const now = opts.now ?? new Date()
  const log = opts.log ?? consoleLogger
  const thresholds = { ...DEFAULT_THRESHOLDS, ...opts.thresholds }
  const scanners = opts.scanners ?? defaultScanners

  // ── 1. Run scanners in parallel ───────────────────────────────────
  const ctx = { db: opts.db, now, thresholds, log }
  const rawResults = await Promise.all(
    scanners.map(async (s) => {
      try {
        return await s.scan(ctx)
      } catch (err) {
        log.warn('scanner threw', {
          scanner: s.name,
          error: err instanceof Error ? err.message : String(err),
        })
        return [] as Signal[]
      }
    }),
  )

  // ── 2. Dedupe + sort + truncate ───────────────────────────────────
  const dedup = new Map<string, Signal>()
  for (const set of rawResults) {
    for (const sig of set) {
      if (!dedup.has(sig.key)) dedup.set(sig.key, sig)
    }
  }
  const ranked = [...dedup.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, thresholds.maxSignals)

  log.info('proactivity scan complete', {
    scanners: scanners.map((s) => s.name),
    rawCount: rawResults.reduce((n, set) => n + set.length, 0),
    rankedCount: ranked.length,
  })

  // ── 3. Auto-queue (optional) ──────────────────────────────────────
  const queued: ProactivityReport['queued'] = []
  if (opts.autoQueue) {
    for (const sig of ranked) {
      if (!sig.suggestion) continue
      const id = await queueTaskFromSignal(opts.db, sig, log).catch((err) => {
        log.warn('auto-queue insert failed', {
          signalKey: sig.key,
          error: err instanceof Error ? err.message : String(err),
        })
        return null
      })
      if (id) {
        queued.push({
          signalKey: sig.key,
          taskId: id,
          taskType: sig.suggestion.taskType,
        })
      }
    }
  }

  return {
    scannedAt: now,
    signals: ranked,
    queued,
    durationMs: Date.now() - startedAt,
  }
}

// ─── helpers ───────────────────────────────────────────────────────────

async function queueTaskFromSignal(
  db: ProactivityDB,
  sig: Signal,
  log: ProactivityLogger,
): Promise<string | null> {
  if (!sig.suggestion) return null

  // Cheap idempotency — don't queue another same-type task while one
  // is already queued/running.  Without this an hourly cron snowballs.
  const existing = await db
    .prepare(
      `SELECT id FROM agent_tasks
       WHERE type = ? AND status IN ('queued','running')
       LIMIT 1`,
    )
    .bind(sig.suggestion.taskType)
    .first<{ id: string }>()
  if (existing) {
    log.debug('auto-queue skipped (same-type pending)', {
      signalKey: sig.key,
      pendingId: existing.id,
    })
    return null
  }

  const id = newTaskId()
  const payload = {
    ...sig.suggestion.payload,
    _proactivity: {
      signalKey: sig.key,
      reason: sig.suggestion.reason,
    },
  }
  await db
    .prepare(
      `INSERT INTO agent_tasks (id, type, status, payload, agent_id, created_at, updated_at)
       VALUES (?, ?, 'queued', ?, 'proactivity-engine', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    )
    .bind(id, sig.suggestion.taskType, JSON.stringify(payload))
    .run()

  log.info('proactivity auto-queued task', {
    taskId: id,
    type: sig.suggestion.taskType,
    signalKey: sig.key,
  })
  return id
}

function newTaskId(): string {
  // 16-byte hex — matches the agent_tasks DEFAULT.
  const bytes = new Uint8Array(16)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256)
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

const consoleLogger: ProactivityLogger = {
  debug(msg, meta) {
    if (process.env.PROACTIVITY_DEBUG === '1') console.debug(`[proactivity] ${msg}`, meta)
  },
  info(msg, meta) {
    console.log(`[proactivity] ${msg}`, meta ?? '')
  },
  warn(msg, meta) {
    console.warn(`[proactivity] ${msg}`, meta ?? '')
  },
  error(msg, meta) {
    console.error(`[proactivity] ${msg}`, meta ?? '')
  },
}
