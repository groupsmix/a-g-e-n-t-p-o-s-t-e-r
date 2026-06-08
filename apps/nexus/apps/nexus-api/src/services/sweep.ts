import type { Env } from '../env'

// Stale-run cutoff. A 15-step pipeline that hasn't moved in 30 min is
// almost always wedged (Worker eviction, AI provider hang, dropped
// `waitUntil`, etc.). We bumped this from 15 to 30 min so legitimately
// slow runs aren't killed prematurely while still rescuing the
// "RUNNING forever" rows the user was seeing.
const STALE_CUTOFF_MS = 30 * 60 * 1000

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
}
