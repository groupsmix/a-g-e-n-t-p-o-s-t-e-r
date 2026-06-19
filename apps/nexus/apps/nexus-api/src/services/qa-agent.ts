/**
 * QA Agent — NEXUS Phase 4
 *
 * Runs e2e test suites against your own site using the same browser_control
 * tool already built for the Job Agent and Discovery Agent.
 * One implementation, three callers — per NEXUS Architecture spec §3.7.
 *
 * Two modes:
 *   1. Deterministic: navigate + assert (no AI needed — just puppeteer checks)
 *   2. AI-driven:     Think/Act/Observe loop with screenshots when judgment needed
 *
 * Output:
 *   - Writes pass/fail/error to e2e_test_runs + e2e_test_run_steps (already exist)
 *   - Raises a notification in the DB on failure (surfaced in Ops → Logs)
 *   - Never modifies the site — read-only browsing only
 *
 * Trigger:
 *   - Cron: daily batch (same cron as Discovery Agent)
 *   - On-demand: POST /api/qa/trigger or POST /api/qa/suites/:id/run
 */

import { createLogger } from '@posteragent/logger/workers'
import { browse } from './browser'
import type { Env } from '../env'

const logger = createLogger({ service: 'nexus-api', module: 'qa-agent' })

// ── Config ────────────────────────────────────────────────────────────────────

const QA_SETTING    = 'qa_agent_enabled'
const MAX_AI_STEPS  = 15   // per suite, for AI-driven mode

// ── Types ─────────────────────────────────────────────────────────────────────

type CheckVerdict = 'pass' | 'fail' | 'error'

interface Suite {
  id: string
  name: string
  goal: string
  start_url: string | null
  max_steps: number
  enabled: number
  tags: string | null   // JSON array
}

interface SuiteResult {
  suite_id: string
  suite_name: string
  run_id: string
  verdict: CheckVerdict
  step_count: number
  error?: string
  duration_ms: number
}

export interface QARun {
  status: 'done' | 'failed' | 'disabled' | 'no_suites'
  suites_run: number
  passed: number
  failed: number
  errored: number
  results: SuiteResult[]
  started_at: string
  finished_at: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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
  outputFormat: 'json' | 'text' = 'json',
  timeoutMs = 30000,
): Promise<string | null> {
  try {
    const res = await env.AI_WORKER.fetch(
      new Request(env.NEXUS_AI_URL ?? 'https://nexus-ai/task', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ taskType: 'qa_check', prompt, outputFormat, timeoutMs }),
      }),
    )
    if (!res.ok) return null
    const data = await res.json() as { output?: string }
    return data.output ?? null
  } catch {
    return null
  }
}

async function writeNotification(env: Env, title: string, message: string): Promise<void> {
  try {
    await env.DB
      .prepare(`
        INSERT INTO notifications (id, type, title, message, read, created_at)
        VALUES (?, 'qa_failure', ?, ?, 0, datetime('now'))
      `)
      .bind(crypto.randomUUID(), title, message)
      .run()
  } catch {
    // notifications table may not exist in all envs — log and continue
    logger.warn('Could not write QA notification', { title })
  }
}

// ── Deterministic check ────────────────────────────────────────────────────────
// For suites tagged "deterministic": navigate to start_url, verify it loads,
// check for obvious failure signals (4xx/5xx title, error text).

async function runDeterministicCheck(
  env: Env,
  suite: Suite,
  runId: string,
): Promise<{ verdict: CheckVerdict; steps: number; error?: string }> {
  if (!suite.start_url) {
    return { verdict: 'error', steps: 0, error: 'No start_url configured for this suite' }
  }

  const stepId = crypto.randomUUID()
  const now    = new Date().toISOString()
  let verdict: CheckVerdict = 'pass'
  let error: string | undefined

  const result = await browse(env, suite.start_url)

  if (!result.ok) {
    verdict = 'error'
    error   = result.error ?? 'Browse failed'
  } else {
    // Simple heuristics: look for error patterns in title or body text
    const titleLower = (result.title ?? '').toLowerCase()
    const textLower  = (result.text  ?? '').toLowerCase().slice(0, 2000)

    const failSignals = [
      '404', '500', '503', 'not found', 'internal server error',
      'error occurred', 'something went wrong', 'application error',
    ]

    const hit = failSignals.find(sig => titleLower.includes(sig) || textLower.includes(sig))
    if (hit) {
      verdict = 'fail'
      error   = `Failure signal detected: "${hit}" in page title/content`
    }
  }

  // Write a single step record
  await env.DB
    .prepare(`
      INSERT INTO e2e_test_run_steps
        (id, run_id, step_index, event_type, thought, action_type, page_title, page_url, created_at)
      VALUES (?, ?, 1, ?, ?, 'navigate', ?, ?, ?)
    `)
    .bind(
      stepId,
      runId,
      verdict === 'pass' ? 'check_pass' : 'check_fail',
      verdict === 'pass'
        ? `Page loaded: "${result.title ?? 'no title'}"`
        : (error ?? 'Check failed'),
      result.title ?? null,
      result.finalUrl ?? suite.start_url,
      now,
    )
    .run()
    .catch(() => { /* non-fatal */ })

  return { verdict, steps: 1, error }
}

// ── AI-driven check ────────────────────────────────────────────────────────────
// For suites NOT tagged "deterministic": use Think/Act/Observe to pursue goal.

async function runAIDrivenCheck(
  env: Env,
  suite: Suite,
  runId: string,
): Promise<{ verdict: CheckVerdict; steps: number; error?: string }> {
  if (!suite.start_url) {
    return { verdict: 'error', steps: 0, error: 'No start_url configured' }
  }

  const maxSteps = Math.min(suite.max_steps, MAX_AI_STEPS)
  let stepCount  = 0
  let verdict: CheckVerdict = 'error'
  let error: string | undefined
  let currentUrl = suite.start_url

  const addStep = async (
    eventType: string,
    thought: string,
    pageTitle?: string,
    pageUrl?: string,
  ) => {
    stepCount++
    await env.DB
      .prepare(`
        INSERT INTO e2e_test_run_steps
          (id, run_id, step_index, event_type, thought, page_title, page_url, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `)
      .bind(
        crypto.randomUUID(),
        runId,
        stepCount,
        eventType,
        thought,
        pageTitle ?? null,
        pageUrl ?? null,
      )
      .run()
      .catch(() => { /* non-fatal */ })
  }

  // THINK: understand the goal
  await addStep('think', `Goal: ${suite.goal}. Starting at ${currentUrl}. Max ${maxSteps} steps.`)

  for (let i = 0; i < maxSteps - 1; i++) {
    // ACT: browse to current URL
    await addStep('act', `Navigating to ${currentUrl}`, undefined, currentUrl)

    const browseResult = await browse(env, currentUrl)
    if (!browseResult.ok) {
      await addStep('error', `Browse failed: ${browseResult.error}`)
      verdict = 'error'
      error   = browseResult.error
      break
    }

    // OBSERVE + JUDGE: ask AI if goal is met
    await addStep(
      'observe',
      `Page loaded: "${browseResult.title}". Checking against goal…`,
      browseResult.title,
      browseResult.finalUrl ?? currentUrl,
    )

    const judgePrompt =
      `You are a QA agent checking a goal against a page.\n\n` +
      `GOAL: ${suite.goal}\n\n` +
      `PAGE TITLE: ${browseResult.title ?? 'unknown'}\n` +
      `PAGE URL: ${browseResult.finalUrl ?? currentUrl}\n` +
      `PAGE TEXT (first 1500 chars):\n${(browseResult.text ?? '').slice(0, 1500)}\n\n` +
      `Return JSON: { "verdict": "pass"|"fail"|"continue", "reason": string, "next_url": string|null }\n` +
      `"continue" means partial progress — provide next_url to check.\n` +
      `"pass" means the goal is fully satisfied.\n` +
      `"fail" means the goal is clearly NOT met.`

    const judgeOutput = await callAI(env, judgePrompt, 'json', 25000)

    let judgeResult: { verdict: string; reason: string; next_url: string | null } | null = null
    try {
      if (judgeOutput) {
        judgeResult = JSON.parse(judgeOutput)
      }
    } catch {
      judgeResult = null
    }

    if (!judgeResult) {
      await addStep('error', 'Could not parse AI judgment — marking as error')
      verdict = 'error'
      error   = 'AI judgment parse failed'
      break
    }

    await addStep(
      judgeResult.verdict === 'pass' ? 'check_pass' : judgeResult.verdict === 'fail' ? 'check_fail' : 'think',
      judgeResult.reason,
      browseResult.title,
      browseResult.finalUrl,
    )

    if (judgeResult.verdict === 'pass') {
      verdict = 'pass'
      break
    }
    if (judgeResult.verdict === 'fail') {
      verdict = 'fail'
      error   = judgeResult.reason
      break
    }
    if (judgeResult.next_url) {
      currentUrl = judgeResult.next_url
    } else {
      // No next URL and not done — treat as error
      verdict = 'error'
      error   = 'AI did not provide next_url to continue'
      break
    }
  }

  // If we ran out of steps without a verdict
  if (verdict === 'error' && !error) {
    error = `Step limit (${maxSteps}) reached without a pass/fail verdict`
    await addStep('error', error)
  }

  return { verdict, steps: stepCount, error }
}

// ── Run a single suite ─────────────────────────────────────────────────────────

async function runSuite(env: Env, suite: Suite): Promise<SuiteResult> {
  const runId    = crypto.randomUUID()
  const start    = Date.now()
  const now      = new Date().toISOString()

  // Create the run record
  await env.DB
    .prepare(`
      INSERT INTO e2e_test_runs
        (id, suite_id, status, goal, start_url, total_steps, started_at)
      VALUES (?, ?, 'running', ?, ?, 0, ?)
    `)
    .bind(runId, suite.id, suite.goal, suite.start_url ?? null, now)
    .run()
    .catch(() => { /* non-fatal */ })

  // Detect mode from tags
  let tags: string[] = []
  try { tags = suite.tags ? JSON.parse(suite.tags) as string[] : [] } catch { /* */ }
  const isDeterministic = tags.includes('deterministic')

  const { verdict, steps, error } = isDeterministic
    ? await runDeterministicCheck(env, suite, runId)
    : await runAIDrivenCheck(env, suite, runId)

  const duration = Date.now() - start

  // Update the run record
  await env.DB
    .prepare(`
      UPDATE e2e_test_runs
      SET status = ?, total_steps = ?, error = ?, total_ms = ?, completed_at = datetime('now')
      WHERE id = ?
    `)
    .bind(verdict, steps, error ?? null, duration, runId)
    .run()
    .catch(() => { /* non-fatal */ })

  // Update suite last_run
  await env.DB
    .prepare(`UPDATE e2e_test_suites SET last_run_at = datetime('now'), last_verdict = ? WHERE id = ?`)
    .bind(verdict, suite.id)
    .run()
    .catch(() => { /* non-fatal */ })

  return {
    suite_id:   suite.id,
    suite_name: suite.name,
    run_id:     runId,
    verdict,
    step_count: steps,
    error,
    duration_ms: duration,
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

export async function runQAAgent(env: Env, suiteId?: string): Promise<QARun> {
  const started = new Date().toISOString()

  const qa: QARun = {
    status:     'done',
    suites_run: 0,
    passed:     0,
    failed:     0,
    errored:    0,
    results:    [],
    started_at: started,
    finished_at: started,
  }

  // Enabled check
  const enabled = await getSetting(env, QA_SETTING)
  if (enabled === 'false') {
    qa.status = 'disabled'
    qa.finished_at = new Date().toISOString()
    return qa
  }

  // Load suites
  let suites: Suite[]
  try {
    const query = suiteId
      ? env.DB.prepare(`SELECT * FROM e2e_test_suites WHERE id = ? AND enabled = 1`).bind(suiteId)
      : env.DB.prepare(`SELECT * FROM e2e_test_suites WHERE enabled = 1 ORDER BY name`)

    const rows = await query.all<Suite>()
    suites = rows.results ?? []
  } catch {
    suites = []
  }

  if (!suites.length) {
    qa.status = 'no_suites'
    qa.finished_at = new Date().toISOString()
    return qa
  }

  logger.info('QA agent starting', { suites: suites.length, suiteId })

  // Run suites sequentially (browser is shared resource — avoid contention)
  for (const suite of suites) {
    try {
      const result = await runSuite(env, suite)
      qa.results.push(result)
      qa.suites_run++

      if (result.verdict === 'pass')  qa.passed++
      if (result.verdict === 'fail')  qa.failed++
      if (result.verdict === 'error') qa.errored++

      logger.info('Suite result', {
        suite: suite.name,
        verdict: result.verdict,
        steps: result.step_count,
        ms: result.duration_ms,
      })

      // Raise notification on failure
      if (result.verdict === 'fail' || result.verdict === 'error') {
        await writeNotification(
          env,
          `QA ${result.verdict.toUpperCase()}: ${suite.name}`,
          result.error ?? `Suite "${suite.name}" did not pass. Check Ops → Logs for details.`,
        )
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error('Suite run error', err instanceof Error ? err : new Error(msg), { suite: suite.name })
      qa.results.push({
        suite_id: suite.id, suite_name: suite.name, run_id: 'error',
        verdict: 'error', step_count: 0, error: msg, duration_ms: 0,
      })
      qa.errored++
    }
  }

  qa.status      = qa.failed > 0 || qa.errored > 0 ? 'failed' : 'done'
  qa.finished_at = new Date().toISOString()

  logger.info('QA agent done', {
    suites: qa.suites_run, passed: qa.passed, failed: qa.failed, errored: qa.errored,
  })

  return qa
}
