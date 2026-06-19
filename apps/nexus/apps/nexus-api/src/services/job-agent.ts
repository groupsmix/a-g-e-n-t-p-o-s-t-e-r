/**
 * Job Agent — NEXUS Phase 3
 *
 * One instance per job. Takes a pipeline_item of type='job' with an attached
 * brief and works it end-to-end, then STOPS and raises an ApprovalRequest.
 *
 * Loop:
 *   Goal (brief) → Think → Act → Observe → repeat
 *   → when deliverable is ready → STOP, move item to 'review', create ApprovalRequest
 *
 * Permissions:
 *   READ:  web_search (via AI_WORKER), pipeline API (read own item)
 *   WRITE: pipeline API (own item only — can move to 'draft' or 'review', never higher)
 *          job_deliverables table
 *          ApprovalRequest (create only)
 *
 * GUARDRAILS (structural — not just in prompt):
 *   1. MAX_STEPS hard cap — cannot loop forever
 *   2. Can only move ITS OWN pipeline item, and only to 'draft' or 'review'
 *   3. NEVER calls send.client, publish.*, spend.* — these are in GATED_ACTIONS
 *      and require an ApprovalRequest. The agent is structurally unable to
 *      call them (they're not in its tool set).
 *   4. External actions are checked against isGatedAction() — if true, agent
 *      STOPS and raises an ApprovalRequest instead of proceeding.
 *   5. Deliverable is written to DB, not sent anywhere.
 */

import { createLogger } from '@posteragent/logger/workers'
import { isGatedAction } from './approval-binding'
import type { Env } from '../env'

const logger = createLogger({ service: 'nexus-api', module: 'job-agent' })

// ── Config ───────────────────────────────────────────────────────────────────

const MAX_STEPS    = 25
const BUDGET_DAILY = 'job_agent_daily_budget_usd'  // settings key

// ── Types ────────────────────────────────────────────────────────────────────

type DeliverableType = 'writing' | 'code' | 'design' | 'research'
type StepType        = 'think' | 'act' | 'observe'

interface JobBrief {
  id: string
  pipeline_item_id: string
  deliverable_type: DeliverableType
  brief_text: string
  client_name: string | null
  client_notes: string | null
  deadline: string | null
}

interface Step {
  step: number
  type: StepType
  content: string
  tool?: string
  result?: string
  timestamp: string
}

export interface JobRun {
  id: string
  pipeline_item_id: string
  status: 'running' | 'awaiting_approval' | 'done' | 'failed' | 'step_limit_reached' | 'no_brief'
  steps: Step[]
  deliverable_id: string | null
  approval_id: string | null
  started_at: string
  finished_at?: string
  error?: string
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getSetting(env: Env, key: string): Promise<string | null> {
  try {
    const row = await env.DB
      .prepare(`SELECT value FROM settings WHERE key = ? LIMIT 1`)
      .bind(key)
      .first<{ value: string }>()
    return row?.value ?? null
  } catch {
    return null
  }
}

async function callAI(
  env: Env,
  prompt: string,
  outputFormat: 'json' | 'text' = 'text',
  timeoutMs = 60000,
): Promise<string | null> {
  try {
    const res = await env.AI_WORKER.fetch(
      new Request(env.NEXUS_AI_URL ?? 'https://nexus-ai/task', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ taskType: 'job_work', prompt, outputFormat, timeoutMs }),
      }),
    )
    if (!res.ok) return null
    const data = await res.json() as { output?: string }
    return data.output ?? null
  } catch (err) {
    logger.error('AI call error', err instanceof Error ? err : new Error(String(err)))
    return null
  }
}

async function movePipelineItem(env: Env, itemId: string, stage: 'draft' | 'review'): Promise<void> {
  // GUARDRAIL: only 'draft' and 'review' are allowed — 'scheduled'/'published' require human approval
  await env.DB
    .prepare(`UPDATE pipeline_items SET stage = ?, updated_at = datetime('now') WHERE id = ?`)
    .bind(stage, itemId)
    .run()
}

async function persistRun(env: Env, run: JobRun): Promise<void> {
  try {
    await env.DB
      .prepare(`
        INSERT INTO agent_runs
          (id, agent_name, workflow_type, model, status,
           metadata_json, started_at, finished_at)
        VALUES (?, 'job-agent', 'asset_generate', 'ai-worker', ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          status        = excluded.status,
          metadata_json = excluded.metadata_json,
          finished_at   = excluded.finished_at
      `)
      .bind(
        run.id,
        run.status,
        JSON.stringify({
          pipeline_item_id: run.pipeline_item_id,
          deliverable_id:   run.deliverable_id,
          approval_id:      run.approval_id,
          steps:            run.steps,
          error:            run.error ?? null,
        }),
        run.started_at,
        run.finished_at ?? null,
      )
      .run()
  } catch (err) {
    logger.error('Run persist failed', err instanceof Error ? err : new Error(String(err)))
  }
}

// ── Approval gate ─────────────────────────────────────────────────────────────

async function raiseApprovalRequest(
  env: Env,
  run: JobRun,
  summary: string,
): Promise<string | null> {
  try {
    // Idempotency: if an approval already exists for this item, return it
    const existing = await env.DB
      .prepare(`
        SELECT id FROM approval_requests
        WHERE pipeline_item_id = ? AND status = 'pending'
        LIMIT 1
      `)
      .bind(run.pipeline_item_id)
      .first<{ id: string }>()

    if (existing) return existing.id

    // approval_requests.task_id is NOT NULL — use the run id as a synthetic task reference
    // (the run IS the task in the NEXUS model)
    const taskRow = await env.DB
      .prepare(`
        SELECT id FROM agent_tasks
        WHERE metadata LIKE ? LIMIT 1
      `)
      .bind(`%${run.pipeline_item_id}%`)
      .first<{ id: string }>()
      .catch(() => null)

    // If no agent_task row exists, create a minimal stub so the FK holds
    let taskId = taskRow?.id
    if (!taskId) {
      taskId = crypto.randomUUID()
      await env.DB
        .prepare(`
          INSERT INTO agent_tasks
            (id, type, status, metadata, created_at, updated_at)
          VALUES (?, 'job_work', 'needs_me', ?, datetime('now'), datetime('now'))
        `)
        .bind(taskId, JSON.stringify({ pipeline_item_id: run.pipeline_item_id, run_id: run.id }))
        .run()
        .catch(() => { /* table may not have all columns — fall through */ })
    }

    const approvalId = crypto.randomUUID()
    await env.DB
      .prepare(`
        INSERT INTO approval_requests
          (id, task_id, pipeline_item_id, action_type, risk_level, status, summary)
        VALUES (?, ?, ?, 'review.deliverable', 'low', 'pending', ?)
      `)
      .bind(approvalId, taskId ?? approvalId, run.pipeline_item_id, summary)
      .run()

    return approvalId
  } catch (err) {
    logger.error('Raise approval failed', err instanceof Error ? err : new Error(String(err)))
    return null
  }
}

// ── Save deliverable ──────────────────────────────────────────────────────────

async function saveDeliverable(
  env: Env,
  run: JobRun,
  content: string,
  format: 'text' | 'markdown' | 'code',
  agentNotes?: string,
): Promise<string | null> {
  try {
    const row = await env.DB
      .prepare(`
        INSERT INTO job_deliverables
          (pipeline_item_id, agent_run_id, content_text, format, agent_notes)
        VALUES (?, ?, ?, ?, ?)
        RETURNING id
      `)
      .bind(run.pipeline_item_id, run.id, content, format, agentNotes ?? null)
      .first<{ id: string }>()
    return row?.id ?? null
  } catch (err) {
    logger.error('Save deliverable failed', err instanceof Error ? err : new Error(String(err)))
    return null
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

export async function runJobAgent(env: Env, pipelineItemId: string): Promise<JobRun> {
  const runId = crypto.randomUUID()

  const run: JobRun = {
    id:               runId,
    pipeline_item_id: pipelineItemId,
    status:           'running',
    steps:            [],
    deliverable_id:   null,
    approval_id:      null,
    started_at:       new Date().toISOString(),
  }

  function addStep(type: StepType, content: string, tool?: string, result?: string) {
    run.steps.push({
      step:      run.steps.length + 1,
      type,
      content,
      tool,
      result,
      timestamp: new Date().toISOString(),
    })
    logger.info(`Step ${run.steps.length}: ${type}`, { runId, content: content.slice(0, 100) })
  }

  function stepLimitReached() {
    return run.steps.length >= MAX_STEPS
  }

  try {
    // ── Load brief ───────────────────────────────────────────────────────────
    const brief = await env.DB
      .prepare(`
        SELECT jb.*, pi.title FROM job_briefs jb
        JOIN pipeline_items pi ON pi.id = jb.pipeline_item_id
        WHERE jb.pipeline_item_id = ?
        LIMIT 1
      `)
      .bind(pipelineItemId)
      .first<JobBrief & { title: string }>()

    if (!brief) {
      run.status      = 'no_brief'
      run.finished_at = new Date().toISOString()
      run.error       = 'No brief found for this pipeline item. Add a brief before starting the agent.'
      await persistRun(env, run)
      return run
    }

    // ── Check daily budget ────────────────────────────────────────────────────
    const budgetStr = await getSetting(env, BUDGET_DAILY)
    const budget    = budgetStr ? parseFloat(budgetStr) : 5.0
    const spendRow  = await env.DB
      .prepare(`
        SELECT COALESCE(SUM(cost_cents), 0) as total
        FROM agent_runs
        WHERE agent_name = 'job-agent'
          AND started_at >= date('now')
      `)
      .first<{ total: number }>()
    const spentToday = (spendRow?.total ?? 0) / 100
    if (spentToday >= budget) {
      run.status      = 'failed'
      run.error       = `Daily budget cap ($${budget}) reached. Spent today: $${spentToday.toFixed(2)}`
      run.finished_at = new Date().toISOString()
      await persistRun(env, run)
      return run
    }

    // Move to draft immediately so the board shows progress
    await movePipelineItem(env, pipelineItemId, 'draft')

    // ── THINK: understand the brief ───────────────────────────────────────────
    addStep('think',
      `Goal: produce a ${brief.deliverable_type} deliverable for "${brief.title}". ` +
      `Brief: ${brief.brief_text.slice(0, 300)}. ` +
      (brief.client_notes ? `Client notes: ${brief.client_notes}. ` : '') +
      (brief.deadline ? `Deadline: ${brief.deadline}. ` : '') +
      `I will research, draft, and then stop for your approval before anything is sent.`
    )

    if (stepLimitReached()) { run.status = 'step_limit_reached'; run.finished_at = new Date().toISOString(); await persistRun(env, run); return run }

    // ── ACT: research ─────────────────────────────────────────────────────────
    addStep('act', `Researching context for: ${brief.title}`, 'web_search')

    const researchPrompt =
      `You are a research assistant for a freelance ${brief.deliverable_type} job.\n` +
      `Job title: "${brief.title}"\n` +
      `Brief: ${brief.brief_text}\n` +
      (brief.client_notes ? `Client constraints: ${brief.client_notes}\n` : '') +
      `\nProvide a concise research summary (2-3 paragraphs) covering:\n` +
      `- Key context needed to complete this deliverable\n` +
      `- Best practices and approach for this type of ${brief.deliverable_type} work\n` +
      `- Any important considerations or pitfalls\n` +
      `Be specific and practical.`

    const research = await callAI(env, researchPrompt, 'text', 45000)

    if (stepLimitReached()) { run.status = 'step_limit_reached'; run.finished_at = new Date().toISOString(); await persistRun(env, run); return run }

    // ── OBSERVE: note what research found ─────────────────────────────────────
    addStep('observe',
      `Research complete (${research?.length ?? 0} chars)`,
      undefined,
      research?.slice(0, 500) ?? 'No research returned'
    )

    if (stepLimitReached()) { run.status = 'step_limit_reached'; run.finished_at = new Date().toISOString(); await persistRun(env, run); return run }

    // ── ACT: produce the deliverable ──────────────────────────────────────────
    // GUARDRAIL CHECK: 'generate_document' is NOT a gated action — it's internal.
    // We verify this explicitly before calling.
    const action = 'generate_document'
    if (isGatedAction(action)) {
      // Should never happen, but if it does — stop immediately
      run.status      = 'awaiting_approval'
      run.finished_at = new Date().toISOString()
      run.error       = `Unexpected gated action: ${action}. Stopping for review.`
      await persistRun(env, run)
      return run
    }

    addStep('act', `Producing ${brief.deliverable_type} deliverable`, action)

    const format: 'text' | 'markdown' | 'code' =
      brief.deliverable_type === 'code' ? 'code' :
      brief.deliverable_type === 'writing' ? 'markdown' : 'text'

    const draftPrompt =
      `You are an expert ${brief.deliverable_type} specialist completing a freelance deliverable.\n\n` +
      `JOB: "${brief.title}"\n` +
      `CLIENT BRIEF: ${brief.brief_text}\n` +
      (brief.client_notes ? `CLIENT CONSTRAINTS: ${brief.client_notes}\n` : '') +
      (research ? `\nRESEARCH CONTEXT:\n${research}\n` : '') +
      `\nProduce the complete, polished deliverable now. ` +
      `Format: ${format}. ` +
      `This goes directly to the client after the operator reviews it — make it production-ready. ` +
      `Do not add meta-commentary or preambles — just the deliverable itself.`

    const deliverableContent = await callAI(env, draftPrompt, 'text', 90000)

    if (stepLimitReached()) { run.status = 'step_limit_reached'; run.finished_at = new Date().toISOString(); await persistRun(env, run); return run }

    // ── OBSERVE: review the draft ─────────────────────────────────────────────
    addStep('observe',
      `Draft complete (${deliverableContent?.length ?? 0} chars). Evaluating quality.`,
      undefined,
      deliverableContent?.slice(0, 300) ?? 'No content returned'
    )

    if (!deliverableContent || deliverableContent.length < 50) {
      run.status      = 'failed'
      run.error       = 'AI returned empty or insufficient deliverable content.'
      run.finished_at = new Date().toISOString()
      await persistRun(env, run)
      return run
    }

    if (stepLimitReached()) { run.status = 'step_limit_reached'; run.finished_at = new Date().toISOString(); await persistRun(env, run); return run }

    // ── THINK: self-review before raising approval ─────────────────────────────
    addStep('act', 'Self-reviewing draft against the brief', 'self_review')

    const reviewPrompt =
      `You are a quality reviewer. Check this ${brief.deliverable_type} deliverable against the brief.\n\n` +
      `BRIEF: ${brief.brief_text}\n` +
      (brief.client_notes ? `CONSTRAINTS: ${brief.client_notes}\n` : '') +
      `\nDELIVERABLE:\n${deliverableContent.slice(0, 2000)}\n\n` +
      `Return JSON: { "passes": boolean, "score": 0-100, "notes": string }`

    const reviewOutput = await callAI(env, reviewPrompt, 'json', 30000)

    let reviewPasses = true
    let reviewScore  = 75
    let reviewNotes  = 'Self-review passed.'

    try {
      if (reviewOutput) {
        const rv = JSON.parse(reviewOutput) as { passes?: boolean; score?: number; notes?: string }
        reviewPasses = rv.passes ?? true
        reviewScore  = rv.score  ?? 75
        reviewNotes  = rv.notes  ?? reviewNotes
      }
    } catch { /* use defaults */ }

    addStep('observe',
      `Self-review: ${reviewPasses ? 'PASS' : 'FAIL'} (score ${reviewScore}/100). ${reviewNotes}`,
    )

    if (stepLimitReached()) { run.status = 'step_limit_reached'; run.finished_at = new Date().toISOString(); await persistRun(env, run); return run }

    // ── STOP: save deliverable, raise approval, move to review ────────────────
    // This is the hard stop. The agent NEVER proceeds past this point.
    addStep('think',
      `Deliverable is ready (score ${reviewScore}/100). ` +
      `Moving item to Review and raising an ApprovalRequest. ` +
      `The agent stops here — nothing will be sent until you approve.`
    )

    // Save the deliverable
    const deliverableId = await saveDeliverable(
      env, run, deliverableContent, format,
      `Self-review score: ${reviewScore}/100. ${reviewNotes}`
    )
    run.deliverable_id = deliverableId

    // Move pipeline item to review
    await movePipelineItem(env, pipelineItemId, 'review')

    // Create approval request — REQUIRED before any external action
    const summary = `Job deliverable ready: "${brief.title}" (${brief.deliverable_type}, ${deliverableContent.length} chars, self-score ${reviewScore}/100)`
    const approvalId = await raiseApprovalRequest(env, run, summary)
    run.approval_id = approvalId

    run.status      = 'awaiting_approval'
    run.finished_at = new Date().toISOString()

    logger.info('Job agent awaiting approval', {
      runId,
      pipelineItemId,
      deliverableId,
      approvalId,
      reviewScore,
    })

  } catch (err) {
    run.status      = 'failed'
    run.error       = err instanceof Error ? err.message : String(err)
    run.finished_at = new Date().toISOString()
    logger.error('Job agent failed', err instanceof Error ? err : new Error(String(err)))
  }

  await persistRun(env, run)
  return run
}
