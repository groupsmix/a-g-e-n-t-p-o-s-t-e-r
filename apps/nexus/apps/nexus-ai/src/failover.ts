// ============================================================
// AI Failover Engine
// ============================================================
// Core failover logic with automatic model switching on failure.

import { AI_REGISTRY } from './registry'
import { SEARCH_REGISTRY } from './search-registry'
import { offlineGenerate } from './offline'
import type { AIRegistryEntry, TaskType, FailoverResult, FailoverOptions, AIStatusCache } from './types'
import { createLogger } from '@posteragent/logger/workers'

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
  const { timeoutMs = 90000, outputFormat = 'text', excludeModelIds } = options

  if (['research_market', 'research_keywords', 'research_competitors', 'trend_analysis'].includes(taskType)) {
    const searchResult = await runSearchWithFailover(taskType, prompt, env, options)
    if (searchResult) return { ...searchResult, source: 'model' }
  }

  const models = AI_REGISTRY[taskType] || []
  const tried: string[] = []

  // Cost guardrail: how much we've already spent today on paid models.
  const cap = await getDailyCap(env)
  const spentToday = await getSpendToday(env)
  const capReached = cap > 0 && spentToday >= cap

  for (const model of models) {
    if (excludeModelIds && excludeModelIds.includes(model.id)) {
      logger.info('Skipping model — excluded by caller', { model: model.name, taskType })
      continue
    }
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
      let result = await callModelWithTimeout(
        model,
        apiKey,
        prompt,
        timeoutMs,
        outputFormat,
        env
      )

      if (outputFormat === 'json') {
        const parsed = parseSafeJson(result.output)
        if (parsed === null) {
          logger.warn('Invalid JSON from model, attempting repair', { model: model.name, taskType })
          const cheapModel = await getCheapestConfiguredModel(env, models)
          if (cheapModel) {
            const cheapApiKey = cheapModel.secretKey ? await getSecret(env, cheapModel.secretKey) : 'local'
            if (cheapApiKey) {
              try {
                const repairPrompt = `Return ONLY valid JSON equivalent of: ${result.output}`
                const repairResult = await callModelWithTimeout(
                  cheapModel,
                  cheapApiKey,
                  repairPrompt,
                  timeoutMs,
                  'json',
                  env
                )
                if (cheapModel.isFree === false && repairResult.cost_usd) {
                  await addSpend(env, repairResult.cost_usd)
                }
                const repairedParsed = parseSafeJson(repairResult.output)
                if (repairedParsed !== null) {
                  logger.info('Repair succeeded', { repairModel: cheapModel.name, taskType })
                  result = {
                    output: repairResult.output,
                    tokens_used: result.tokens_used + repairResult.tokens_used,
                    cost_usd: (result.cost_usd || 0) + (repairResult.cost_usd || 0),
                  }
                } else {
                  throw new Error('Repaired output is still invalid JSON')
                }
              } catch (repairErr: any) {
                logger.error('Repair failed', repairErr, { model: model.name, taskType })
                throw new Error(`Invalid JSON and repair failed: ${repairErr.message}`)
              }
            } else {
              throw new Error('Invalid JSON and repair could not find cheap model API key')
            }
          } else {
            throw new Error('Invalid JSON and no cheap configured model available for repair')
          }
        }
      }

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
        source: 'model',
      }
    } catch (error: any) {
      const statusCode = error.status || error.statusCode || 0
      const errorMsg = error.message || 'Unknown error'

      if (statusCode === 429 || errorMsg.includes('rate_limit')) {
        // Use provider-supplied reset time; fall back to 15 min default.
        const resetAt = clampReset(error.resetAt ?? (Date.now() + 900_000))
        const ttl = Math.ceil((resetAt - Date.now()) / 1000) + 60
        const statusPayload = JSON.stringify({ type: 'rate_limited', reset_at: resetAt, hit_at: Date.now() })

        // Per-model status
        await env.CONFIG.put(statusKey, statusPayload, { expirationTtl: ttl })

        // Per-provider status (account-wide limits share the same key)
        if (model.secretKey) {
          const providerKey = `ai_status:provider:${model.secretKey}`
          await env.CONFIG.put(providerKey, statusPayload, { expirationTtl: ttl })
        }

        logger.warn('Model rate limited', { model: model.name, taskType, resetAt, source: error.resetSource ?? 'default' })

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
        // Invalid key — skip for 24h until key changes
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
    source: 'offline',
  }
}

// ============================================================
export async function runSearchWithFailover(
  taskType: TaskType,
  prompt: string,
  env: Env,
  options: FailoverOptions = {}
): Promise<FailoverResult | null> {
  const { timeoutMs = 90000 } = options
  const models = SEARCH_REGISTRY[taskType] || []
  const tried: string[] = []

  for (const model of models) {
    const apiKey = model.secretKey ? await getSecret(env, model.secretKey) : null
    if (!apiKey) continue

    tried.push(model.id)
    logger.info('Trying search provider', { model: model.name, taskType })

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)

    try {
      let result: { output: string; tokens_used: number; cost_usd: number }

      if (model.provider === 'tavily') {
        result = await callTavily(apiKey, prompt, controller.signal)
      } else if (model.provider === 'exa') {
        result = await callExa(apiKey, prompt, controller.signal)
      } else if (model.provider === 'serpapi') {
        result = await callSerpAPI(apiKey, prompt, controller.signal)
      } else if (model.provider === 'dataforseo') {
        result = await callDataForSEO(apiKey, prompt, controller.signal)
      } else {
        throw new Error(`Unknown search provider: ${model.provider}`)
      }

      logger.info('Search succeeded', { model: model.name, taskType })
      if (!model.isFree && result.cost_usd) await addSpend(env, result.cost_usd)

      return {
        output: result.output,
        model_used: model.id,
        models_tried: tried,
        tokens_used: result.tokens_used,
        cost_usd: result.cost_usd,
      }
    } catch (error: any) {
      logger.error('Search provider error', new Error(error.message), { model: model.name, taskType })
      continue
    } finally {
      clearTimeout(timeout)
    }
  }
  return null
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
        { id: 'groq-llama-3.3-70b', name: 'llama-3.3-70b-versatile', provider: 'groq', secretKey: 'GROQ_API_KEY', rank: 99, isFree: true, why: 'Universal free fallback', apiModelName: 'llama-3.3-70b-versatile', costPer1kIn: 0, costPer1kOut: 0, maxOutputTokens: 8192, supportsJsonMode: true } as AIRegistryEntry,
        prompt,
        outputFormat,
        controller.signal
      )
      logger.info('Universal fallback succeeded', { model: 'groq-llama-3.3-70b' })
      return { output: result.output, model_used: 'groq-llama-3.3-70b', models_tried: tried, tokens_used: result.tokens_used, cost_usd: result.cost_usd, source: 'universal' }
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
        return { output: out.response, model_used: 'cloudflare-workers-ai-llama', models_tried: tried, tokens_used: 0, cost_usd: 0, source: 'universal' }
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
        result = await callAnthropic(apiKey, model, prompt, outputFormat, controller.signal)
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
        result = await callGemini(apiKey, model, prompt, outputFormat, controller.signal)
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

  if (outputFormat === 'json' && model.supportsJsonMode) {
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
    // Attach reset time from standard rate-limit headers so the caller can
    // write an accurate cooldown into KV instead of guessing 1h.
    const { resetAt, source } = parseRateLimitReset(response.headers)
    error.resetAt = resetAt
    error.resetSource = source
    throw error
  }

  const data = await response.json() as any
  const tokensUsed = data.usage?.total_tokens || 0
  // Use per-token pricing from registry; fall back to blended estimate.
  const ratePer1k = model.costPer1kOut ?? (priceFor(model.apiModelName) / 1000)
  const costUsd = tokensUsed * ratePer1k / 1000

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
  outputFormat: string,
  signal: AbortSignal
): Promise<{ output: string; tokens_used: number; cost_usd: number }> {
  const messages: any[] = [{ role: 'user', content: prompt }]
  if (outputFormat === 'json' && model.supportsJsonMode) {
    messages.push({ role: 'assistant', content: '{' })
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: model.apiModelName,
      max_tokens: model.maxOutputTokens || 4096,
      messages,
    }),
    signal,
  })

  if (!response.ok) {
    const err = await (response.json().catch(() => ({ error: { message: response.statusText } })) as Promise<{ error?: { message?: string } }>)
    const error: any = new Error(err?.error?.message || response.statusText)
    error.status = response.status
    // Anthropic rate-limit headers: anthropic-ratelimit-requests-reset, anthropic-ratelimit-tokens-reset
    // These are ISO-8601 timestamps.
    const requestsReset = response.headers.get('anthropic-ratelimit-requests-reset')
    const tokensReset = response.headers.get('anthropic-ratelimit-tokens-reset')
    const headerTs = requestsReset || tokensReset
    if (headerTs) {
      const ts = Date.parse(headerTs)
      if (!isNaN(ts)) {
        error.resetAt = ts
        error.resetSource = 'anthropic-header'
      }
    } else {
      const { resetAt, source } = parseRateLimitReset(response.headers)
      error.resetAt = resetAt
      error.resetSource = source
    }
    throw error
  }

  const data = await response.json() as any
  const inputTokens = data.usage?.input_tokens || 0
  const outputTokens = data.usage?.output_tokens || 0
  const tokensUsed = inputTokens + outputTokens
  const costUsd = (inputTokens / 1000) * (model.costPer1kIn ?? 0.003) + (outputTokens / 1000) * (model.costPer1kOut ?? 0.015)

  const rawText = data.content[0].text
  const output = (outputFormat === 'json' && model.supportsJsonMode) ? '{' + rawText : rawText

  return {
    output,
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
  outputFormat: string,
  signal: AbortSignal
): Promise<{ output: string; tokens_used: number; cost_usd: number }> {
  const generationConfig: Record<string, unknown> = {
    maxOutputTokens: model.maxOutputTokens || 4096,
    temperature: 0.7,
  }
  if (outputFormat === 'json' && model.supportsJsonMode) {
    generationConfig.responseMimeType = 'application/json'
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1/models/${model.apiModelName}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig,
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
// DataForSEO Caller
// ============================================================

async function callDataForSEO(
  apiKey: string,
  prompt: string,
  signal: AbortSignal
): Promise<{ output: string; tokens_used: number; cost_usd: number }> {
  // Simplified mock-friendly caller since DataForSEO has complex endpoints
  const [login, password] = apiKey.split(':')
  const auth = btoa(`${login || apiKey}:${password || ''}`)

  const response = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/advanced', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${auth}`,
    },
    body: JSON.stringify([{ keyword: prompt, language_code: 'en', location_code: 2840 }]),
    signal,
  })

  if (!response.ok) {
    const error: any = new Error(response.statusText)
    error.status = response.status
    throw error
  }

  const data = await response.json() as any
  const items = data.tasks?.[0]?.result?.[0]?.items?.slice(0, 10) || []

  return {
    output: JSON.stringify({
      results: items.map((r: any) => ({
        title: r.title,
        url: r.url,
        description: r.description,
      })),
    }),
    tokens_used: 0,
    cost_usd: 0.001,
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

// Parse JSON safely using safeJson-like extraction logic.
export function parseSafeJson(raw: string): any {
  const trimmed = raw.trim()
  if (!trimmed) return null

  // Fast path: clean JSON.
  try {
    return JSON.parse(trimmed)
  } catch {
    /* fall through */
  }

  // Strip ```json ... ``` fences and retry.
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim())
    } catch {
      /* fall through */
    }
  }

  // Extract the first balanced { … } object.
  const candidate = fenced ? fenced[1] : trimmed
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(candidate.slice(start, end + 1))
    } catch {
      /* fall through */
    }
  }

  return null
}

// Helper to find the cheapest configured model for the current task type.
export async function getCheapestConfiguredModel(env: Env, models: AIRegistryEntry[]): Promise<AIRegistryEntry | null> {
  const configured: AIRegistryEntry[] = []
  for (const m of models) {
    if (await isProviderDisabled(env, m)) continue
    const apiKey = m.secretKey ? await getSecret(env, m.secretKey) : 'local'
    if (!apiKey) continue

    if (env.CONFIG) {
      const statusKey = `ai_status:${m.id}`
      const statusRaw = await env.CONFIG.get(statusKey, 'json')
      if (statusRaw) {
        const status = statusRaw as AIStatusCache
        if (Date.now() < status.reset_at) continue
      }
    }

    configured.push(m)
  }

  if (configured.length === 0) return null

  return configured.sort((a, b) => {
    if (a.isFree && !b.isFree) return -1
    if (!a.isFree && b.isFree) return 1
    const costA = (a.costPer1kIn ?? 0) + (a.costPer1kOut ?? 0)
    const costB = (b.costPer1kIn ?? 0) + (b.costPer1kOut ?? 0)
    return costA - costB
  })[0]
}

// Clamp a rate-limit reset timestamp to [now+30s, now+6h].
export function clampReset(ts: number): number {
  const now = Date.now()
  return Math.max(now + 30_000, Math.min(now + 6 * 3_600_000, ts))
}

/**
 * Parse standard rate-limit headers from a provider response.
 * Handles:
 *   - Retry-After: <seconds> or <HTTP-date>
 *   - x-ratelimit-reset-requests: <ISO-8601>
 *   - x-ratelimit-reset-tokens: <ISO-8601>
 * Returns {resetAt: timestamp, source: string} — null values mean "not found".
 */
export function parseRateLimitReset(headers: Headers): { resetAt: number | null; source: string | null } {
  // 1. Retry-After
  const retryAfter = headers.get('retry-after')
  if (retryAfter) {
    const secs = Number(retryAfter)
    if (!isNaN(secs) && secs > 0) {
      return { resetAt: Date.now() + secs * 1000, source: 'retry-after-seconds' }
    }
    const ts = Date.parse(retryAfter)
    if (!isNaN(ts)) {
      return { resetAt: ts, source: 'retry-after-date' }
    }
  }

  // 2. OpenAI / Groq / standard: x-ratelimit-reset-requests (ISO-8601 or seconds)
  for (const hdr of ['x-ratelimit-reset-requests', 'x-ratelimit-reset-tokens', 'x-ratelimit-reset']) {
    const val = headers.get(hdr)
    if (!val) continue
    // Could be "21s", "1500ms", or ISO timestamp
    const msMatch = val.match(/^(\d+)ms$/)
    if (msMatch) return { resetAt: Date.now() + Number(msMatch[1]), source: hdr }
    const sMatch = val.match(/^(\d+)s$/)
    if (sMatch) return { resetAt: Date.now() + Number(sMatch[1]) * 1000, source: hdr }
    const ts = Date.parse(val)
    if (!isNaN(ts)) return { resetAt: ts, source: hdr }
    // Plain number = unix epoch seconds
    const n = Number(val)
    if (!isNaN(n) && n > 1_000_000) return { resetAt: n * 1000, source: hdr }
  }

  return { resetAt: null, source: null }
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
