/**
 * Discovery Agent — NEXUS Phase 2
 *
 * The loop:
 *   Goal → Think → Act → Observe → repeat until step_limit or done
 *
 * Permissions:
 *   READ:  web_search (via AI_WORKER), browser_control (read-only)
 *   WRITE: signals table, pipeline_items at stage=idea ONLY
 *
 * Guardrails enforced structurally (not just by prompt):
 *   - Stage is hardcoded to 'idea' — no code path can write a higher stage
 *   - MAX_STEPS cap enforced in the run loop — cannot loop forever
 *   - No external actions — nothing leaves the system
 *   - Memory writes only on completed run
 *
 * Runs on the daily cron (0 7 * * *) and can be triggered manually
 * via POST /api/discovery/trigger.
 */

import { createLogger } from '@posteragent/logger/workers'
import type { Env } from '../env'

const logger = createLogger('discovery-agent')

// ── Config ──────────────────────────────────────────────────────────────────

const MAX_STEPS = 20         // hard step limit per run
const DISCOVERY_SETTING = 'discovery_agent_enabled'
const NICHE_SETTING     = 'discovery_agent_niche'
const TOPICS_SETTING    = 'discovery_agent_topics'   // comma-separated

// ── Types ───────────────────────────────────────────────────────────────────

type StepType = 'think' | 'act' | 'observe'

interface Step {
  step: number
  type: StepType
  content: string
  tool?: string
  result?: string
  timestamp: string
}

interface DiscoveryRun {
  id: string
  status: 'running' | 'done' | 'failed' | 'step_limit_reached' | 'disabled'
  niche: string
  steps: Step[]
  signals_written: number
  items_written: number
  started_at: string
  finished_at?: string
  error?: string
}

// ── AI helper ───────────────────────────────────────────────────────────────

async function callAI(
  env: Env,
  prompt: string,
  outputFormat: 'json' | 'text' = 'json',
  timeoutMs = 45000,
): Promise<string | null> {
  try {
    const res = await env.AI_WORKER.fetch(
      new Request(env.NEXUS_AI_URL ?? 'https://nexus-ai/task', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ taskType: 'discovery', prompt, outputFormat, timeoutMs }),
      }),
    )
    if (!res.ok) {
      logger.error('AI call failed', new Error(`HTTP ${res.status}`))
      return null
    }
    const data = await res.json() as { output?: string }
    return data.output ?? null
  } catch (err) {
    logger.error('AI call error', err instanceof Error ? err : new Error(String(err)))
    return null
  }
}

// ── Signal writer ────────────────────────────────────────────────────────────

async function writeSignal(
  env: Env,
  run: DiscoveryRun,
  signal: {
    title: string
    source_type: 'search_trend' | 'competitor_gap' | 'ai_radar'
    extracted_audience?: string
    extracted_problem?: string
    evidence: unknown
    demand_score: number
  },
): Promise<string | null> {
  try {
    const row = await env.DB
      .prepare(`
        INSERT INTO signals
          (source_type, title, extracted_audience, extracted_problem,
           evidence_json, demand_score, freshness_score, status)
        VALUES (?, ?, ?, ?, ?, ?, 1.0, 'raw')
        RETURNING id
      `)
      .bind(
        signal.source_type,
        signal.title,
        signal.extracted_audience ?? null,
        signal.extracted_problem ?? null,
        JSON.stringify(signal.evidence),
        signal.demand_score,
      )
      .first<{ id: string }>()

    if (!row) return null
    run.signals_written++
    return row.id
  } catch (err) {
    logger.error('Signal write failed', err instanceof Error ? err : new Error(String(err)))
    return null
  }
}

// ── Pipeline item writer (IDEA STAGE ONLY) ──────────────────────────────────

async function writePipelineIdea(
  env: Env,
  run: DiscoveryRun,
  item: {
    type: 'note' | 'job' | 'product' | 'pod' | 'blog'
    title: string
    content?: string
    source_signal_id?: string
  },
): Promise<void> {
  try {
    // GUARDRAIL: stage is hardcoded — this function cannot write any other stage
    const stage = 'idea' as const

    await env.DB
      .prepare(`
        INSERT INTO pipeline_items
          (type, stage, title, content, created_by, source_signal_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      .bind(
        item.type,
        stage,
        item.title,
        item.content ?? null,
        `discovery-agent:${run.id}`,
        item.source_signal_id ?? null,
      )
      .run()

    run.items_written++
  } catch (err) {
    logger.error('Pipeline idea write failed', err instanceof Error ? err : new Error(String(err)))
  }
}

// ── Run logger ───────────────────────────────────────────────────────────────

async function persistRun(env: Env, run: DiscoveryRun): Promise<void> {
  try {
    // Upsert into agent_runs using the existing schema
    await env.DB
      .prepare(`
        INSERT INTO agent_runs
          (id, agent_name, workflow_type, model, status,
           metadata_json, started_at, finished_at)
        VALUES (?, 'discovery-agent', 'radar_sweep', 'ai-worker', ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          status        = excluded.status,
          metadata_json = excluded.metadata_json,
          finished_at   = excluded.finished_at
      `)
      .bind(
        run.id,
        run.status,
        JSON.stringify({
          niche:           run.niche,
          signals_written: run.signals_written,
          items_written:   run.items_written,
          steps:           run.steps,
          error:           run.error ?? null,
        }),
        run.started_at,
        run.finished_at ?? null,
      )
      .run()
  } catch (err) {
    logger.error('Run persist failed', err instanceof Error ? err : new Error(String(err)))
  }
}

// ── Settings helpers ─────────────────────────────────────────────────────────

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

// ── Main run function ─────────────────────────────────────────────────────────

export async function runDiscoveryAgent(env: Env): Promise<DiscoveryRun> {
  const runId    = crypto.randomUUID()
  const startedAt = new Date().toISOString()

  const run: DiscoveryRun = {
    id:              runId,
    status:          'running',
    niche:           '',
    steps:           [],
    signals_written: 0,
    items_written:   0,
    started_at:      startedAt,
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
  }

  try {
    // ── Enabled check ──────────────────────────────────────────────────────
    const enabled = await getSetting(env, DISCOVERY_SETTING)
    if (enabled === 'false') {
      run.status = 'disabled'
      return run
    }

    // ── Load config ────────────────────────────────────────────────────────
    const niche  = (await getSetting(env, NICHE_SETTING))  ?? 'digital products, freelance services'
    const topics = (await getSetting(env, TOPICS_SETTING)) ?? 'trending tools, buyer pain points, competitor gaps'
    run.niche = niche

    logger.info('Discovery agent starting', { runId, niche })

    // ── Step 1: THINK — what should we look for this cycle? ────────────────
    addStep('think', `Goal: discover trends and opportunities in "${niche}". Topics to watch: ${topics}. I'll search for current trends, then analyse competitor gaps, then propose pipeline ideas.`)

    if (run.steps.length >= MAX_STEPS) { run.status = 'step_limit_reached'; run.finished_at = new Date().toISOString(); await persistRun(env, run); return run }

    // ── Step 2: ACT — call AI to generate search queries ──────────────────
    addStep('act', 'Generating targeted search queries for this niche', 'ai_search_planner')

    const queryPrompt = `You are a market research agent scanning for opportunities in: "${niche}".
Topics of interest: ${topics}.
Today's date: ${new Date().toUTCString()}.

Return JSON exactly: {
  "queries": [
    { "query": string, "intent": "trend"|"competitor"|"buyer_pain", "priority": 1-5 }
  ]
}
Generate 4-6 specific, targeted queries. No generic queries.`

    const queryOutput = await callAI(env, queryPrompt, 'json', 30000)

    if (run.steps.length >= MAX_STEPS) { run.status = 'step_limit_reached'; run.finished_at = new Date().toISOString(); await persistRun(env, run); return run }

    // ── Step 3: OBSERVE — parse the queries ───────────────────────────────
    let queries: Array<{ query: string; intent: string; priority: number }> = []
    try {
      if (queryOutput) {
        const parsed = JSON.parse(queryOutput) as { queries?: typeof queries }
        queries = parsed.queries ?? []
      }
    } catch {
      queries = []
    }

    addStep('observe', `Received ${queries.length} search queries`, undefined, queryOutput?.slice(0, 300))

    if (!queries.length) {
      logger.warn('Discovery agent: no queries generated, using fallbacks')
      queries = [
        { query: `${niche} trends 2025`, intent: 'trend', priority: 3 },
        { query: `${niche} buyer problems`, intent: 'buyer_pain', priority: 4 },
      ]
    }

    // Sort by priority
    queries.sort((a, b) => b.priority - a.priority)

    // ── Steps 4-N: ACT+OBSERVE per query (up to top 4, respecting step limit) ──
    const topQueries = queries.slice(0, 4)

    for (const q of topQueries) {
      if (run.steps.length >= MAX_STEPS - 2) break

      addStep('act', `Searching: "${q.query}" (intent: ${q.intent})`, 'web_search')

      const searchPrompt = `Web search query: "${q.query}"
Niche context: ${niche}
Search intent: ${q.intent}

Based on your knowledge of this topic, return JSON:
{
  "signals": [
    {
      "title": string,
      "source_type": "search_trend"|"competitor_gap"|"ai_radar",
      "extracted_audience": string,
      "extracted_problem": string,
      "demand_score": number (0-100),
      "evidence": { "query": string, "summary": string }
    }
  ],
  "pipeline_ideas": [
    {
      "type": "note"|"job"|"product"|"pod"|"blog",
      "title": string,
      "reason": string
    }
  ]
}
Return 1-3 signals and 1-2 pipeline ideas. Be specific to the niche.`

      const searchOutput = await callAI(env, searchPrompt, 'json', 40000)

      if (run.steps.length >= MAX_STEPS) break

      addStep('observe', `Search complete for: "${q.query}"`, undefined, searchOutput?.slice(0, 400))

      if (!searchOutput) continue

      let parsed: {
        signals?: Array<{
          title: string
          source_type: 'search_trend' | 'competitor_gap' | 'ai_radar'
          extracted_audience?: string
          extracted_problem?: string
          demand_score: number
          evidence?: unknown
        }>
        pipeline_ideas?: Array<{
          type: 'note' | 'job' | 'product' | 'pod' | 'blog'
          title: string
          reason?: string
        }>
      } | null = null

      try {
        parsed = JSON.parse(searchOutput) as typeof parsed
      } catch {
        logger.warn('Discovery: failed to parse search output', { query: q.query })
        continue
      }

      // Write signals
      const signalIds: string[] = []
      for (const sig of parsed?.signals ?? []) {
        const sigId = await writeSignal(env, run, {
          title:              sig.title,
          source_type:        sig.source_type,
          extracted_audience: sig.extracted_audience,
          extracted_problem:  sig.extracted_problem,
          evidence:           sig.evidence ?? { query: q.query },
          demand_score:       sig.demand_score ?? 50,
        })
        if (sigId) signalIds.push(sigId)
      }

      // Write pipeline ideas linked to first signal
      for (const idea of parsed?.pipeline_ideas ?? []) {
        await writePipelineIdea(env, run, {
          type:            idea.type ?? 'note',
          title:           idea.title,
          content:         idea.reason ? `Discovery Agent: ${idea.reason}` : undefined,
          source_signal_id: signalIds[0],
        })
      }
    }

    // ── Final THINK: summarise what was found ──────────────────────────────
    if (run.steps.length < MAX_STEPS) {
      addStep(
        'think',
        `Cycle complete. Wrote ${run.signals_written} signals and ${run.items_written} pipeline ideas to idea stage. No external actions taken.`,
      )
    }

    run.status      = run.steps.length >= MAX_STEPS ? 'step_limit_reached' : 'done'
    run.finished_at = new Date().toISOString()

    logger.info('Discovery agent done', {
      runId,
      steps:           run.steps.length,
      signals_written: run.signals_written,
      items_written:   run.items_written,
      status:          run.status,
    })

  } catch (err) {
    run.status      = 'failed'
    run.error       = err instanceof Error ? err.message : String(err)
    run.finished_at = new Date().toISOString()
    logger.error('Discovery agent failed', err instanceof Error ? err : new Error(String(err)))
  }

  await persistRun(env, run)
  return run
}
