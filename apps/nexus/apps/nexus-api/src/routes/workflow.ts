import { Hono } from 'hono'
import type { Env } from '../env'
import type { StartWorkflowInput, WorkflowStatus } from '../types'
import type { AIAttemptLog, WorkflowAICall } from '@posteragent/types/nexus'
import { ProductWorkflow } from '../services/workflow-engine'
import { checkNiche } from '../services/niche-dedup'

interface AICallTraceRow {
  id: string
  ts: string
  task_type: string
  model_used: string | null
  source: 'model' | 'universal' | 'offline' | null
  models_tried_json: string | null
  attempts_json: string | null
  tokens_in: number | null
  tokens_out: number | null
  cost_usd: number | null
  latency_ms: number | null
  caller: string | null
  workflow_id: string | null
  ok: number | null
}

function parseJsonArray<T>(raw: string | null | undefined): T[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed as T[]) : []
  } catch {
    return []
  }
}

export function mapAICallTraceRow(row: AICallTraceRow): WorkflowAICall {
  return {
    id: row.id,
    ts: row.ts,
    task_type: row.task_type,
    model_used: row.model_used,
    source: row.source,
    models_tried: parseJsonArray<string>(row.models_tried_json),
    attempts: parseJsonArray<AIAttemptLog>(row.attempts_json),
    tokens_in: Number(row.tokens_in ?? 0),
    tokens_out: Number(row.tokens_out ?? 0),
    cost_usd: Number(row.cost_usd ?? 0),
    latency_ms: Number(row.latency_ms ?? 0),
    caller: row.caller ?? 'unknown',
    workflow_id: row.workflow_id,
    ok: Number(row.ok ?? 0) === 1,
  }
}

async function fetchWorkflowAICalls(env: Env, runId: string): Promise<WorkflowAICall[]> {
  try {
    const rows = await env.DB.prepare(
      `SELECT id, ts, task_type, model_used, source, models_tried_json, attempts_json,
              tokens_in, tokens_out, cost_usd, latency_ms, caller, workflow_id, ok
         FROM ai_calls
        WHERE workflow_id = ?
        ORDER BY ts ASC`,
    ).bind(runId).all<AICallTraceRow>()
    return (rows.results ?? []).map(mapAICallTraceRow)
  } catch {
    return []
  }
}

export const workflowRoutes = new Hono<{ Bindings: Env }>()

// POST /workflow/start - Start a new workflow
  .post('/start', async (c) => {
  try {
    const body = await c.req.json<StartWorkflowInput>()
    
    // Validate required fields
    if (!body.domain_slug || !body.category_slug) {
      return c.json({ error: 'domain_slug and category_slug are required' }, 400)
    }
    
    // Look up domain and category by slug
    const domain = await c.env.DB.prepare(
      'SELECT id FROM domains WHERE slug = ? AND is_active = 1'
    ).bind(body.domain_slug).first()
    
    if (!domain) {
      return c.json({ error: 'Domain not found' }, 404)
    }
    
    const category = await c.env.DB.prepare(
      'SELECT id FROM categories WHERE slug = ? AND domain_id = ? AND is_active = 1'
    ).bind(body.category_slug, domain.id).first()
    
    if (!category) {
      return c.json({ error: 'Category not found' }, 404)
    }

    // Niche dedup guard: if the caller supplied a niche, refuse to start
    // a duplicate / too-generic build. Generic POST /workflow/start used
    // to bypass dedup entirely.
    const incomingNiche =
      (body.user_input && typeof body.user_input === 'object'
        ? (body.user_input as Record<string, unknown>).niche
        : null) as string | null | undefined
    if (incomingNiche) {
      const guard = await checkNiche(c.env, incomingNiche)
      if (!guard.ok) {
        return c.json({ error: 'Workflow skipped', reason: guard.reason }, 409)
      }
    }

    // Create product
    const productId = crypto.randomUUID()
    const now = new Date().toISOString()
    
    await c.env.DB.prepare(`
      INSERT INTO products (id, domain_id, category_id, user_input, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'draft', ?, ?)
    `).bind(productId, domain.id, category.id, JSON.stringify(body.user_input || {}), now, now).run()
    
    // Create workflow run
    const runId = crypto.randomUUID()
    await c.env.DB.prepare(`
      INSERT INTO workflow_runs (id, product_id, status, created_at)
      VALUES (?, ?, 'queued', ?)
    `).bind(runId, productId, now).run()
    
    // Mark product as running
    await c.env.DB.prepare(`
      UPDATE products SET status = 'running', updated_at = ? WHERE id = ?
    `).bind(now, productId).run()

    // Kick off the 15-step pipeline asynchronously. waitUntil keeps the
    // worker alive after we return 201 so the run finishes in background.
    const engine = new ProductWorkflow(c.env)
    c.executionCtx.waitUntil(
      engine.run(runId, productId as string, body.domain_slug, body.category_slug, body.user_input ?? {})
    )

    return c.json({
      workflow_id: runId,
      product_id: productId,
      status: 'queued',
    }, 201)
  } catch (err) {
    console.error('Error starting workflow:', err)
    return c.json({ error: 'Failed to start workflow' }, 500)
  }
})


// GET /workflow/:id - Get workflow status
  .get('/:id', async (c) => {
  try {
    const runId = c.req.param('id')
    
    // Fetch workflow run
    const run = await c.env.DB.prepare(
      'SELECT * FROM workflow_runs WHERE id = ?'
    ).bind(runId).first()
    
    if (!run) {
      return c.json({ error: 'Workflow not found' }, 404)
    }
    
    // Fetch all steps for this run
    const steps = await c.env.DB.prepare(
      'SELECT id, step_name, step_type, step_order, status, started_at, completed_at, error, ai_model_used, ai_models_tried, tokens_used, cost_usd FROM workflow_steps WHERE run_id = ? ORDER BY step_order'
    ).bind(runId).all()
    
    const aiCalls = await fetchWorkflowAICalls(c.env, runId)

    const status: WorkflowStatus & { ai_calls: WorkflowAICall[] } = {
      id: run.id as string,
      product_id: run.product_id as string,
      status: run.status as WorkflowStatus['status'],
      current_step: run.current_step as string | null,
      total_steps: Number(run.total_steps ?? 0),
      steps: steps.results.map((s: any) => ({
        id: s.id,
        step_name: s.step_name,
        status: s.status,
        started_at: s.started_at,
        completed_at: s.completed_at,
        error: s.error,
        ai_model_used: s.ai_model_used,
        ai_models_tried: s.ai_models_tried,
        tokens_used: s.tokens_used,
        cost_usd: s.cost_usd,
      })),
      error: run.error as string | null,
      started_at: run.started_at as string | null,
      completed_at: run.completed_at as string | null,
      ai_calls: aiCalls,
    }
    
    return c.json(status)
  } catch (err) {
    console.error('Error fetching workflow:', err)
    return c.json({ error: 'Failed to fetch workflow' }, 500)
  }
})


// GET /workflow/:id/status - Get simplified workflow status
  .get('/:id/status', async (c) => {
  try {
    const runId = c.req.param('id')
    
    const run = await c.env.DB.prepare(
      'SELECT id, status, current_step, error, started_at, completed_at FROM workflow_runs WHERE id = ?'
    ).bind(runId).first()
    
    if (!run) {
      return c.json({ error: 'Workflow not found' }, 404)
    }
    
    return c.json({
      id: run.id,
      status: run.status,
      current_step: run.current_step,
      error: run.error,
      started_at: run.started_at,
      completed_at: run.completed_at,
    })
  } catch (err) {
    console.error('Error fetching workflow status:', err)
    return c.json({ error: 'Failed to fetch workflow status' }, 500)
  }
})


// POST /workflow/:id/cancel - Cancel a running workflow
  .post('/:id/cancel', async (c) => {
  try {
    const runId = c.req.param('id')
    
    const result = await c.env.DB.prepare(`
      UPDATE workflow_runs 
      SET status = 'cancelled', completed_at = ?, error = ?
      WHERE id = ? AND status IN ('queued', 'running')
    `).bind(new Date().toISOString(), 'Cancelled by user', runId).run()
    
    if (result.meta.changes === 0) {
      return c.json({ error: 'Workflow not found or already completed' }, 404)
    }
    
    return c.json({ message: 'Workflow cancelled' })
  } catch (err) {
    console.error('Error cancelling workflow:', err)
    return c.json({ error: 'Failed to cancel workflow' }, 500)
  }
})
