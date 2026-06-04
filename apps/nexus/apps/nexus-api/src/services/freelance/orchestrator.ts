import type { Env } from '../../env'
import type { FreelanceJob, FreelanceTask, AgentOutput, JobPlan } from './types'
import { PLAYBOOKS } from './types'
import { POD_PLAYBOOK, POD_TRADEMARK_BLACKLIST } from './pod-types'
import { DIGITAL_PRODUCT_PLAYBOOK } from './digital-product-types'
import { detectRedFlags } from './red-flags'
import { logEvent, updateJobStatus, updateTaskStatus, saveArtifact, incrementAiCalls } from './events'
import { runAgent, runCeoReview, runQualityScore, checkSafetyRisks } from './agents'
import { safeJson } from '../shared/json-parse'

// Inject playbooks at module load
PLAYBOOKS.pod_product = POD_PLAYBOOK
PLAYBOOKS.digital_product = DIGITAL_PRODUCT_PLAYBOOK

export async function runFreelanceJob(env: Env, jobId: string): Promise<void> {
  const job = await loadJob(env, jobId)
  if (!job) return

  try {
    if (job.status === 'draft') {
      await runIntakeReview(env, job)
    } else if (job.status === 'intake_review') {
      await runPlanning(env, job)
    } else if (job.status === 'owner_plan_approval' || job.status === 'running') {
      await runTasks(env, job)
    } else if (job.status === 'revision_required') {
      await handleRevisions(env, job)
    } else if (job.status === 'client_revision_requested') {
      await handleClientRevision(env, job)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown orchestrator error'
    await logEvent(env, jobId, 'system', 'error', message)
  }
}

async function loadJob(env: Env, jobId: string): Promise<FreelanceJob | null> {
  return env.DB.prepare('SELECT * FROM freelance_jobs WHERE id = ?')
    .bind(jobId)
    .first<FreelanceJob>()
}

async function loadTasks(env: Env, jobId: string): Promise<FreelanceTask[]> {
  const result = await env.DB.prepare(
    'SELECT * FROM freelance_tasks WHERE job_id = ? ORDER BY sort_order',
  )
    .bind(jobId)
    .all<FreelanceTask>()
  return result.results ?? []
}

// ── Stage 1: Intake Review ────────────────────────────────────

async function runIntakeReview(env: Env, job: FreelanceJob): Promise<void> {
  await updateJobStatus(env, job.id, 'intake_review', {
    current_stage: 'intake_review',
    started_at: new Date().toISOString(),
  })
  await logEvent(env, job.id, 'ceo', 'status_change', 'Starting intake review')

  // Run red flag detection
  const redFlags = detectRedFlags(job)
  if (redFlags.length > 0) {
    await updateJobStatus(env, job.id, 'intake_review', {
      red_flags_json: JSON.stringify(redFlags),
    })
    for (const flag of redFlags) {
      await logEvent(env, job.id, 'ceo', 'red_flag', `[${flag.severity}] ${flag.message}`)
    }
    const criticalFlags = redFlags.filter((f) => f.severity === 'critical')
    if (criticalFlags.length > 0) {
      await updateJobStatus(env, job.id, 'human_review_needed', {
        red_flags_json: JSON.stringify(redFlags),
      })
      await logEvent(env, job.id, 'ceo', 'job_paused', 'Critical red flags detected — owner must review')
      return
    }
  }

  // POD trademark check
  if (job.job_type === 'pod_product') {
    const lower = job.brief.toLowerCase()
    const trademarkHits = POD_TRADEMARK_BLACKLIST.filter((kw) => lower.includes(kw))
    if (trademarkHits.length > 0) {
      await updateJobStatus(env, job.id, 'human_review_needed', {
        missing_info_json: JSON.stringify({
          trademark_warning: `Brief contains potential trademark/IP issues: ${trademarkHits.join(', ')}`,
          flagged_terms: trademarkHits,
        }),
      })
      await logEvent(env, job.id, 'ceo', 'trademark_warning',
        `POD trademark risk: ${trademarkHits.join(', ')}. Accounts get banned for IP violations.`)
      return
    }
  }

  const safetyRisks = checkSafetyRisks(job.brief)
  if (safetyRisks.length > 0) {
    await updateJobStatus(env, job.id, 'human_review_needed', {
      missing_info_json: JSON.stringify({
        safety_warning: `Brief contains risky keywords: ${safetyRisks.join(', ')}`,
        flagged_keywords: safetyRisks,
      }),
    })
    await logEvent(env, job.id, 'ceo', 'safety_warning',
      `Job flagged for safety review: ${safetyRisks.join(', ')}`)
    return
  }

  await incrementAiCalls(env, job.id)
  const intakeResult = await runAgent(env, 'ceo', `
Analyze this freelance job intake. Determine if enough information exists to create an execution plan.

CLIENT: ${job.client_name}
JOB TITLE: ${job.title}
JOB TYPE: ${job.job_type}
BRIEF: ${job.brief}
DEADLINE: ${job.deadline ?? 'not specified'}
BUDGET: ${job.budget ? `$${job.budget}` : 'not specified'}
REQUIRED DELIVERABLES: ${job.deliverables_required ?? 'not specified'}
LINKS/NOTES: ${job.links_notes ?? 'none'}

If info is sufficient, set needs_owner_input to false and provide a summary.
If critical info is missing, set needs_owner_input to true and list missing items.`)

  if (intakeResult.needs_owner_input || intakeResult.missing_info.length > 0) {
    await updateJobStatus(env, job.id, 'needs_owner_input', {
      missing_info_json: JSON.stringify(intakeResult.missing_info),
    })
    await logEvent(env, job.id, 'ceo', 'needs_input',
      `Missing info: ${intakeResult.missing_info.join(', ')}`)
    return
  }

  await logEvent(env, job.id, 'ceo', 'intake_complete', intakeResult.summary)
  await runPlanning(env, { ...job, status: 'intake_review' })
}

// ── Stage 2: Planning ─────────────────────────────────────────

async function runPlanning(env: Env, job: FreelanceJob): Promise<void> {
  await updateJobStatus(env, job.id, 'planning', { current_stage: 'planning' })
  await logEvent(env, job.id, 'ceo', 'status_change', 'Creating execution plan from playbook')

  const playbook = PLAYBOOKS[job.job_type]
  const tasks: JobPlan['tasks'] = playbook.map((stage, i) => ({
    agent_role: stage.agent_role,
    title: stage.title,
    instructions: stage.instructions_template
      .replace(/the client/gi, job.client_name)
      .replace(/this product/gi, job.title),
    acceptance_criteria: stage.default_criteria,
    depends_on: i > 0 ? [playbook[i - 1].name] : [],
    playbook_stage: stage.name,
  }))

  await incrementAiCalls(env, job.id)
  const planResult = await runAgent(env, 'ceo', `
You are creating an execution plan for a ${job.job_type} freelance job.
The playbook has ${playbook.length} stages. Customize the task instructions for this specific job.

CLIENT: ${job.client_name}
BRIEF: ${job.brief}
DELIVERABLES: ${job.deliverables_required ?? 'standard for job type'}

PLAYBOOK STAGES:
${playbook.map((s, i) => `${i + 1}. ${s.name} (${s.agent_role}): ${s.title}`).join('\n')}

Provide a brief approach summary and identify risks. Do NOT change the playbook stages.`)

  const plan: JobPlan = {
    approach: planResult.summary,
    tasks,
    estimated_steps: tasks.length,
    estimated_ai_calls: tasks.length * 2 + 3,
    risks: planResult.risks,
  }

  // Create tasks in DB
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i]
    await env.DB.prepare(
      `INSERT INTO freelance_tasks (id, job_id, agent_role, title, instructions, acceptance_criteria_json, status, depends_on_json, sort_order, playbook_stage, max_revisions)
       VALUES (?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?, ?)`,
    )
      .bind(
        crypto.randomUUID(),
        job.id,
        t.agent_role,
        t.title,
        t.instructions,
        JSON.stringify(t.acceptance_criteria),
        JSON.stringify(t.depends_on),
        i,
        t.playbook_stage,
        job.max_revision_rounds,
      )
      .run()
  }

  await updateJobStatus(env, job.id, 'owner_plan_approval', {
    plan_json: JSON.stringify(plan),
    current_stage: 'owner_plan_approval',
  })
  await logEvent(env, job.id, 'ceo', 'plan_created',
    `Plan created with ${tasks.length} tasks. Awaiting owner approval.`,
    { metadata: { estimated_ai_calls: plan.estimated_ai_calls, risks: plan.risks } })
}

// ── Stage 3: Run tasks sequentially ───────────────────────────

async function runTasks(env: Env, job: FreelanceJob): Promise<void> {
  if (job.status !== 'running') {
    await updateJobStatus(env, job.id, 'running', { current_stage: 'running' })
  }

  const tasks = await loadTasks(env, job.id)

  for (const task of tasks) {
    if (task.status === 'accepted') continue
    if (task.status === 'human_review_needed' || task.status === 'blocked') {
      await updateJobStatus(env, job.id, 'human_review_needed', {
        current_stage: task.playbook_stage,
      })
      await logEvent(env, job.id, 'ceo', 'job_paused',
        `Paused at task "${task.title}" — requires human review`,
        { taskId: task.id })
      return
    }

    if (task.status === 'failed') {
      await updateJobStatus(env, job.id, 'human_review_needed')
      await logEvent(env, job.id, 'ceo', 'task_failed',
        `Task "${task.title}" failed permanently`, { taskId: task.id })
      return
    }

    // Check cost limits
    const freshJob = await loadJob(env, job.id)
    if (freshJob && freshJob.ai_calls_used >= freshJob.max_ai_calls) {
      await updateJobStatus(env, job.id, 'human_review_needed')
      await logEvent(env, job.id, 'ceo', 'cost_limit',
        `AI call limit reached (${freshJob.ai_calls_used}/${freshJob.max_ai_calls})`)
      return
    }

    if (task.status === 'queued' || task.status === 'needs_revision') {
      // Check dependencies
      const deps: string[] = task.depends_on_json ? (safeJson(task.depends_on_json) as string[]) ?? [] : []
      if (deps.length > 0) {
        const depsMet = tasks
          .filter((t) => deps.includes(t.playbook_stage ?? ''))
          .every((t) => t.status === 'accepted')
        if (!depsMet) continue
      }

      await executeTask(env, job, task, tasks)

      // Re-check job status after task execution
      const updatedJob = await loadJob(env, job.id)
      if (updatedJob && updatedJob.status !== 'running') return
    }
  }

  // All tasks accepted → final assembly
  const allAccepted = tasks.every((t) => t.status === 'accepted')
  if (allAccepted) {
    await runFinalAssembly(env, job)
  }
}

async function executeTask(
  env: Env,
  job: FreelanceJob,
  task: FreelanceTask,
  allTasks: FreelanceTask[],
): Promise<void> {
  await updateTaskStatus(env, task.id, 'running')
  await updateJobStatus(env, job.id, 'running', { current_stage: task.playbook_stage })
  await logEvent(env, job.id, task.agent_role, 'task_started',
    `Starting: ${task.title}`, { taskId: task.id })

  // Build context from previous accepted tasks
  const priorOutputs = allTasks
    .filter((t) => t.sort_order < task.sort_order && t.status === 'accepted' && t.output_json)
    .map((t) => `[${t.title}]: ${(safeJson(t.output_json ?? '') as Record<string, unknown>)?.deliverable ?? t.output_json}`)
    .join('\n\n---\n\n')

  const revisionContext = task.status === 'needs_revision' && task.ceo_review_json
    ? `\n\nPREVIOUS CEO FEEDBACK:\n${(safeJson(task.ceo_review_json) as Record<string, unknown>)?.revision_instructions ?? ''}\nThis is revision attempt ${task.revision_count + 1}/${task.max_revisions}.`
    : ''

  const prompt = `JOB: ${job.title} for ${job.client_name}
JOB TYPE: ${job.job_type}
BRIEF: ${job.brief}

YOUR TASK: ${task.title}
INSTRUCTIONS: ${task.instructions}
${priorOutputs ? `\nPRIOR ACCEPTED WORK:\n${priorOutputs}` : ''}${revisionContext}`

  try {
    await incrementAiCalls(env, job.id)
    const output = await runAgent(env, task.agent_role, prompt)

    // Save artifact
    const version = task.revision_count + 1
    await saveArtifact(env, task.id, job.id, version, JSON.stringify(output))

    await updateTaskStatus(env, task.id, 'submitted', {
      output_json: JSON.stringify(output),
    })
    await logEvent(env, job.id, task.agent_role, 'task_submitted',
      `Submitted v${version}: ${output.summary}`, { taskId: task.id })

    if (output.needs_owner_input) {
      await updateTaskStatus(env, task.id, 'human_review_needed')
      await updateJobStatus(env, job.id, 'human_review_needed')
      await logEvent(env, job.id, task.agent_role, 'needs_owner_input',
        `Agent needs owner input: ${output.missing_info.join(', ')}`, { taskId: task.id })
      return
    }

    // CEO reviews
    await runCeoReviewForTask(env, job, task, output)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Task execution failed'
    await updateTaskStatus(env, task.id, 'failed', {
      output_json: JSON.stringify({ error: message }),
    })
    await logEvent(env, job.id, 'system', 'task_error', message, { taskId: task.id })
  }
}

async function runCeoReviewForTask(
  env: Env,
  job: FreelanceJob,
  task: FreelanceTask,
  output: AgentOutput,
): Promise<void> {
  await updateTaskStatus(env, task.id, 'ceo_reviewing')
  await updateJobStatus(env, job.id, 'ceo_reviewing', { current_stage: task.playbook_stage })

  const criteria: string[] = task.acceptance_criteria_json
    ? (safeJson(task.acceptance_criteria_json) as string[]) ?? []
    : []

  await incrementAiCalls(env, job.id)
  const review = await runCeoReview(env, task, output, criteria)

  // Save review to artifact
  await saveArtifact(
    env,
    task.id,
    job.id,
    task.revision_count + 1,
    JSON.stringify(output),
    JSON.stringify(review),
    review.revision_instructions || null,
  )

  if (review.owner_warning) {
    await logEvent(env, job.id, 'ceo', 'owner_warning', review.owner_warning, { taskId: task.id })
  }

  if (review.decision === 'accepted') {
    await updateTaskStatus(env, task.id, 'accepted', {
      ceo_review_json: JSON.stringify(review),
    })
    await logEvent(env, job.id, 'ceo', 'task_accepted',
      `Accepted (score ${review.score}): ${task.title}`, { taskId: task.id })
  } else if (review.decision === 'needs_revision') {
    if (task.revision_count + 1 >= task.max_revisions) {
      await updateTaskStatus(env, task.id, 'human_review_needed', {
        ceo_review_json: JSON.stringify(review),
        revision_count: task.revision_count + 1,
      })
      await updateJobStatus(env, job.id, 'human_review_needed')
      await logEvent(env, job.id, 'ceo', 'max_revisions',
        `Task "${task.title}" hit max revisions (${task.max_revisions}). Owner must review.`,
        { taskId: task.id })
    } else {
      await updateTaskStatus(env, task.id, 'needs_revision', {
        ceo_review_json: JSON.stringify(review),
        revision_count: task.revision_count + 1,
      })
      await logEvent(env, job.id, 'ceo', 'revision_requested',
        `Revision ${task.revision_count + 1}/${task.max_revisions}: ${review.revision_instructions}`,
        { taskId: task.id })
      // Re-run the task with revision instructions
      const freshTask = await env.DB.prepare('SELECT * FROM freelance_tasks WHERE id = ?')
        .bind(task.id)
        .first<FreelanceTask>()
      if (freshTask) {
        const freshTasks = await loadTasks(env, job.id)
        await executeTask(env, job, freshTask, freshTasks)
      }
    }
  } else {
    // blocked or human_review_needed
    await updateTaskStatus(env, task.id, review.decision, {
      ceo_review_json: JSON.stringify(review),
    })
    await updateJobStatus(env, job.id, 'human_review_needed')
    await logEvent(env, job.id, 'ceo', 'task_blocked',
      `Task "${task.title}" is ${review.decision}`, { taskId: task.id })
  }
}

// ── Stage 4: Final Assembly ───────────────────────────────────

async function runFinalAssembly(env: Env, job: FreelanceJob): Promise<void> {
  await updateJobStatus(env, job.id, 'final_assembly', { current_stage: 'final_assembly' })
  await logEvent(env, job.id, 'ceo', 'final_assembly', 'All tasks accepted. Assembling final deliverable.')

  const tasks = await loadTasks(env, job.id)
  const outputs = tasks.map((t) => {
    const output = safeJson(t.output_json ?? '') as Record<string, unknown> | null
    return {
      stage: t.playbook_stage ?? t.title,
      role: t.agent_role,
      deliverable: output?.deliverable ?? t.output_json ?? '',
    }
  })

  const finalOutput = outputs
    .map((o) => `## ${o.stage}\n\n${o.deliverable}`)
    .join('\n\n---\n\n')

  // Run QA
  await updateJobStatus(env, job.id, 'qa_review', { current_stage: 'qa_review' })
  await incrementAiCalls(env, job.id)
  const qualityScore = await runQualityScore(env, job, finalOutput)

  // Get client delivery message from the last task (client_comm)
  const clientCommTask = tasks.find((t) => t.agent_role === 'client_comm')
  const clientCommOutput = clientCommTask?.output_json
    ? (safeJson(clientCommTask.output_json) as Record<string, unknown>)
    : null

  await updateJobStatus(env, job.id, 'ready_for_owner', {
    current_stage: 'ready_for_owner',
    final_output: finalOutput,
    client_message: String(clientCommOutput?.deliverable ?? ''),
    upsell_suggestion: String(
      (clientCommOutput?.assumptions as string[])?.find((a) => a.toLowerCase().includes('upsell')) ?? '',
    ),
    quality_score_json: JSON.stringify(qualityScore),
  })

  await logEvent(env, job.id, 'ceo', 'ready_for_owner',
    `Final deliverable ready. Quality score: ${qualityScore.overall}/100`,
    { metadata: { quality_score: qualityScore } })
}

// ── Handle revision_required ──────────────────────────────────

async function handleRevisions(env: Env, job: FreelanceJob): Promise<void> {
  await updateJobStatus(env, job.id, 'running')
  await runTasks(env, { ...job, status: 'running' })
}

// ── Handle client revision loop ───────────────────────────────

async function handleClientRevision(env: Env, job: FreelanceJob): Promise<void> {
  await updateJobStatus(env, job.id, 'revision_in_progress', {
    current_stage: 'revision_in_progress',
  })
  await logEvent(env, job.id, 'ceo', 'client_revision', 'Processing client revision request')

  // CEO analyzes feedback and creates revision tasks
  await incrementAiCalls(env, job.id)
  const analysis = await runAgent(env, 'ceo', `
Client has requested revisions on a delivered ${job.job_type} job.

ORIGINAL BRIEF: ${job.brief}
CLIENT FEEDBACK: ${job.client_feedback ?? 'No specific feedback provided'}
CURRENT DELIVERABLE: ${(job.final_output ?? '').slice(0, 2000)}

Analyze the feedback. Create specific revision instructions for the production agent.
List what needs to change and what should stay the same.`)

  // Create a revision task
  const revTaskId = crypto.randomUUID()
  await env.DB.prepare(
    `INSERT INTO freelance_tasks (id, job_id, agent_role, title, instructions, acceptance_criteria_json, status, sort_order, playbook_stage, max_revisions)
     VALUES (?, ?, 'production', ?, ?, ?, 'queued', 99, 'client_revision', ?)`,
  )
    .bind(
      revTaskId,
      job.id,
      'Client Revision',
      `Apply client revisions:\n${analysis.deliverable}`,
      JSON.stringify(['Client feedback addressed', 'All original deliverables intact', 'Changes match feedback']),
      job.max_revision_rounds,
    )
    .run()

  await logEvent(env, job.id, 'ceo', 'revision_task_created',
    'Created revision task from client feedback', { taskId: revTaskId })

  // Run the revision task
  const freshJob = await loadJob(env, job.id)
  if (freshJob) {
    await updateJobStatus(env, job.id, 'running')
    await runTasks(env, { ...freshJob, status: 'running' })
  }
}
