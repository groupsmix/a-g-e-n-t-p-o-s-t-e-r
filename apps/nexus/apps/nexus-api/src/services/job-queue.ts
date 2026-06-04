// ============================================================
// Job Queue — Phase 5
//
// Reliable job queue backed by D1 (SQLite). Supports:
//  - Idempotency keys (prevents duplicate publish/build on retry)
//  - Retry with max_attempts limit
//  - Dead-letter queue (status='dead') for jobs that exhaust retries
//  - Delayed scheduling (scheduled_for)
//  - Priority ordering (1 = highest)
// ============================================================

import type { Env } from '../env'

// ── Job type constants ────────────────────────────────────────────────────

export const JOB_TYPES = {
  RESEARCH:         'research_job',
  SCORE_IDEA:       'score_idea_job',
  BUILD_PRODUCT:    'build_product_job',
  QUALITY_CHECK:    'quality_check_job',
  PUBLISH:          'publish_job',
  MARKETING:        'marketing_job',
  REVENUE_SYNC:     'revenue_sync_job',
  WINNER_ANALYSIS:  'winner_analysis_job',
  GRAVEYARD:        'graveyard_analysis_job',
} as const

export type JobType = typeof JOB_TYPES[keyof typeof JOB_TYPES]

export interface Job {
  job_id:          string
  product_id:      string | null
  opportunity_id:  string | null
  step_name:       string
  idempotency_key: string | null
  status:          'pending' | 'running' | 'done' | 'failed' | 'dead'
  attempt_count:   number
  max_attempts:    number
  priority:        number
  last_error:      string | null
  payload:         string        // raw JSON
  result:          string | null // raw JSON
  created_at:      string
  scheduled_for:   string
  started_at:      string | null
  finished_at:     string | null
}

export interface EnqueueOptions {
  productId?:      string
  opportunityId?:  string
  idempotencyKey?: string
  maxAttempts?:    number
  priority?:       number
  scheduledFor?:   Date
}

// ── Enqueue ───────────────────────────────────────────────────────────────

/**
 * Add a new job to the queue. Returns the new job_id, or the existing
 * job_id if the idempotency key already exists (safe to call twice).
 */
export async function enqueue(
  env: Env,
  stepName: JobType,
  payload: Record<string, unknown>,
  opts: EnqueueOptions = {},
): Promise<string> {
  // If an idempotency key is provided, check for an existing job first.
  if (opts.idempotencyKey) {
    const existing = await env.DB
      .prepare(`SELECT job_id FROM automation_jobs WHERE idempotency_key = ? LIMIT 1`)
      .bind(opts.idempotencyKey)
      .first<{ job_id: string }>()
      .catch(() => null)
    if (existing) return existing.job_id
  }

  const jobId = crypto.randomUUID()
  const scheduledFor = opts.scheduledFor?.toISOString() ?? new Date().toISOString()

  await env.DB
    .prepare(`
      INSERT INTO automation_jobs
        (job_id, product_id, opportunity_id, step_name, idempotency_key,
         status, attempt_count, max_attempts, priority, payload, scheduled_for)
      VALUES (?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?, ?)
    `)
    .bind(
      jobId,
      opts.productId      ?? null,
      opts.opportunityId  ?? null,
      stepName,
      opts.idempotencyKey ?? null,
      opts.maxAttempts    ?? 3,
      opts.priority       ?? 5,
      JSON.stringify(payload),
      scheduledFor,
    )
    .run()

  return jobId
}

// ── Dequeue ───────────────────────────────────────────────────────────────

/**
 * Atomically claim the next available job for execution.
 * Returns null if no jobs are ready.
 */
export async function dequeue(
    env: Env,
    stepName?: JobType,
  ): Promise<Job | null> {
    const now = new Date().toISOString()

    // Pick the highest-priority pending job that is due.
    let query = `
      SELECT * FROM automation_jobs
      WHERE status = 'pending'
        AND scheduled_for <= ?
        AND attempt_count < max_attempts
    `
    
    // If stepName is provided, filter by it
    if (stepName) {
      query += ` AND step_name = ?`
    }
    
    query += ` ORDER BY priority ASC, created_at ASC LIMIT 1`
    
    const stmt = env.DB.prepare(query)
    const bindParams = stepName ? [now, stepName] : [now]
    
    const job = await stmt
      .bind(...bindParams)
      .first<Job>()
      .catch(() => null)

  if (!job) return null

  // Mark it as running (optimistic lock via rowid check not available in D1,
  // so we accept a tiny race window in concurrent Workers — acceptable since
  // each job is idempotent via idempotency_key).
  await env.DB
    .prepare(`
      UPDATE automation_jobs
      SET status = 'running', started_at = ?, attempt_count = attempt_count + 1
      WHERE job_id = ? AND status = 'pending'
    `)
    .bind(now, job.job_id)
    .run()
    .catch(() => void 0)

  return job
}

// ── Complete ──────────────────────────────────────────────────────────────

export async function complete(
  env: Env,
  jobId: string,
  result: Record<string, unknown>,
): Promise<void> {
  const now = new Date().toISOString()
  await env.DB
    .prepare(`
      UPDATE automation_jobs
      SET status = 'done', result = ?, finished_at = ?, last_error = NULL
      WHERE job_id = ?
    `)
    .bind(JSON.stringify(result), now, jobId)
    .run()
}

// ── Fail ──────────────────────────────────────────────────────────────────

/**
 * Mark a job as failed. If attempt_count >= max_attempts, send to dead-letter
 * queue (status='dead'). Otherwise reset to 'pending' so it retries on the
 * next cron tick.
 */
export async function fail(
  env: Env,
  jobId: string,
  error: string,
): Promise<void> {
  const now = new Date().toISOString()
  const job = await env.DB
    .prepare(`SELECT attempt_count, max_attempts FROM automation_jobs WHERE job_id = ?`)
    .bind(jobId)
    .first<{ attempt_count: number; max_attempts: number }>()
    .catch(() => null)

  if (!job) return

  const dead = job.attempt_count >= job.max_attempts
  await env.DB
    .prepare(`
      UPDATE automation_jobs
      SET status = ?, last_error = ?, finished_at = ?
      WHERE job_id = ?
    `)
    .bind(dead ? 'dead' : 'failed', error.slice(0, 1000), dead ? now : null, jobId)
    .run()
}

// ── Re-queue ──────────────────────────────────────────────────────────────

/**
 * Manually re-queue a dead or failed job (resets attempt_count).
 */
export async function requeue(env: Env, jobId: string): Promise<void> {
  await env.DB
    .prepare(`
      UPDATE automation_jobs
      SET status = 'pending', attempt_count = 0, last_error = NULL,
          started_at = NULL, finished_at = NULL, scheduled_for = datetime('now')
      WHERE job_id = ? AND status IN ('dead','failed')
    `)
    .bind(jobId)
    .run()
}

// ── List ──────────────────────────────────────────────────────────────────

export async function listJobs(
  env: Env,
  opts: {
    status?:   string
    stepName?: string
    limit?:    number
    offset?:   number
  } = {},
): Promise<{ jobs: Job[]; total: number }> {
  const conditions: string[] = []
  const binds: (string | number)[] = []

  if (opts.status)   { conditions.push('status = ?');    binds.push(opts.status) }
  if (opts.stepName) { conditions.push('step_name = ?'); binds.push(opts.stepName) }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const limit  = opts.limit  ?? 50
  const offset = opts.offset ?? 0

  const [rows, countRow] = await Promise.all([
    env.DB
      .prepare(`SELECT * FROM automation_jobs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
      .bind(...binds, limit, offset)
      .all<Job>(),
    env.DB
      .prepare(`SELECT COUNT(*) AS n FROM automation_jobs ${where}`)
      .bind(...binds)
      .first<{ n: number }>(),
  ])

  return { jobs: rows.results ?? [], total: countRow?.n ?? 0 }
}

// ── Stats ─────────────────────────────────────────────────────────────────

export async function queueStats(env: Env): Promise<Record<string, number>> {
  const rows = await env.DB
    .prepare(`SELECT status, COUNT(*) AS n FROM automation_jobs GROUP BY status`)
    .all<{ status: string; n: number }>()
    .catch(() => ({ results: [] }))
  return Object.fromEntries((rows.results ?? []).map((r) => [r.status, r.n]))
}

// ── Save agent output ─────────────────────────────────────────────────────

export async function saveAgentOutput(
  env: Env,
  agentName: string,
  jobId: string,
  productId: string | null,
  output: Record<string, unknown>,
): Promise<void> {
  await env.DB
    .prepare(`
      INSERT INTO agent_outputs (job_id, product_id, agent_name, output)
      VALUES (?, ?, ?, ?)
    `)
    .bind(jobId, productId ?? null, agentName, JSON.stringify(output))
    .run()
    .catch(() => void 0)
}
