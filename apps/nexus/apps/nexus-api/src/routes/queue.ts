import { Hono } from 'hono'
import type { Env } from '../env'
import {
  enqueue, requeue, listJobs, queueStats, dequeue,
  JOB_TYPES, type JobType,
} from '../services/job-queue'
import { runJob } from '../services/agents'

// ============================================================
// Queue routes — Phase 5 job management API
// ============================================================

export const queueRoutes = new Hono<{ Bindings: Env }>()

// GET /api/queue/stats — dashboard counts by status
queueRoutes.get('/stats', async (c) => {
  const stats = await queueStats(c.env)
  return c.json({ stats })
})

// GET /api/queue/jobs — list jobs (filterable)
queueRoutes.get('/jobs', async (c) => {
  const status   = c.req.query('status')   || undefined
  const stepName = c.req.query('step')     || undefined
  const limit    = Math.min(Number(c.req.query('limit')  || '50'), 200)
  const offset   = Number(c.req.query('offset') || '0')

  const { jobs, total } = await listJobs(c.env, { status, stepName, limit, offset })
  return c.json({ jobs, total })
})

// GET /api/queue/jobs/:id — job detail (includes result JSON)
queueRoutes.get('/jobs/:id', async (c) => {
  const jobId = c.req.param('id')
  const job = await c.env.DB
    .prepare(`SELECT * FROM automation_jobs WHERE job_id = ?`)
    .bind(jobId)
    .first()
    .catch(() => null)

  if (!job) return c.json({ error: 'Job not found' }, 404)

  // Also fetch agent output if available
  const output = await c.env.DB
    .prepare(`SELECT agent_name, output, created_at FROM agent_outputs WHERE job_id = ? ORDER BY created_at DESC LIMIT 1`)
    .bind(jobId)
    .first()
    .catch(() => null)

  return c.json({ job, agent_output: output })
})

// POST /api/queue/jobs — manually enqueue a job
queueRoutes.post('/jobs', async (c) => {
  const body = await c.req.json<{
    step_name:       string
    payload?:        Record<string, unknown>
    product_id?:     string
    opportunity_id?: string
    priority?:       number
  }>()

  if (!body.step_name) return c.json({ error: 'step_name is required' }, 400)
  if (!Object.values(JOB_TYPES).includes(body.step_name as JobType)) {
    return c.json({ error: `Invalid step_name. Valid types: ${Object.values(JOB_TYPES).join(', ')}` }, 400)
  }

  const jobId = await enqueue(c.env, body.step_name as JobType, body.payload ?? {}, {
    productId:     body.product_id,
    opportunityId: body.opportunity_id,
    priority:      body.priority,
  })

  return c.json({ ok: true, job_id: jobId })
})

// POST /api/queue/jobs/:id/requeue — re-queue a dead/failed job
queueRoutes.post('/jobs/:id/requeue', async (c) => {
  const jobId = c.req.param('id')
  await requeue(c.env, jobId)
  return c.json({ ok: true })
})

// DELETE /api/queue/jobs/:id — cancel a pending job
queueRoutes.delete('/jobs/:id', async (c) => {
  const jobId = c.req.param('id')
  const result = await c.env.DB
    .prepare(`UPDATE automation_jobs SET status = 'dead', last_error = 'Cancelled by user' WHERE job_id = ? AND status = 'pending'`)
    .bind(jobId)
    .run()
    .catch(() => null)

  if (!result?.meta?.changes) return c.json({ error: 'Job not found or not in pending state' }, 400)
  return c.json({ ok: true })
})

// POST /api/queue/run-next — dequeue and execute the next pending job immediately
// (useful for testing without waiting for cron)
queueRoutes.post('/run-next', async (c) => {
  const stepName = (c.req.query('step') || undefined) as JobType | undefined
  const job = await dequeue(c.env, stepName)

  if (!job) return c.json({ ok: true, message: 'No pending jobs' })

  // Run in background — return immediately with the job_id
  c.executionCtx.waitUntil(runJob(c.env, job))
  return c.json({ ok: true, job_id: job.job_id, step_name: job.step_name })
})

// POST /api/queue/requeue-all-failed — bulk re-queue all failed/dead jobs
queueRoutes.post('/requeue-all-failed', async (c) => {
  const result = await c.env.DB
    .prepare(`
      UPDATE automation_jobs
      SET status = 'pending', attempt_count = 0, last_error = NULL,
          started_at = NULL, finished_at = NULL, scheduled_for = datetime('now')
      WHERE status IN ('failed','dead')
    `)
    .run()
    .catch(() => null)

  return c.json({ ok: true, requeued: result?.meta?.changes ?? 0 })
})

// GET /api/queue/types — list valid job types
queueRoutes.get('/types', (c) => {
  return c.json({ types: Object.values(JOB_TYPES) })
})
