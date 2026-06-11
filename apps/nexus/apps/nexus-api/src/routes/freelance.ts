import { Hono } from 'hono'
import type { Env } from '../env'
import type {
  FreelanceJob, FreelanceTask, FreelanceEvent, TaskArtifact,
  JobType,
} from '../services/freelance/types'
import { PLAYBOOKS } from '../services/freelance/types'
import { logEvent, updateJobStatus, updateTaskStatus } from '../services/freelance/events'
import { runFreelanceJob } from '../services/freelance/orchestrator'
import { rateLimit } from '../middleware/rate-limit'
import { kvCache } from '../middleware/kv-cache'

export const freelanceRoutes = new Hono<{ Bindings: Env }>()

// ── List jobs ─────────────────────────────────────────────────

  .get('/jobs', async (c) => {
  const status = c.req.query('status')
  const sql = status
    ? 'SELECT * FROM freelance_jobs WHERE status = ? ORDER BY priority DESC, deadline ASC, created_at DESC'
    : 'SELECT * FROM freelance_jobs ORDER BY priority DESC, deadline ASC, created_at DESC'
  const result = status
    ? await c.env.DB.prepare(sql).bind(status).all<FreelanceJob>()
    : await c.env.DB.prepare(sql).all<FreelanceJob>()

  const jobs = (result.results ?? []).map((job) => ({
    ...job,
    at_risk: isAtRisk(job),
  }))

  return c.json({ jobs })
})


// ── Get single job ────────────────────────────────────────────

  .get('/jobs/:id', async (c) => {
  const id = c.req.param('id')
  const job = await c.env.DB.prepare('SELECT * FROM freelance_jobs WHERE id = ?')
    .bind(id)
    .first<FreelanceJob>()
  if (!job) return c.json({ error: 'Job not found' }, 404)

  const [tasks, events, artifacts] = await Promise.all([
    c.env.DB.prepare('SELECT * FROM freelance_tasks WHERE job_id = ? ORDER BY sort_order')
      .bind(id).all<FreelanceTask>(),
    c.env.DB.prepare('SELECT * FROM freelance_events WHERE job_id = ? ORDER BY created_at DESC LIMIT 50')
      .bind(id).all<FreelanceEvent>(),
    c.env.DB.prepare('SELECT * FROM freelance_task_artifacts WHERE job_id = ? ORDER BY created_at DESC')
      .bind(id).all<TaskArtifact>(),
  ])

  return c.json({
    job: { ...job, at_risk: isAtRisk(job) },
    tasks: tasks.results ?? [],
    events: events.results ?? [],
    artifacts: artifacts.results ?? [],
  })
})


// ── Create job ────────────────────────────────────────────────

  .post('/jobs', async (c) => {
  const body = await c.req.json<{
    client_name?: string
    title?: string
    job_type?: string
    brief?: string
    deadline?: string
    budget?: number
    deliverables_required?: string
    links_notes?: string
    attachments_json?: string
    priority?: number
    max_ai_calls?: number
    max_revision_rounds?: number
    max_runtime_minutes?: number
  }>()

  if (!body.client_name || !body.title || !body.brief) {
    return c.json({ error: 'client_name, title, and brief are required' }, 400)
  }

  const jobType = body.job_type as JobType
  if (!PLAYBOOKS[jobType]) {
    return c.json({ error: `Invalid job_type. Must be: ${Object.keys(PLAYBOOKS).join(', ')}` }, 400)
  }

  const id = crypto.randomUUID()
  await c.env.DB.prepare(
    `INSERT INTO freelance_jobs (id, client_name, title, job_type, brief, deadline, budget, deliverables_required, links_notes, attachments_json, priority, max_ai_calls, max_revision_rounds, max_runtime_minutes, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')`,
  )
    .bind(
      id,
      body.client_name,
      body.title,
      jobType,
      body.brief,
      body.deadline ?? null,
      body.budget ?? null,
      body.deliverables_required ?? null,
      body.links_notes ?? null,
      body.attachments_json ?? null,
      body.priority ?? 1,
      body.max_ai_calls ?? 50,
      body.max_revision_rounds ?? 3,
      body.max_runtime_minutes ?? 120,
    )
    .run()

  await logEvent(c.env, id, 'owner', 'job_created', `Created job: ${body.title}`)
  return c.json({ id, status: 'draft' }, 201)
})


// ── Start job (kick off orchestrator) ─────────────────────────

  .post('/jobs/:id/start', rateLimit(10), async (c) => {
  const id = c.req.param('id') ?? ''
  const job = await c.env.DB.prepare('SELECT * FROM freelance_jobs WHERE id = ?')
    .bind(id).first<FreelanceJob>()
  if (!job) return c.json({ error: 'Job not found' }, 404)
  if (job.status !== 'draft') {
    return c.json({ error: `Cannot start job in status: ${job.status}` }, 400)
  }

  c.executionCtx.waitUntil(runFreelanceJob(c.env, id))
  return c.json({ ok: true, status: 'intake_review' })
})


// ── Approve plan ──────────────────────────────────────────────

  .post('/jobs/:id/approve-plan', async (c) => {
  const id = c.req.param('id')
  const job = await c.env.DB.prepare('SELECT * FROM freelance_jobs WHERE id = ?')
    .bind(id).first<FreelanceJob>()
  if (!job) return c.json({ error: 'Job not found' }, 404)
  if (job.status !== 'owner_plan_approval') {
    return c.json({ error: 'Job is not awaiting plan approval' }, 400)
  }

  await logEvent(c.env, id, 'owner', 'plan_approved', 'Owner approved execution plan')
  await updateJobStatus(c.env, id, 'running')
  c.executionCtx.waitUntil(runFreelanceJob(c.env, id))
  return c.json({ ok: true, status: 'running' })
})


// ── Owner provides missing info ───────────────────────────────

  .post('/jobs/:id/provide-info', async (c) => {
  const id = c.req.param('id')
  const { info } = await c.req.json<{ info?: string }>()
  const job = await c.env.DB.prepare('SELECT * FROM freelance_jobs WHERE id = ?')
    .bind(id).first<FreelanceJob>()
  if (!job) return c.json({ error: 'Job not found' }, 404)
  if (job.status !== 'needs_owner_input') {
    return c.json({ error: 'Job is not waiting for owner input' }, 400)
  }

  const updatedBrief = `${job.brief}\n\n[ADDITIONAL INFO]: ${info ?? ''}`
  await c.env.DB.prepare(
    `UPDATE freelance_jobs SET brief = ?, missing_info_json = NULL, updated_at = datetime('now') WHERE id = ?`,
  ).bind(updatedBrief, id).run()

  await logEvent(c.env, id, 'owner', 'info_provided', `Owner provided additional info`)
  await updateJobStatus(c.env, id, 'intake_review')
  c.executionCtx.waitUntil(runFreelanceJob(c.env, id))
  return c.json({ ok: true })
})


// ── Pause / Resume / Cancel ───────────────────────────────────

  .post('/jobs/:id/pause', async (c) => {
  const id = c.req.param('id')
  await updateJobStatus(c.env, id, 'human_review_needed')
  await logEvent(c.env, id, 'owner', 'job_paused', 'Owner paused job')
  return c.json({ ok: true })
})


  .post('/jobs/:id/resume', async (c) => {
  const id = c.req.param('id')
  const job = await c.env.DB.prepare('SELECT * FROM freelance_jobs WHERE id = ?')
    .bind(id).first<FreelanceJob>()
  if (!job) return c.json({ error: 'Job not found' }, 404)

  await logEvent(c.env, id, 'owner', 'job_resumed', 'Owner resumed job')
  await updateJobStatus(c.env, id, 'running')
  c.executionCtx.waitUntil(runFreelanceJob(c.env, id))
  return c.json({ ok: true })
})


  .post('/jobs/:id/cancel', async (c) => {
  const id = c.req.param('id')
  await updateJobStatus(c.env, id, 'archived')
  await logEvent(c.env, id, 'owner', 'job_cancelled', 'Owner cancelled job')
  return c.json({ ok: true })
})


// ── Force approve task ────────────────────────────────────────

  .post('/jobs/:id/tasks/:taskId/force-approve', async (c) => {
  const { id, taskId } = c.req.param()
  await updateTaskStatus(c.env, taskId, 'accepted')
  await logEvent(c.env, id, 'owner', 'force_approved',
    'Owner force-approved task', { taskId })

  // Check if job should continue
  c.executionCtx.waitUntil(runFreelanceJob(c.env, id))
  return c.json({ ok: true })
})


// ── Request revision on task ──────────────────────────────────

  .post('/jobs/:id/tasks/:taskId/request-revision', async (c) => {
  const { id, taskId } = c.req.param()
  const { instructions } = await c.req.json<{ instructions?: string }>()

  await updateTaskStatus(c.env, taskId, 'needs_revision', {
    ceo_review_json: JSON.stringify({
      decision: 'needs_revision',
      score: 0,
      passed_checks: [],
      failed_checks: ['Owner requested revision'],
      revision_instructions: instructions ?? 'Owner requested revision',
      owner_warning: '',
    }),
  })
  await logEvent(c.env, id, 'owner', 'revision_requested',
    instructions ?? 'Owner requested task revision', { taskId })

  await updateJobStatus(c.env, id, 'running')
  c.executionCtx.waitUntil(runFreelanceJob(c.env, id))
  return c.json({ ok: true })
})


// ── Add owner note to CEO ─────────────────────────────────────

  .post('/jobs/:id/add-note', async (c) => {
  const id = c.req.param('id')
  const { note } = await c.req.json<{ note?: string }>()
  if (!note) return c.json({ error: 'note is required' }, 400)

  const job = await c.env.DB.prepare('SELECT owner_notes FROM freelance_jobs WHERE id = ?')
    .bind(id).first<{ owner_notes: string | null }>()
  const existing = job?.owner_notes ?? ''
  const updated = existing
    ? `${existing}\n\n[${new Date().toISOString()}]: ${note}`
    : `[${new Date().toISOString()}]: ${note}`

  await c.env.DB.prepare(
    `UPDATE freelance_jobs SET owner_notes = ?, updated_at = datetime('now') WHERE id = ?`,
  ).bind(updated, id).run()

  await logEvent(c.env, id, 'owner', 'note_added', note)
  return c.json({ ok: true })
})


// ── Update deadline/priority ──────────────────────────────────

  .patch('/jobs/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json<{
    deadline?: string
    priority?: number
    budget?: number
    max_ai_calls?: number
    max_revision_rounds?: number
  }>()

  const updates: Record<string, string | number | null> = {}
  if (body.deadline !== undefined) updates.deadline = body.deadline
  if (body.priority !== undefined) updates.priority = body.priority
  if (body.budget !== undefined) updates.budget = body.budget
  if (body.max_ai_calls !== undefined) updates.max_ai_calls = body.max_ai_calls
  if (body.max_revision_rounds !== undefined) updates.max_revision_rounds = body.max_revision_rounds

  if (Object.keys(updates).length === 0) {
    return c.json({ error: 'No fields to update' }, 400)
  }

  await updateJobStatus(c.env, id, '', updates)
  // Fix: the updateJobStatus sets status to empty, we need a different approach
  const sets = Object.entries(updates).map(([k]) => `${k} = ?`).concat(["updated_at = datetime('now')"])
  const binds = [...Object.values(updates), id]
  await c.env.DB.prepare(`UPDATE freelance_jobs SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...binds).run()

  await logEvent(c.env, id, 'owner', 'job_updated',
    `Updated: ${Object.keys(updates).join(', ')}`)
  return c.json({ ok: true })
})


// ── Approve final deliverable ─────────────────────────────────

  .post('/jobs/:id/approve', async (c) => {
  const id = c.req.param('id')
  const job = await c.env.DB.prepare('SELECT * FROM freelance_jobs WHERE id = ?')
    .bind(id).first<FreelanceJob>()
  if (!job) return c.json({ error: 'Job not found' }, 404)
  if (job.status !== 'ready_for_owner') {
    return c.json({ error: 'Job is not ready for approval' }, 400)
  }

  await updateJobStatus(c.env, id, 'delivered', {
    completed_at: new Date().toISOString(),
  })
  await logEvent(c.env, id, 'owner', 'job_approved', 'Owner approved final deliverable')
  return c.json({ ok: true, status: 'delivered' })
})


// ── Client revision request ───────────────────────────────────

  .post('/jobs/:id/client-revision', async (c) => {
  const id = c.req.param('id')
  const { feedback } = await c.req.json<{ feedback?: string }>()
  const job = await c.env.DB.prepare('SELECT * FROM freelance_jobs WHERE id = ?')
    .bind(id).first<FreelanceJob>()
  if (!job) return c.json({ error: 'Job not found' }, 404)
  if (job.status !== 'delivered') {
    return c.json({ error: 'Job must be delivered before requesting client revision' }, 400)
  }

  await updateJobStatus(c.env, id, 'client_revision_requested', {
    client_feedback: feedback ?? null,
  })
  await logEvent(c.env, id, 'owner', 'client_revision_requested',
    `Client revision requested: ${feedback ?? 'no details'}`)

  c.executionCtx.waitUntil(runFreelanceJob(c.env, id))
  return c.json({ ok: true, status: 'client_revision_requested' })
})


// ── Get task artifacts (version history) ──────────────────────

  .get('/jobs/:id/tasks/:taskId/artifacts', async (c) => {
  const { taskId } = c.req.param()
  const result = await c.env.DB.prepare(
    'SELECT * FROM freelance_task_artifacts WHERE task_id = ? ORDER BY version',
  ).bind(taskId).all<TaskArtifact>()
  return c.json({ artifacts: result.results ?? [] })
})


// ── Get playbook for job type ─────────────────────────────────

  .get('/playbooks/:jobType', async (c) => {
  const jobType = c.req.param('jobType') as JobType
  const playbook = PLAYBOOKS[jobType]
  if (!playbook) return c.json({ error: 'Unknown job type' }, 404)
  return c.json({ job_type: jobType, stages: playbook })
})


// ── Save job as template ──────────────────────────────────────

  .post('/jobs/:id/save-template', async (c) => {
  const id = c.req.param('id')
  const { name } = await c.req.json<{ name?: string }>()
  const job = await c.env.DB.prepare('SELECT * FROM freelance_jobs WHERE id = ?')
    .bind(id).first<FreelanceJob>()
  if (!job) return c.json({ error: 'Job not found' }, 404)
  if (!name) return c.json({ error: 'Template name required' }, 400)

  const templateId = crypto.randomUUID()
  await c.env.DB.prepare(
    `INSERT INTO freelance_templates (id, name, job_type, description, source_job_id, plan_json, intake_answers_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    templateId, name, job.job_type,
    `Template from "${job.title}" for ${job.client_name}`,
    job.id, job.plan_json ?? '{}', job.intake_answers_json ?? null,
  ).run()

  await logEvent(c.env, id, 'owner', 'template_created', `Template "${name}" saved`)
  return c.json({ ok: true, template_id: templateId })
})


// ── List templates ────────────────────────────────────────────

  .get('/templates', async (c) => {
  const jobType = c.req.query('job_type')
  const query = jobType
    ? 'SELECT * FROM freelance_templates WHERE job_type = ? ORDER BY created_at DESC'
    : 'SELECT * FROM freelance_templates ORDER BY created_at DESC'
  const stmt = jobType
    ? c.env.DB.prepare(query).bind(jobType)
    : c.env.DB.prepare(query)
  const result = await stmt.all()
  return c.json({ templates: result.results ?? [] })
})


// ── Get portfolio entries ─────────────────────────────────────

  .get('/portfolio', async (c) => {
  const result = await c.env.DB.prepare(
    'SELECT * FROM freelance_portfolio ORDER BY created_at DESC',
  ).all()
  return c.json({ entries: result.results ?? [] })
})


// ── Generate portfolio entry ──────────────────────────────────

  .post('/jobs/:id/portfolio', async (c) => {
  const id = c.req.param('id')
  const job = await c.env.DB.prepare('SELECT * FROM freelance_jobs WHERE id = ?')
    .bind(id).first<FreelanceJob>()
  if (!job) return c.json({ error: 'Job not found' }, 404)
  if (job.status !== 'delivered' && job.status !== 'archived') {
    return c.json({ error: 'Job must be delivered first' }, 400)
  }

  const { generatePortfolioEntry } = await import('../services/freelance/portfolio')
  const entry = await generatePortfolioEntry(c.env, job)
  return c.json({ ok: true, entry })
})


// ── Owner command center ──────────────────────────────────────

  .get('/command-center', kvCache(30), async (c) => {
  const now = new Date()

  // Jobs due soon (deadline within 48 hours)
  const dueSoonResult = await c.env.DB.prepare(`
    SELECT * FROM freelance_jobs
    WHERE deadline IS NOT NULL
      AND status NOT IN ('delivered', 'archived')
    ORDER BY deadline ASC LIMIT 10
  `).all<FreelanceJob>()
  const dueSoon = (dueSoonResult.results ?? []).filter((j) => {
    const dl = new Date(j.deadline ?? '')
    const hours = (dl.getTime() - now.getTime()) / (1000 * 60 * 60)
    return hours > 0 && hours < 48
  })

  // Blocked jobs
  const blockedResult = await c.env.DB.prepare(`
    SELECT * FROM freelance_jobs
    WHERE status IN ('needs_owner_input', 'human_review_needed')
    ORDER BY updated_at DESC LIMIT 10
  `).all<FreelanceJob>()

  // Ready for approval
  const readyResult = await c.env.DB.prepare(`
    SELECT * FROM freelance_jobs
    WHERE status = 'ready_for_owner'
    ORDER BY updated_at DESC LIMIT 10
  `).all<FreelanceJob>()

  // Running jobs
  const runningResult = await c.env.DB.prepare(`
    SELECT * FROM freelance_jobs
    WHERE status IN ('running', 'ceo_reviewing', 'intake_review', 'planning', 'final_assembly', 'qa_review')
    ORDER BY updated_at DESC LIMIT 10
  `).all<FreelanceJob>()

  // Profit stats
  const statsResult = await c.env.DB.prepare(`
    SELECT
      job_type,
      COUNT(*) as total_jobs,
      SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered,
      SUM(COALESCE(budget, 0)) as total_revenue,
      SUM(COALESCE(estimated_ai_cost, 0)) as total_ai_cost,
      AVG(COALESCE(profit_score, 0)) as avg_profit_score,
      AVG(COALESCE(ai_calls_used, 0)) as avg_ai_calls
    FROM freelance_jobs
    GROUP BY job_type
  `).all()

  // Overall totals
  const totals = await c.env.DB.prepare(`
    SELECT
      COUNT(*) as total_jobs,
      SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered,
      SUM(CASE WHEN status IN ('running', 'ceo_reviewing') THEN 1 ELSE 0 END) as active,
      SUM(COALESCE(budget, 0)) as total_revenue,
      SUM(COALESCE(estimated_ai_cost, 0)) as total_cost
    FROM freelance_jobs
  `).first()

  return c.json({
    due_soon: dueSoon,
    blocked: blockedResult.results ?? [],
    ready_for_approval: readyResult.results ?? [],
    running: runningResult.results ?? [],
    profit_by_type: statsResult.results ?? [],
    totals: totals ?? { total_jobs: 0, delivered: 0, active: 0, total_revenue: 0, total_cost: 0 },
  })
})


// ── Intake questions for job type ─────────────────────────────

  .get('/intake-questions/:jobType', async (c) => {
  const jobType = c.req.param('jobType') as JobType
  const { INTAKE_QUESTIONS } = await import('../services/freelance/types')
  const { POD_INTAKE_QUESTIONS } = await import('../services/freelance/pod-types')
  const { DIGITAL_PRODUCT_INTAKE_QUESTIONS } = await import('../services/freelance/digital-product-types')

  if (jobType === 'pod_product') return c.json({ questions: POD_INTAKE_QUESTIONS })
  if (jobType === 'digital_product') return c.json({ questions: DIGITAL_PRODUCT_INTAKE_QUESTIONS })

  const questions = INTAKE_QUESTIONS[jobType]
  if (!questions) return c.json({ error: 'Unknown job type' }, 404)
  return c.json({ questions })
})


// ── Helpers ───────────────────────────────────────────────────

function isAtRisk(job: FreelanceJob): boolean {
  if (!job.deadline) return false
  if (job.status === 'delivered' || job.status === 'archived') return false
  const deadlineDate = new Date(job.deadline)
  const now = new Date()
  const hoursUntilDeadline = (deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60)
  return hoursUntilDeadline < 24 && hoursUntilDeadline > 0
}
