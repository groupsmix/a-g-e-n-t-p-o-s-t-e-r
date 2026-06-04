// ============================================================
// NEXUS-AI Worker Entry Point
// ============================================================
// AI Failover Engine - Handles all AI calls with automatic failover.

import { Hono } from 'hono'
import { runWithFailover, getSpendToday, getDailyCap } from './failover'
import { generateImage } from './image'
import { AI_REGISTRY } from './registry'
import type { TaskType, AIRunTaskRequest, AIRunTaskResponse } from './types'

interface Env {
  CONFIG: KVNamespace
  AI?: { run(model: string, inputs: Record<string, unknown>): Promise<unknown> }
  SECRETS?: {
    get: (key: string) => Promise<string | null>
  }
  [key: string]: unknown
}

const app = new Hono<{ Bindings: Env }>()

// ============================================================
// Main AI Task Endpoint
// ============================================================

app.post('/task', async (c) => {
  const body = await c.req.json<AIRunTaskRequest>()
  const { taskType, prompt, outputFormat = 'text', timeoutMs = 90000 } = body

  if (!taskType || !prompt) {
    return c.json({ error: 'taskType and prompt are required' }, 400)
  }

  try {
    const result = await runWithFailover(
      taskType as TaskType,
      prompt,
      c.env,
      { outputFormat, timeoutMs }
    )

    const response: AIRunTaskResponse = {
      output: result.output,
      model_used: result.model_used,
      models_tried: result.models_tried,
      tokens_used: result.tokens_used,
      cost_usd: result.cost_usd || 0,
    }

    return c.json(response)
  } catch (error) {
    console.error(`[NEXUS-AI] All models failed for task: ${taskType}`, error)
    return c.json(
      {
        error: 'All AI models failed',
        taskType,
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    )
  }
})

// ============================================================
// Image Generation Endpoint
// ============================================================
// Returns a real generated image as base64 (or 204 when no image provider is
// configured, so the workflow can continue without one).

app.post('/image', async (c) => {
  const { prompt } = await c.req.json<{ prompt?: string }>()
  if (!prompt) return c.json({ error: 'prompt is required' }, 400)

  try {
    const image = await generateImage(prompt, c.env)
    if (!image) return c.body(null, 204)
    return c.json(image)
  } catch (error) {
    console.error('[NEXUS-AI] image generation failed', error)
    return c.json({ error: error instanceof Error ? error.message : 'image failed' }, 500)
  }
})

// ============================================================
// Registry Endpoint — the model line-up per task type, so the dashboard
// can show which model each role uses + its fallback chain.
// ============================================================

app.get('/registry', async (c) => {
  const out: Record<string, { id: string; name: string; provider: string; rank: number; isFree: boolean; why: string; configured: boolean }[]> = {}
  for (const [taskType, models] of Object.entries(AI_REGISTRY)) {
    const rows = []
    for (const m of models) {
      let configured = false
      if (m.secretKey) {
        try {
          const v = await c.env.CONFIG.get(`secret:${m.secretKey}`)
          configured = Boolean(v)
        } catch {}
        const envVal = (c.env as Record<string, unknown>)[m.secretKey]
        if (!configured && typeof envVal === 'string' && envVal.length > 0) configured = true
      } else {
        configured = true // no key required (e.g. Cloudflare Workers AI)
      }
      rows.push({ id: m.id, name: m.name, provider: m.provider, rank: m.rank, isFree: Boolean(m.isFree), why: m.why || '', configured })
    }
    out[taskType] = rows.sort((a, b) => a.rank - b.rank)
  }
  return c.json({ registry: out })
})

// ============================================================
// Cost meter + daily spend cap
// ============================================================

app.get('/spend', async (c) => {
  const [today, cap] = await Promise.all([getSpendToday(c.env), getDailyCap(c.env)])
  return c.json({ today, cap, cap_reached: cap > 0 && today >= cap })
})

// POST /cap { cap_usd } — set the daily paid-model spend cap (0 = no cap).
app.post('/cap', async (c) => {
  const { cap_usd } = await c.req.json<{ cap_usd?: number }>()
  const n = Number(cap_usd)
  if (!Number.isFinite(n) || n < 0) return c.json({ error: 'cap_usd must be >= 0' }, 400)
  await c.env.CONFIG.put('ai_daily_cap_usd', String(n))
  return c.json({ ok: true, cap: n })
})

// ============================================================
// Per-provider ON/OFF — pause a model while keeping its key saved.
// State lives in KV as provider_off:<SECRET_KEY> = 'true'.
// ============================================================

app.get('/providers', async (c) => {
  const seen = new Set<string>()
  const out: { secretKey: string; off: boolean }[] = []
  for (const models of Object.values(AI_REGISTRY)) {
    for (const m of models) {
      if (!m.secretKey || seen.has(m.secretKey)) continue
      seen.add(m.secretKey)
      const off = (await c.env.CONFIG.get(`provider_off:${m.secretKey}`)) === 'true'
      out.push({ secretKey: m.secretKey, off })
    }
  }
  return c.json({ providers: out })
})

app.post('/providers/toggle', async (c) => {
  const { secretKey, off } = await c.req.json<{ secretKey?: string; off?: boolean }>()
  if (!secretKey) return c.json({ error: 'secretKey is required' }, 400)
  const kvKey = `provider_off:${secretKey}`
  if (off) await c.env.CONFIG.put(kvKey, 'true')
  else await c.env.CONFIG.delete(kvKey)
  return c.json({ ok: true, secretKey, off: Boolean(off) })
})

// ============================================================
// Health Check
// ============================================================

app.get('/health', (c) => {
  return c.json({ status: 'ok', service: 'nexus-ai', timestamp: new Date().toISOString() })
})

// ============================================================
// Secrets endpoint (dashboard-managed API keys, stored in KV)
// ============================================================
// Called by nexus-api to persist provider keys added from the dashboard.
app.post('/secrets', async (c) => {
  const body = await c.req.json<{ keys?: Record<string, string> }>()
  const keys = body.keys || {}
  let written = 0
  for (const [k, v] of Object.entries(keys)) {
    if (typeof v !== 'string') continue
    const key = `secret:${k}`
    if (v.length === 0) {
      await c.env.CONFIG.delete(key)
    } else {
      await c.env.CONFIG.put(key, v)
      written++
    }
  }
  return c.json({ ok: true, written })
})

// ============================================================
// Model Status Endpoint
// ============================================================

app.get('/models/:id/status', async (c) => {
  const modelId = c.req.param('id')
  const statusKey = `ai_status:${modelId}`

  const status = await c.env.CONFIG.get(statusKey, 'json')

  return c.json({
    model_id: modelId,
    status: status || 'active',
  })
})

// ============================================================
// Export Handler
// ============================================================

export default {
  fetch: app.fetch,
}
