/**
 * /api/multi-agent — Multi-Agent Coordinator
 *
 * Implements a Planner-first multi-agent architecture:
 *   Planner → Code → Documentation → Testing → Review → Browser
 *
 * The Planner receives a task prompt + repo context, decomposes it into
 * steps, and each subsequent agent executes its specialised phase.
 * Safety rules: no data deletion without explicit approval, all actions logged.
 *
 *   POST   /api/multi-agent/sessions            create a session
 *   GET    /api/multi-agent/sessions            list sessions
 *   GET    /api/multi-agent/sessions/:id        get session + steps
 *   POST   /api/multi-agent/sessions/:id/run    run next agent step
 *   DELETE /api/multi-agent/sessions/:id        cancel a session
 *   GET    /api/multi-agent/sessions/:id/steps  get step logs
 */

import { Hono } from 'hono'
import type { Env } from '../env'

export const multiAgentRoutes = new Hono<{ Bindings: Env }>()

// ── Types ─────────────────────────────────────────────────────────────────────

type AgentType = 'planner' | 'code' | 'documentation' | 'testing' | 'review' | 'browser'
type SessionType = 'full' | 'code-only' | 'doc-only' | 'test-only' | 'review-only'

interface SessionRow {
  id: string
  repo_id: string | null
  session_type: SessionType
  task_prompt: string
  status: string
  plan: string | null
  current_step: number
  result: string | null
  error: string | null
  started_at: string
  completed_at: string | null
}

interface AgentStep {
  step_index: number
  agent_type: AgentType
  description: string
  depends_on: number[]
}

// Agent capability descriptions for prompting
const AGENT_PERSONAS: Record<AgentType, string> = {
  planner: 'You are the Planner Agent. Analyze the task and repository context, then create a detailed implementation plan decomposed into concrete steps for the Code, Documentation, Testing, Review, and Browser agents. Output a JSON plan array.',
  code: 'You are the Code Agent. Implement the code changes specified in the plan. Write production-quality code that follows existing patterns. List every file to create/modify and provide the full content.',
  documentation: 'You are the Documentation Agent. Generate and update all required documentation: README, architecture docs, API docs, inline comments, and changelogs. Keep docs synchronized with code changes.',
  testing: 'You are the Testing Agent. Write comprehensive tests: unit tests, integration tests, and E2E test scenarios. Follow existing test patterns. Aim for >80% coverage of new code.',
  review: 'You are the Review Agent. Review all changes for correctness, security vulnerabilities, performance issues, and code quality. Provide a structured report with PASS/FAIL verdict and specific line-level feedback.',
  browser: 'You are the Browser Agent. Define browser automation steps to validate the deployed application: authentication flows, form submissions, API interactions, UI error detection, and user journey validation.',
}

// Session type → agent sequence
const SESSION_SEQUENCES: Record<SessionType, AgentType[]> = {
  full:         ['planner', 'code', 'documentation', 'testing', 'review', 'browser'],
  'code-only':  ['planner', 'code', 'review'],
  'doc-only':   ['planner', 'documentation'],
  'test-only':  ['planner', 'testing'],
  'review-only':['planner', 'review'],
}

async function callAI(env: Env, prompt: string): Promise<string> {
  try {
    const res = await env.AI_WORKER.fetch(
      new Request(env.NEXUS_AI_URL ?? 'https://nexus-ai/task', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ taskType: 'generate', prompt, outputFormat: 'text', timeoutMs: 120000 }),
      })
    )
    if (!res.ok) throw new Error(`AI worker HTTP ${res.status}`)
    const data = await res.json() as { output?: string }
    return data.output ?? ''
  } catch (err) {
    return `[Agent error: ${err instanceof Error ? err.message : String(err)}]`
  }
}

async function runAgentStep(
  env: Env,
  session: SessionRow,
  agentType: AgentType,
  stepIndex: number,
  previousOutputs: string[]
): Promise<string> {
  const persona = AGENT_PERSONAS[agentType]
  const repoContext = session.repo_id
    ? await env.DB.prepare('SELECT owner, name, branch, project_map FROM repo_projects WHERE id = ?').bind(session.repo_id).first<Record<string, unknown>>().then(r => r ? JSON.stringify(r) : 'No repo context').catch(() => 'No repo context')
    : 'No repository linked'

  const planContext = session.plan ? `\n\n## Implementation Plan\n${session.plan}` : ''
  const previousContext = previousOutputs.length
    ? `\n\n## Previous Agent Outputs\n${previousOutputs.map((o, i) => `### Step ${i + 1}\n${o}`).join('\n\n')}`
    : ''

  const prompt = `${persona}

## Task
${session.task_prompt}

## Repository
${repoContext}${planContext}${previousContext}

## Your Output
Provide a complete, actionable response for your agent role. Be specific, not generic. Include code/docs/tests/analysis as appropriate for your role.`

  return callAI(env, prompt)
}

// ── POST /api/multi-agent/sessions ───────────────────────────────────────────
multiAgentRoutes.post('/sessions', async (c) => {
  let body: { task_prompt?: string; repo_id?: string; session_type?: SessionType } = {}
  try { body = await c.req.json() } catch { return c.json({ error: 'invalid JSON' }, 400) }

  const { task_prompt, repo_id, session_type = 'full' } = body
  if (!task_prompt) return c.json({ error: 'task_prompt is required' }, 400)
  if (!SESSION_SEQUENCES[session_type]) return c.json({ error: `invalid session_type; use: ${Object.keys(SESSION_SEQUENCES).join(', ')}` }, 400)

  if (repo_id) {
    const repo = await c.env.DB.prepare('SELECT id FROM repo_projects WHERE id = ? LIMIT 1').first(repo_id)
    if (!repo) return c.json({ error: 'repo_id not found' }, 404)
  }

  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  await c.env.DB
    .prepare('INSERT INTO agent_sessions (id, repo_id, session_type, task_prompt, status, current_step, started_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)')
    .bind(id, repo_id ?? null, session_type, task_prompt, 'planning', now, now)
    .run()

  // Pre-create step records
  const sequence = SESSION_SEQUENCES[session_type]
  for (let i = 0; i < sequence.length; i++) {
    await c.env.DB
      .prepare('INSERT INTO session_steps (id, session_id, step_index, agent_type, status) VALUES (?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), id, i, sequence[i], i === 0 ? 'pending' : 'pending')
      .run()
  }

  return c.json({ id, session_type, status: 'planning', task_prompt, steps: sequence, started_at: now }, 201)
})

// ── GET /api/multi-agent/sessions ─────────────────────────────────────────────
multiAgentRoutes.get('/sessions', async (c) => {
  const status = c.req.query('status')
  const limit = parseInt(c.req.query('limit') ?? '20')
  const rows = status
    ? await c.env.DB.prepare('SELECT * FROM agent_sessions WHERE status = ? ORDER BY started_at DESC LIMIT ?').bind(status, limit).all<Record<string, unknown>>()
    : await c.env.DB.prepare('SELECT * FROM agent_sessions ORDER BY started_at DESC LIMIT ?').bind(limit).all<Record<string, unknown>>()
  return c.json({ sessions: rows.results ?? [], count: (rows.results ?? []).length })
})

// ── GET /api/multi-agent/sessions/:id ────────────────────────────────────────
multiAgentRoutes.get('/sessions/:id', async (c) => {
  const session = await c.env.DB
    .prepare('SELECT * FROM agent_sessions WHERE id = ? LIMIT 1')
    .first<Record<string, unknown>>(c.req.param('id'))
  if (!session) return c.json({ error: 'not found' }, 404)

  const steps = await c.env.DB
    .prepare('SELECT * FROM session_steps WHERE session_id = ? ORDER BY step_index ASC')
    .bind(c.req.param('id'))
    .all<Record<string, unknown>>()

  if (session.plan) try { session.plan = JSON.parse(session.plan as string) } catch { /* leave */ }
  if (session.result) try { session.result = JSON.parse(session.result as string) } catch { /* leave */ }
  return c.json({ session, steps: steps.results ?? [] })
})

// ── POST /api/multi-agent/sessions/:id/run ───────────────────────────────────
multiAgentRoutes.post('/sessions/:id/run', async (c) => {
  const session = await c.env.DB
    .prepare('SELECT * FROM agent_sessions WHERE id = ? LIMIT 1')
    .first<SessionRow>(c.req.param('id'))
  if (!session) return c.json({ error: 'session not found' }, 404)
  if (['done', 'failed', 'cancelled'].includes(session.status)) {
    return c.json({ error: `session is already ${session.status}` }, 409)
  }

  const sequence = SESSION_SEQUENCES[session.session_type]
  const currentIdx = session.current_step
  if (currentIdx >= sequence.length) {
    await c.env.DB
      .prepare("UPDATE agent_sessions SET status = 'done', completed_at = ?, updated_at = ? WHERE id = ?")
      .bind(new Date().toISOString(), new Date().toISOString(), session.id)
      .run()
    return c.json({ done: true, session_id: session.id })
  }

  const agentType = sequence[currentIdx]

  // Mark step as running
  await c.env.DB
    .prepare("UPDATE session_steps SET status = 'running', started_at = ? WHERE session_id = ? AND step_index = ?")
    .bind(new Date().toISOString(), session.id, currentIdx)
    .run()
  await c.env.DB
    .prepare("UPDATE agent_sessions SET status = 'running', updated_at = ? WHERE id = ?")
    .bind(new Date().toISOString(), session.id)
    .run()

  // Collect previous outputs
  const prevSteps = await c.env.DB
    .prepare('SELECT output FROM session_steps WHERE session_id = ? AND step_index < ? ORDER BY step_index ASC')
    .bind(session.id, currentIdx)
    .all<{ output: string | null }>()
  const previousOutputs = (prevSteps.results ?? []).map(s => s.output ?? '').filter(Boolean)

  let output = ''
  let stepStatus: 'done' | 'failed' = 'done'
  try {
    output = await runAgentStep(c.env, session, agentType, currentIdx, previousOutputs)

    // If planner, store plan
    if (agentType === 'planner') {
      await c.env.DB
        .prepare('UPDATE agent_sessions SET plan = ?, updated_at = ? WHERE id = ?')
        .bind(output, new Date().toISOString(), session.id)
        .run()
    }
  } catch (err) {
    output = `[Error: ${err instanceof Error ? err.message : String(err)}]`
    stepStatus = 'failed'
  }

  const now = new Date().toISOString()
  await c.env.DB
    .prepare('UPDATE session_steps SET status = ?, output = ?, completed_at = ? WHERE session_id = ? AND step_index = ?')
    .bind(stepStatus, output, now, session.id, currentIdx)
    .run()

  const nextStep = currentIdx + 1
  const isLast = nextStep >= sequence.length
  const nextStatus = stepStatus === 'failed' ? 'failed' : isLast ? 'done' : 'running'
  await c.env.DB
    .prepare('UPDATE agent_sessions SET current_step = ?, status = ?, completed_at = ?, updated_at = ? WHERE id = ?')
    .bind(nextStep, nextStatus, isLast || stepStatus === 'failed' ? now : null, now, session.id)
    .run()

  // If last step, summarize result
  if (isLast && stepStatus === 'done') {
    await c.env.DB
      .prepare('UPDATE agent_sessions SET result = ? WHERE id = ?')
      .bind(JSON.stringify({ summary: `All ${sequence.length} agents completed.`, last_output: output.slice(0, 500) }), session.id)
      .run()
  }

  return c.json({
    session_id: session.id,
    step: currentIdx,
    agent_type: agentType,
    status: stepStatus,
    output,
    next_step: isLast ? null : nextStep,
    next_agent: isLast ? null : sequence[nextStep],
    session_done: isLast,
  })
})

// ── GET /api/multi-agent/sessions/:id/steps ──────────────────────────────────
multiAgentRoutes.get('/sessions/:id/steps', async (c) => {
  const steps = await c.env.DB
    .prepare('SELECT * FROM session_steps WHERE session_id = ? ORDER BY step_index ASC')
    .bind(c.req.param('id'))
    .all<Record<string, unknown>>()
  return c.json({ steps: steps.results ?? [] })
})

// ── DELETE /api/multi-agent/sessions/:id — cancel ────────────────────────────
multiAgentRoutes.delete('/sessions/:id', async (c) => {
  await c.env.DB
    .prepare("UPDATE agent_sessions SET status = 'cancelled', updated_at = ? WHERE id = ?")
    .bind(new Date().toISOString(), c.req.param('id'))
    .run()
  return c.json({ ok: true, status: 'cancelled' })
})

// ── GET /api/multi-agent/agents — list agent capabilities ────────────────────
multiAgentRoutes.get('/agents', async (c) => {
  const agents = Object.entries(AGENT_PERSONAS).map(([type, persona]) => ({
    type,
    description: persona.split('.')[0].replace('You are the ', '').replace(' Agent', ''),
    full_persona: persona,
  }))
  const sequences = Object.entries(SESSION_SEQUENCES).map(([type, steps]) => ({ type, steps }))
  return c.json({ agents, session_types: sequences })
})
