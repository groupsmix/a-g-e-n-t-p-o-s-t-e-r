import type { Env } from '../env'

// Stale-run cutoff. A 15-step pipeline that hasn't moved in 30 min is
// almost always wedged (Worker eviction, AI provider hang, dropped
// `waitUntil`, etc.). We bumped this from 15 to 30 min so legitimately
// slow runs aren't killed prematurely while still rescuing the
// "RUNNING forever" rows the user was seeing.
const STALE_CUTOFF_MS = 30 * 60 * 1000

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
  const cutoff = new Date(Date.now() - STALE_CUTOFF_MS).toISOString()
  const stamp = new Date().toISOString()
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

    if (n > 0 || pn > 0) {
      console.log(`[sweep] recovered ${n} stale run(s), ${pn} stale product(s)`)
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
