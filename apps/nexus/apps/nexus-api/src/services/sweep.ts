import type { Env } from '../env'

// Self-healing: a worker can be evicted mid-build (long background runs),
// leaving a run/steps stuck on 'running' forever. Mark anything still running
// after 15 min as failed so the loop and the health view recover on their own
// — no user intervention while they sleep.
export async function sweepStaleRuns(env: Env): Promise<void> {
  const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString()
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
    if (n > 0) console.log(`[sweep] recovered ${n} stale run(s)`)
  } catch (err) {
    console.error('[sweep] stale-run sweep failed:', err)
  }
}
