import type { Env } from '../../env'
import type { AgentOutput, AgentRole, CeoReview, FreelanceJob, FreelanceTask, QualityScore } from './types'
import { SAFETY_KEYWORDS } from './types'
import { POD_AGENT_PROMPTS } from './pod-types'
import { safeJson } from '../shared/json-parse'

const AI_TIMEOUT_MS = 60_000
const AI_MAX_RETRIES = 2

async function aiCall(
  env: Env,
  body: Record<string, unknown>,
): Promise<{ output?: string }> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= AI_MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS)

      const res = await env.AI_WORKER.fetch(
        new Request('https://nexus-ai/task', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ...body, timeoutMs: AI_TIMEOUT_MS }),
          signal: controller.signal,
        }),
      )
      clearTimeout(timer)

      if (!res.ok) {
        throw new Error(`AI worker returned ${res.status}`)
      }

      return (await res.json()) as { output?: string }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      if (attempt < AI_MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
      }
    }
  }

  throw lastError ?? new Error('AI call failed after retries')
}

const AGENT_SYSTEM_PROMPTS: Record<AgentRole, string> = {
  ceo: `You are the CEO Agent — a strict project manager for freelance jobs.
You review work against acceptance criteria. You reject generic, unsupported, or incomplete output.
You never approve work that contains AI filler phrases, placeholders, or vague claims.
Return structured JSON only.`,

  research: `You are the Research Agent. You gather market data, competitor analysis, audience insights, and evidence.
Every claim must include a source URL or reasoning note.
Return structured JSON only with sources array populated.`,

  strategy: `You are the Strategy Agent. You convert briefs into execution plans, structures, angles, and priorities.
Be specific to the client — no generic frameworks.
Return structured JSON only.`,

  production: `You are the Production Agent. You create the actual deliverable: copy, pages, articles, listings.
Write like a sharp human expert. No AI filler. Be specific, concrete, and original.
Return structured JSON only.`,

  qa: `You are the QA Agent. You check final work against the original client brief and acceptance criteria.
Score each criterion. Flag anything missing, generic, or off-brief.
Return structured JSON only.`,

  client_comm: `You are the Client Communication Agent. You write professional client messages.
Be concise, warm, and specific about what was delivered.
Never promise things not yet completed. Never send automatically — owner must approve.
Return structured JSON only.`,

  // POD-specific agents
  trend_niche: POD_AGENT_PROMPTS.trend_niche,
  trademark_risk: POD_AGENT_PROMPTS.trademark_risk,
  design_director: POD_AGENT_PROMPTS.design_director,
  image_design: POD_AGENT_PROMPTS.image_design,
  mockup: POD_AGENT_PROMPTS.mockup,
  listing: POD_AGENT_PROMPTS.listing,
  pod_qa: POD_AGENT_PROMPTS.pod_qa,
}

const AGENT_OUTPUT_FORMAT = `
Return ONLY valid JSON matching this schema:
{
  "summary": "one-sentence summary of what you did",
  "deliverable": "the actual work output (the main content)",
  "assumptions": ["list of assumptions you made"],
  "risks": ["list of risks or concerns"],
  "missing_info": ["info you need from the owner, if any"],
  "confidence": 0.85,
  "needs_owner_input": false,
  "sources": ["URLs or reasoning notes supporting your work"]
}
No markdown. No explanation. No chat. Just the JSON object.`

const CEO_REVIEW_FORMAT = `
Review this task output against the acceptance criteria.
Return ONLY valid JSON:
{
  "decision": "accepted | needs_revision | blocked | human_review_needed",
  "score": 75,
  "passed_checks": ["criteria that passed"],
  "failed_checks": ["criteria that failed with specific reason"],
  "revision_instructions": "specific instructions if needs_revision, empty string if accepted",
  "owner_warning": "only if owner needs to know something, empty string otherwise"
}
Reject output that is: generic, uses AI filler, has placeholders, lacks evidence, is incomplete, or misses the brief.`

const QUALITY_SCORE_FORMAT = `
Score the final deliverable package against the original brief.
Return ONLY valid JSON:
{
  "brief_match": 85,
  "completeness": 90,
  "originality": 75,
  "client_readiness": 80,
  "risk_level": 15,
  "overall": 82,
  "notes": "brief summary of quality assessment"
}
All scores 0-100. risk_level: 0 = no risk, 100 = very risky.`

export async function runAgent(
  env: Env,
  role: AgentRole,
  prompt: string,
): Promise<AgentOutput> {
  const systemPrompt = AGENT_SYSTEM_PROMPTS[role]
  const fullPrompt = `${systemPrompt}\n\n${AGENT_OUTPUT_FORMAT}\n\nTASK:\n${prompt}`

  const data = await aiCall(env, {
    taskType: 'content_generation',
    prompt: fullPrompt,
    outputFormat: 'json',
  })

  const parsed = safeJson(data.output ?? '')

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Agent returned unparseable output')
  }

  const output = parsed as Record<string, unknown>
  return {
    summary: String(output.summary ?? ''),
    deliverable: String(output.deliverable ?? ''),
    assumptions: Array.isArray(output.assumptions) ? output.assumptions.map(String) : [],
    risks: Array.isArray(output.risks) ? output.risks.map(String) : [],
    missing_info: Array.isArray(output.missing_info) ? output.missing_info.map(String) : [],
    confidence: Number(output.confidence) || 0,
    needs_owner_input: Boolean(output.needs_owner_input),
    sources: Array.isArray(output.sources) ? output.sources.map(String) : [],
  }
}

export async function runCeoReview(
  env: Env,
  task: FreelanceTask,
  output: AgentOutput,
  acceptanceCriteria: string[],
): Promise<CeoReview> {
  const prompt = `${AGENT_SYSTEM_PROMPTS.ceo}\n\n${CEO_REVIEW_FORMAT}

TASK TITLE: ${task.title}
AGENT ROLE: ${task.agent_role}
ACCEPTANCE CRITERIA:
${acceptanceCriteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}

TASK OUTPUT:
Summary: ${output.summary}
Deliverable: ${output.deliverable}
Confidence: ${output.confidence}
Sources: ${output.sources.join(', ') || 'none'}
Assumptions: ${output.assumptions.join(', ') || 'none'}
Risks: ${output.risks.join(', ') || 'none'}`

  const data = await aiCall(env, {
    taskType: 'content_generation',
    prompt,
    outputFormat: 'json',
  })

  const parsed = safeJson(data.output ?? '')

  if (!parsed || typeof parsed !== 'object') {
    return {
      decision: 'human_review_needed',
      score: 0,
      passed_checks: [],
      failed_checks: ['CEO agent returned unparseable review'],
      revision_instructions: '',
      owner_warning: 'CEO review failed — requires manual review',
    }
  }

  const r = parsed as Record<string, unknown>
  const decision = String(r.decision ?? 'human_review_needed')
  const validDecisions = ['accepted', 'needs_revision', 'blocked', 'human_review_needed']

  return {
    decision: validDecisions.includes(decision) ? decision as CeoReview['decision'] : 'human_review_needed',
    score: Number(r.score) || 0,
    passed_checks: Array.isArray(r.passed_checks) ? r.passed_checks.map(String) : [],
    failed_checks: Array.isArray(r.failed_checks) ? r.failed_checks.map(String) : [],
    revision_instructions: String(r.revision_instructions ?? ''),
    owner_warning: String(r.owner_warning ?? ''),
  }
}

export async function runQualityScore(
  env: Env,
  job: FreelanceJob,
  finalOutput: string,
): Promise<QualityScore> {
  const prompt = `${AGENT_SYSTEM_PROMPTS.qa}\n\n${QUALITY_SCORE_FORMAT}

ORIGINAL CLIENT BRIEF:
Client: ${job.client_name}
Job: ${job.title}
Type: ${job.job_type}
Brief: ${job.brief}
Required deliverables: ${job.deliverables_required ?? 'not specified'}

FINAL OUTPUT:
${finalOutput}`

  let data: { output?: string }
  try {
    data = await aiCall(env, {
      taskType: 'content_generation',
      prompt,
      outputFormat: 'json',
    })
  } catch {
    return { brief_match: 0, completeness: 0, originality: 0, client_readiness: 0, risk_level: 50, overall: 0, notes: 'QA scoring failed' }
  }

  const parsed = safeJson(data.output ?? '')

  if (!parsed || typeof parsed !== 'object') {
    return { brief_match: 0, completeness: 0, originality: 0, client_readiness: 0, risk_level: 50, overall: 0, notes: 'QA scoring unparseable' }
  }

  const s = parsed as Record<string, unknown>
  return {
    brief_match: Number(s.brief_match) || 0,
    completeness: Number(s.completeness) || 0,
    originality: Number(s.originality) || 0,
    client_readiness: Number(s.client_readiness) || 0,
    risk_level: Number(s.risk_level) || 0,
    overall: Number(s.overall) || 0,
    notes: String(s.notes ?? ''),
  }
}

export function checkSafetyRisks(brief: string): string[] {
  const lower = brief.toLowerCase()
  return SAFETY_KEYWORDS.filter((kw) => lower.includes(kw))
}
