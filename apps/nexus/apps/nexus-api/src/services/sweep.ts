import type { Env } from '../env'

// Stale-run cutoff. A run that hasn't moved in 10 min is almost always
// wedged (Worker eviction, AI provider hang, dropped `waitUntil`, etc.).
// The 15-step product pipeline completes in ≤ 3 min for 15 AI calls
// (see nexus-api/wrangler.toml), so 10 min is ~3x headroom — slow-but-live
// runs survive while "RUNNING forever" rows get reaped promptly.
//
// NOTE: this cutoff only bites if the sweep actually runs every few
// minutes. The Worker registers a dedicated high-frequency cron lane for
// exactly that — see `STALE_SWEEP_CRON` + the `scheduled` handler in
// src/index.ts. On the daily 07:00 lane alone a stuck row could sit for
// up to 24h, which is the bug this task (T13) closes.
export const STALE_CUTOFF_MS = 10 * 60 * 1000

// Cutoffs in both shapes the DB stores timestamps in. Workflow/product rows
// are written as ISO-8601 (`new Date().toISOString()`), while agent_tasks /
// agent_runs use SQLite `CURRENT_TIMESTAMP` ("YYYY-MM-DD HH:MM:SS"). Mixing
// the two in a raw `<` is a trap: ' ' (0x20) sorts before 'T' (0x54), so a
// space-format "now" always compares as *older* than any ISO cutoff on the
// same day — which would reap brand-new rows. We therefore normalise the
// column to the 19-char space form in SQL and compare against `space` here.
export function staleCutoffs(nowMs: number = Date.now()): { iso: string; space: string } {
  const iso = new Date(nowMs - STALE_CUTOFF_MS).toISOString()
  return { iso, space: iso.slice(0, 19).replace('T', ' ') }
}

// Mirror of the SQL `REPLACE(SUBSTR(ts,1,19),'T',' ')` normalisation, exported
// so the staleness rule can be unit-tested without standing up a database.
// Accepts ISO ("…T…Z"), ISO-without-Z, or space-format strings and returns a
// canonical, lexicographically-sortable "YYYY-MM-DD HH:MM:SS".
export function normalizeTs(ts: string): string {
  return ts.slice(0, 19).replace('T', ' ')
}

export function isStale(ts: string | null | undefined, cutoffSpace: string): boolean {
  if (!ts) return false
  return normalizeTs(ts) < cutoffSpace
}

// Graveyard janitor cutoff. The engine moves an unusable run's product
// row into the graveyard (sets `graveyard_at` + a `graveyard_reason`).
// After this much time we physically delete the row so the DB doesn't
// accumulate "Untitled / score 0" garbage forever. The FKs on
// `workflow_runs.product_id` and `workflow_steps.run_id` cascade, so
// the run history goes with it — acceptable for these failure modes,
// since the run itself produced nothing useful to investigate.
const GRAVEYARD_CUTOFF_MS = 60 * 60 * 1000 // 1 hour, per user spec

// Self-healing: a worker can be evicted mid-build (long background runs),
// leaving a run/step/product stuck on 'running' forever. Mark anything still
// running past the cutoff as failed so the loop and the health view recover
// on their own — no user intervention required.
//
// Previously this only touched `workflow_runs` + `workflow_steps`; the
// `products` row was left in 'running', which is why items like
// "The Productivity Guide" sat at status=running with score 26/100 and
// never moved off the Products grid. We now also flip those products to
// 'rejected' with a stale-run reason so the dashboard reflects reality and
// the Retry button on the row has something to act on.
export async function sweepStaleRuns(env: Env): Promise<void> {
  const { iso: cutoff, space: cutoffSpace } = staleCutoffs()
  const stamp = new Date().toISOString()
  const stampSpace = normalizeTs(stamp)
  try {
    await env.DB.prepare(
      `UPDATE workflow_steps SET status='failed', completed_at=?, error='stale: run exceeded time budget'
         WHERE status='running' AND started_at < ?`
    ).bind(stamp, cutoff).run()
    const res = await env.DB.prepare(
      `UPDATE workflow_runs SET status='failed', completed_at=?, error='stale: run exceeded time budget'
         WHERE status IN ('running','queued') AND created_at < ?`
    ).bind(stamp, cutoff).run()
    const n = (res.meta as { changes?: number } | undefined)?.changes ?? 0

    // Any product whose status is still 'running' AND has no live workflow_run
    // is wedged. Reject it with a stale reason so the row shows the right
    // status + the "Retry" button can fire a fresh run cleanly.
    const prodRes = await env.DB.prepare(
      `UPDATE products
         SET status='rejected',
             graveyard_at=?,
             graveyard_reason='stale: run exceeded time budget',
             updated_at=?
       WHERE status='running'
         AND updated_at < ?
         AND id NOT IN (
           SELECT product_id FROM workflow_runs
             WHERE status IN ('running','queued')
         )`,
    ).bind(stamp, stamp, cutoff).run()
    const pn = (prodRes.meta as { changes?: number } | undefined)?.changes ?? 0

    // Orchestrator BaseAgent tasks (agent_tasks) wedged mid-run. started_at is
    // written with SQLite CURRENT_TIMESTAMP (space format), so we normalise
    // both sides before comparing. We deliberately scope this to 'running'
    // only — never 'queued' — because a large queued backlog can legitimately
    // wait longer than the cutoff for the drainer and must not be killed.
    const taskRes = await env.DB.prepare(
      `UPDATE agent_tasks
          SET status='failed',
              error='stale: run exceeded time budget (reaped by janitor)',
              finished_at=?,
              updated_at=?
        WHERE status='running'
          AND REPLACE(SUBSTR(COALESCE(started_at, updated_at, created_at), 1, 19), 'T', ' ') < ?`,
    ).bind(stampSpace, stampSpace, cutoffSpace).run()
    const tn = (taskRes.meta as { changes?: number } | undefined)?.changes ?? 0

    // Money-machine ledger runs (agent_runs) wedged mid-run. This table has a
    // dedicated 'killed' status for exactly this case — a run the janitor
    // stops because it exceeded its time budget.
    const runLedgerRes = await env.DB.prepare(
      `UPDATE agent_runs
          SET status='killed',
              error_message='stale: run exceeded time budget (killed by janitor)',
              finished_at=?
        WHERE status='running'
          AND REPLACE(SUBSTR(COALESCE(started_at, created_at), 1, 19), 'T', ' ') < ?`,
    ).bind(stampSpace, cutoffSpace).run()
    const rn = (runLedgerRes.meta as { changes?: number } | undefined)?.changes ?? 0

    if (n > 0 || pn > 0 || tn > 0 || rn > 0) {
      console.log(
        `[sweep] recovered ${n} stale run(s), ${pn} stale product(s), ` +
          `${tn} stale task(s), ${rn} killed ledger run(s)`,
      )
    }
  } catch (err) {
    console.error('[sweep] stale-run sweep failed:', err)
  }

  // Graveyard janitor: physically delete unusable product rows that have
  // been sitting in the graveyard longer than the cutoff. This covers the
  // BUG-P1-1 "Untitled / niche — / score 0" rows the engine now graveyards
  // at the end of a no-title run, plus a legacy backfill catch for any
  // pre-existing nameless rows from before this fix shipped.
  await sweepGraveyard(env)
}

// Exported for tests. Performs two passes:
//   1. Forward path: delete anything explicitly graveyarded older than the
//      cutoff. The engine + sweepStaleRuns are the only writers of
//      graveyard_at, so we trust their reasons.
//   2. Legacy backfill: catch products with no usable title that predate
//      the engine fix (no graveyard_at set). Anything older than the
//      cutoff, with name NULL / blank / 'Untitled', and not actively
//      building, is also unusable and gets removed.
export async function sweepGraveyard(env: Env): Promise<void> {
  const cutoff = new Date(Date.now() - GRAVEYARD_CUTOFF_MS).toISOString()
  try {
    // Pass 1 — explicit graveyard rows.
    const gv = await env.DB.prepare(
      `DELETE FROM products
        WHERE graveyard_at IS NOT NULL
          AND graveyard_at < ?`,
    ).bind(cutoff).run()
    const gvN = (gv.meta as { changes?: number } | undefined)?.changes ?? 0

    // Pass 2 — legacy nameless rows (predate graveyard_at being set).
    // We deliberately scope this to non-running rows so an in-flight build
    // that simply hasn't named itself yet isn't yanked out from under the
    // engine. The status filter also excludes anything a human owns
    // (approved / published).
    const legacy = await env.DB.prepare(
      `DELETE FROM products
        WHERE graveyard_at IS NULL
          AND created_at < ?
          AND status IN ('draft','rejected')
          AND (
            name IS NULL OR TRIM(name) = ''
            OR LOWER(TRIM(name)) IN ('untitled','untitled product','(unnamed)','unnamed','draft','new product')
          )`,
    ).bind(cutoff).run()
    const legacyN = (legacy.meta as { changes?: number } | undefined)?.changes ?? 0

    if (gvN > 0 || legacyN > 0) {
      console.log(`[sweep] graveyard deleted: ${gvN} flagged + ${legacyN} legacy nameless`)
    }
  } catch (err) {
    console.error('[sweep] graveyard janitor failed:', err)
  }
}
