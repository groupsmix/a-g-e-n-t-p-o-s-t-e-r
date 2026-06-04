// ============================================================
// AI Failover Engine
// ============================================================
// Core failover logic with automatic model switching on failure.

import { AI_REGISTRY } from './registry'
import { offlineGenerate } from './offline'
import type { AIRegistryEntry, TaskType, FailoverResult, FailoverOptions, AIStatusCache } from './types'
import { createLogger } from '@nexus/logger'

const logger = createLogger({ service: 'nexus-ai', module: 'failover' })

interface Env {
  CONFIG: KVNamespace
  AI?: { run(model: string, inputs: Record<string, unknown>): Promise<unknown> }
  SECRETS?: {
    get(key: string): Promise<string | null>
  }
  // Plain worker secrets fall back here (wrangler secret put KEY).
  [key: string]: unknown
}

/**
 * Run an AI task with automatic failover to next model on failure.
 * Checks rate limits, API keys, and handles errors gracefully.
 */
export async function runWithFailover(
  taskType: TaskType,
  prompt: string,
  env: Env,
  options: FailoverOptions = {}
): Promise<FailoverResult> {
  const { timeoutMs = 90000, outputFormat = 'text' } = options

  const models = AI_REGISTRY[taskType] || []
  const tried: string[] = []

  // Cost guardrail: how much we've already spent today on paid models.
  const cap = await getDailyCap(env)
  const spentToday = await getSpendToday(env)
  const capReached = cap > 0 && spentToday >= cap

  for (const model of models) {
    // 0. Per-provider ON/OFF — a key can stay saved while the model is paused.
    if (await isProviderDisabled(env, model)) {
      logger.info('Skipping model — provider disabled', { model: model.name, taskType })
      continue
    }

    // 0b. Daily spend cap — once hit, skip paid models and fall to free ones.
    if (model.isFree === false && capReached) {
      logger.info('Skipping model — daily spend cap reached', { model: model.name, taskType, cap })
      continue
    }

    // 1. Check if API key exists
    const apiKey = model.secretKey
      ? await getSecret(env, model.secretKey)
      : 'local'

    if (!apiKey) {
      logger.info('Skipping model — no API key configured', { model: model.name, taskType })
      continue
    }

    // 2. Check rate limit status from KV
    const statusKey = `ai_status:${model.id}`
    const statusRaw = await env.CONFIG.get(statusKey, 'json')
    
    if (statusRaw) {
      const status = statusRaw as AIStatusCache
      if (Date.now() < status.reset_at) {
        const waitMin = Math.ceil((status.reset_at - Date.now()) / 60000)
        logger.info('Skipping model — rate limited', { model: model.name, taskType, waitMin })
        continue
      }
    }

    tried.push(model.id)
    logger.info('Trying model', { model: model.name, taskType })

    try {
      const result = await callModelWithTimeout(
        model,
        apiKey,
        prompt,
        timeoutMs,
        outputFormat,
        env
      )

      logger.info('Model succeeded', { model: model.name, taskType, tokens_used: result.tokens_used, cost_usd: result.cost_usd })

      // Track spend for the cost meter + daily cap (paid models only).
      if (model.isFree === false && result.cost_usd) {
        await addSpend(env, result.cost_usd)
      }

      // Clear any previous rate limit status on success
      if (statusRaw) {
        await env.CONFIG.delete(statusKey)
      }

      return {
        output: result.output,
        model_used: model.id,
        models_tried: tried,
        tokens_used: result.tokens_used,
        cost_usd: result.cost_usd,
      }
    } catch (error: any) {
      const statusCode = error.status || error.statusCode || 0
      const errorMsg = error.message || 'Unknown error'

      if (statusCode === 429 || errorMsg.includes('rate_limit')) {
        // Rate limit — sleep for 1 hour
        const resetAt = Date.now() + 3_600_000
        await env.CONFIG.put(statusKey, JSON.stringify({
          type: 'rate_limited',
          reset_at: resetAt,
          hit_at: Date.now(),
        }), { expirationTtl: 3700 })
        logger.warn('Model rate limited — sleeping 1hr', { model: model.name, taskType, resetAt })

      } else if (statusCode === 402 || errorMsg.includes('quota') || errorMsg.includes('insufficient_quota')) {
        // Daily quota — sleep until midnight UTC
        const midnight = new Date()
        midnight.setUTCHours(24, 0, 0, 0)
        const resetAt = midnight.getTime()
        await env.CONFIG.put(statusKey, JSON.stringify({
          type: 'quota_exceeded',
          reset_at: resetAt,
          hit_at: Date.now(),
        }), { expirationTtl: Math.ceil((resetAt - Date.now()) / 1000) + 60 })
        logger.warn('Model quota exceeded — sleeping until midnight', { model: model.name, taskType, resetAt })

      } else if (statusCode === 401 || statusCode === 403) {
        // Invalid key — skip permanently until key changes
        await env.CONFIG.put(statusKey, JSON.stringify({
          type: 'invalid_key',
          reset_at: Date.now() + 86_400_000,
          hit_at: Date.now(),
        }), { expirationTtl: 86460 })
        logger.warn('Model has invalid API key', { model: model.name, taskType })

      } else {
        logger.error('Model error', new Error(errorMsg), { model: model.name, taskType, statusCode })
      }

      continue
    }
  }

  // No registry provider was available. Before falling back to offline
  // templates, try the universal free/real providers: Groq (free tier, if a
  // key is set) then Cloudflare Workers AI (free, no key). This keeps output
  // real AI at zero cost whenever possible.
  const universal = await tryUniversalProviders(prompt, env, outputFormat, timeoutMs, tried)
  if (universal) return universal

  // No provider was available (or all failed). Rather than aborting the whole
  // workflow, fall back to the deterministic offline generator so the user
  // still gets a complete, reviewable product. Real providers take over the
  // moment any API key is configured.
  logger.info('Falling back to offline template', { taskType, tried })
  const output = offlineGenerate(taskType, prompt, outputFormat)
  return {
    output,
    model_used: 'offline-template',
    models_tried: tried,
    tokens_used: 0,
    cost_usd: 0,
  }
}

// ============================================================
// Model Callers
// ============================================================

// ============================================================
// Universal free/real fallback providers
// ============================================================
// Used when no registry model has a usable key. Tries Groq (free tier) first,
// then Cloudflare Workers AI (free, bound, no external key). Returns null if
// neither produced output, so the caller can fall back to offline templates.
async function tryUniversalProviders(
  prompt: string,
  env: Env,
  outputFormat: string,
  timeoutMs: number,
  tried: string[]
): Promise<FailoverResult | null> {
  // 1. Groq — free tier, OpenAI-compatible. Only if a key is configured.
  const groqKey = await getSecret(env, 'GROQ_API_KEY')
  if (groqKey) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      tried.push('groq-llama-3.3-70b')
      const result = await callOpenAICompatible(
        'https://api.groq.com/openai/v1',
        groqKey,
        { apiModelName: 'llama-3.3-70b-versatile', costPer1MTokens: 0 } as AIRegistryEntry,
        prompt,
        outputFormat,
        controller.signal
      )
      logger.info('Universal fallback succeeded', { model: 'groq-llama-3.3-70b' })
      return { output: result.output, model_used: 'groq-llama-3.3-70b', models_tried: tried, tokens_used: result.tokens_used, cost_usd: result.cost_usd }
    } catch (error) {
      logger.warn('Groq universal fallback failed', { error: error instanceof Error ? error.message : 'error' })
    } finally {
      clearTimeout(timeout)
    }
  }

  // 2. Cloudflare Workers AI — free, bound to the worker, no external key.
  if (env.AI) {
    try {
      tried.push('cloudflare-workers-ai-llama')
      // env.AI.run doesn't take an AbortSignal, so race it against a hard
      // deadline — otherwise a hung binding stalls the whole product run.
      const out = (await Promise.race([
        env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 4096,
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('cloudflare-workers-ai timed out')), timeoutMs),
        ),
      ])) as { response?: string }
      if (out?.response && out.response.trim()) {
        logger.info('Universal fallback succeeded', { model: 'cloudflare-workers-ai-llama' })
        return { output: out.response, model_used: 'cloudflare-workers-ai-llama', models_tried: tried, tokens_used: 0, cost_usd: 0 }
      }
    } catch (error) {
      logger.warn('Cloudflare Workers AI fallback failed', { error: error instanceof Error ? error.message : 'error' })
    }
  }

  return null
}

async function callModelWithTimeout(
  model: AIRegistryEntry,
  apiKey: string,
  prompt: string,
  timeoutMs: number,
  outputFormat: string,
  _env: Env
): Promise<{ output: string; tokens_used: number; cost_usd: number }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    let result: { output: string; tokens_used: number; cost_usd: number }

    switch (model.provider) {
      case 'deepseek':
        result = await callOpenAICompatible(
          'https://api.deepseek.com/v1',
          apiKey,
          model,
          prompt,
          outputFormat,
          controller.signal
        )
        break

      case 'siliconflow':
        result = await callOpenAICompatible(
          'https://api.siliconflow.cn/v1',
          apiKey,
          model,
          prompt,
          outputFormat,
          controller.signal
        )
        break

      case 'groq':
        result = await callOpenAICompatible(
          'https://api.groq.com/openai/v1',
          apiKey,
          model,
          prompt,
          outputFormat,
          controller.signal
        )
        break

      case 'fireworks':
        result = await callOpenAICompatible(
          'https://api.fireworks.ai/inference/v1',
          apiKey,
          model,
          prompt,
          outputFormat,
          controller.signal
        )
        break

      case 'moonshot':
        result = await callOpenAICompatible(
          'https://api.moonshot.cn/v1',
          apiKey,
          model,
          prompt,
          outputFormat,
          controller.signal
        )
        break

      case 'anthropic':
        result = await callAnthropic(apiKey, model, prompt, controller.signal)
        break

      case 'openai':
        result = await callOpenAICompatible(
          'https://api.openai.com/v1',
          apiKey,
          model,
          prompt,
          outputFormat,
          controller.signal
        )
        break

      case 'perplexity':
        result = await callOpenAICompatible(
          'https://api.perplexity.ai',
          apiKey,
          model,
          prompt,
          outputFormat,
          controller.signal
        )
        break

      case 'mistral':
        result = await callOpenAICompatible(
          'https://api.mistral.ai/v1',
          apiKey,
          model,
          prompt,
          outputFormat,
          controller.signal
        )
        break

      case 'google':
        result = await callGemini(apiKey, model, prompt, controller.signal)
        break

      case 'fal':
        result = await callFal(apiKey, model, prompt, controller.signal)
        break

      case 'huggingface':
        result = await callHuggingFace(apiKey, model, prompt, controller.signal)
        break

      case 'tavily':
        result = await callTavily(apiKey, prompt, controller.signal)
        break

      case 'exa':
        result = await callExa(apiKey, prompt, controller.signal)
        break

      case 'serpapi':
        result = await callSerpAPI(apiKey, prompt, controller.signal)
        break

      default:
        throw new Error(`Unknown provider: ${model.provider}`)
    }

    return result
  } finally {
    clearTimeout(timeout)
  }
}

// ============================================================
// OpenAI-Compatible API Caller
// ============================================================

async function callOpenAICompatible(
  baseUrl: string,
  apiKey: string,
  model: AIRegistryEntry,
  prompt: string,
  outputFormat: string,
  signal: AbortSignal
): Promise<{ output: string; tokens_used: number; cost_usd: number }> {
  const body: Record<string, unknown> = {
    model: model.apiModelName,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 4096,
    temperature: 0.7,
  }

  if (outputFormat === 'json') {
    body.response_format = { type: 'json_object' }
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal,
  })

  if (!response.ok) {
    const err = await (response.json().catch(() => ({ error: { message: response.statusText } })) as Promise<{ error?: { message?: string } }>)
    const error: any = new Error(err?.error?.message || response.statusText)
    error.status = response.status
    throw error
  }

  const data = await response.json() as any
  const tokensUsed = data.usage?.total_tokens || 0
  const rate = model.costPer1MTokens ?? priceFor(model.apiModelName)
  const costUsd = (tokensUsed / 1_000_000) * rate

  return {
    output: data.choices[0].message.content,
    tokens_used: tokensUsed,
    cost_usd: costUsd,
  }
}

// ============================================================
// Anthropic Caller
// ============================================================

async function callAnthropic(
  apiKey: string,
  model: AIRegistryEntry,
  prompt: string,
  signal: AbortSignal
): Promise<{ output: string; tokens_used: number; cost_usd: number }> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: model.apiModelName,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal,
  })

  if (!response.ok) {
    const err = await (response.json().catch(() => ({ error: { message: response.statusText } })) as Promise<{ error?: { message?: string } }>)
    const error: any = new Error(err?.error?.message || response.statusText)
    error.status = response.status
    throw error
  }

  const data = await response.json() as any
  const tokensUsed = data.usage?.input_tokens + data.usage?.output_tokens || 0
  const costUsd = (tokensUsed / 1_000_000) * 15 // Claude Opus rate

  return {
    output: data.content[0].text,
    tokens_used: tokensUsed,
    cost_usd: costUsd,
  }
}

// ============================================================
// Gemini Caller
// ============================================================

async function callGemini(
  apiKey: string,
  model: AIRegistryEntry,
  prompt: string,
  signal: AbortSignal
): Promise<{ output: string; tokens_used: number; cost_usd: number }> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1/models/${model.apiModelName}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 4096, temperature: 0.7 },
      }),
      signal,
    }
  )

  if (!response.ok) {
    const error: any = new Error(response.statusText)
    error.status = response.status
    throw error
  }

  const data = await response.json() as any
  return {
    output: data.candidates[0].content.parts[0].text,
    tokens_used: 0,
    cost_usd: 0,
  }
}

// ============================================================
// Fal.ai (FLUX) Caller
// ============================================================

async function callFal(
  apiKey: string,
  model: AIRegistryEntry,
  prompt: string,
  signal: AbortSignal
): Promise<{ output: string; tokens_used: number; cost_usd: number }> {
  // For image generation, prompt is sent differently
  if (model.id.includes('flux')) {
    const response = await fetch('https://queue.fal.run/fal-ai/flux-pro', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Key ${apiKey}`,
      },
      body: JSON.stringify({
        prompt,
        image_size: { width: 1024, height: 1024 },
      }),
      signal,
    })

    if (!response.ok) {
      const error: any = new Error(response.statusText)
      error.status = response.status
      throw error
    }

    const data = await response.json() as any
    return {
      output: data.images[0].url,
      tokens_used: 0,
      cost_usd: 0,
    }
  }

  throw new Error(`Unhandled fal.ai model: ${model.id}`)
}

// ============================================================
// HuggingFace Caller
// ============================================================

async function callHuggingFace(
  apiKey: string,
  model: AIRegistryEntry,
  prompt: string,
  signal: AbortSignal
): Promise<{ output: string; tokens_used: number; cost_usd: number }> {
  const response = await fetch(
    `https://api-inference.huggingface.co/models/${model.apiModelName}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ inputs: prompt }),
      signal,
    }
  )

  if (!response.ok) {
    const error: any = new Error(response.statusText)
    error.status = response.status
    throw error
  }

  const data = await response.json() as any
  const output = Array.isArray(data) ? data[0].generated_text : data

  return {
    output: typeof output === 'string' ? output : JSON.stringify(output),
    tokens_used: 0,
    cost_usd: 0,
  }
}

// ============================================================
// Tavily Search Caller
// ============================================================

async function callTavily(
  apiKey: string,
  prompt: string,
  signal: AbortSignal
): Promise<{ output: string; tokens_used: number; cost_usd: number }> {
  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      api_key: apiKey,
      query: prompt,
      search_depth: 'advanced',
      max_results: 10,
      include_answer: true,
      include_raw_content: false,
    }),
    signal,
  })

  if (!response.ok) {
    const error: any = new Error(response.statusText)
    error.status = response.status
    throw error
  }

  const data = await response.json() as any

  return {
    output: JSON.stringify({
      answer: data.answer,
      results: data.results.map((r: any) => ({
        title: r.title,
        url: r.url,
        content: r.content,
      })),
    }),
    tokens_used: 0,
    cost_usd: 0,
  }
}

// ============================================================
// Exa Search Caller
// ============================================================

async function callExa(
  apiKey: string,
  prompt: string,
  signal: AbortSignal
): Promise<{ output: string; tokens_used: number; cost_usd: number }> {
  const response = await fetch('https://api.exa.ai/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      query: prompt,
      numResults: 10,
      contents: { text: true },
    }),
    signal,
  })

  if (!response.ok) {
    const error: any = new Error(response.statusText)
    error.status = response.status
    throw error
  }

  const data = await response.json() as any

  return {
    output: JSON.stringify({
      results: data.results.map((r: any) => ({
        title: r.title,
        url: r.url,
        content: r.text,
      })),
    }),
    tokens_used: 0,
    cost_usd: 0,
  }
}

// ============================================================
// SerpAPI Caller
// ============================================================

async function callSerpAPI(
  apiKey: string,
  prompt: string,
  signal: AbortSignal
): Promise<{ output: string; tokens_used: number; cost_usd: number }> {
  const params = new URLSearchParams({
    q: prompt,
    api_key: apiKey,
    engine: 'google',
  })

  const response = await fetch(`https://serpapi.com/search?${params.toString()}`, {
    signal,
  })

  if (!response.ok) {
    const error: any = new Error(response.statusText)
    error.status = response.status
    throw error
  }

  const data = await response.json() as any
  const results = data.organic_results?.slice(0, 10) || []

  return {
    output: JSON.stringify({
      results: results.map((r: any) => ({
        title: r.title,
        url: r.link,
        snippet: r.snippet,
      })),
    }),
    tokens_used: 0,
    cost_usd: 0.05, // SerpAPI cost per search
  }
}

// ============================================================
// Helper Functions
// ============================================================

// ============================================================
// Cost guardrail + per-provider ON/OFF helpers (KV-backed)
// ============================================================

function todayKey(): string {
  return `ai_spend:${new Date().toISOString().slice(0, 10)}`
}

// Blended $/1M tokens estimate for paid models that don't carry an explicit
// price, so the cost meter + daily cap have something to count.
function priceFor(apiModelName?: string): number {
  const m = (apiModelName || '').toLowerCase()
  if (m.includes('gpt-4o-mini')) return 0.3
  if (m.includes('gpt')) return 5
  if (m.includes('opus')) return 30
  if (m.includes('claude')) return 6
  if (m.includes('gemini')) return 3.5
  if (m.includes('sonar')) return 1
  if (m.includes('mistral')) return 2
  return 0
}

export async function getSpendToday(env: Env): Promise<number> {
  if (!env.CONFIG) return 0
  const v = await env.CONFIG.get(todayKey())
  return v ? Number(v) || 0 : 0
}

export async function getDailyCap(env: Env): Promise<number> {
  if (!env.CONFIG) return 0
  const v = await env.CONFIG.get('ai_daily_cap_usd')
  return v ? Number(v) || 0 : 0 // 0 = no cap
}

async function addSpend(env: Env, amount: number): Promise<void> {
  if (!env.CONFIG || amount <= 0) return
  const current = await getSpendToday(env)
  // Keep the running daily total for ~48h so the meter survives past midnight.
  await env.CONFIG.put(todayKey(), String(current + amount), { expirationTtl: 172800 })
}

// A provider is paused when KV holds `provider_off:<secretKey>` = 'true'.
async function isProviderDisabled(env: Env, model: AIRegistryEntry): Promise<boolean> {
  if (!env.CONFIG || !model.secretKey) return false
  const v = await env.CONFIG.get(`provider_off:${model.secretKey}`)
  return v === 'true'
}

async function getSecret(env: Env, key: string): Promise<string | null> {
  // Prefer Cloudflare Secrets Store binding when available.
  if (env.SECRETS) {
    try {
      const v = await env.SECRETS.get(key)
      if (v) return v
    } catch { /* fall through */ }
  }
  // Plain worker secrets (wrangler secret put KEY).
  const plain = (env as unknown as Record<string, unknown>)[key]
  if (typeof plain === 'string' && plain.length > 0) return plain
  // Keys added from the dashboard are stored in KV as secret:<KEY>.
  if (env.CONFIG) {
    try {
      const v = await env.CONFIG.get(`secret:${key}`)
      if (v) return v
    } catch { /* fall through */ }
  }
  return null
}

// Cost per 1M tokens lookup (reserved for future per-model pricing refinement)
export const COST_PER_1M: Record<string, number> = {
  'deepseek-chat': 0.27,
  'deepseek-reasoner': 0.55,
  'Qwen/Qwen2.5-72B-Instruct': 0.20,
  'Qwen/Qwen2.5-7B-Instruct': 0.05,
}
