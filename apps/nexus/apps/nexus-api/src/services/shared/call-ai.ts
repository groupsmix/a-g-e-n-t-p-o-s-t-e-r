import type { Env } from '../../env'
import type { AIRunTaskResponse } from '@posteragent/types/nexus'
import { createLogger } from '@posteragent/logger/workers'
import { safeJson } from './json-parse'
import { z } from 'zod'

const logger = createLogger({ service: 'nexus-api', module: 'call-ai' })

export class AIUnavailableError extends Error {
  constructor(message = 'All AI providers are unavailable, offline fallback not allowed') {
    super(message)
    this.name = 'AIUnavailableError'
  }
}

/**
 * Shared AI caller — single implementation used by workflow-engine,
 * deliverable, agent, manager, autopilot, schedules, and marketing.
 *
 * Sends a task to the nexus-ai service-binding worker.
 *
 * ### Retry semantics (T1.3 fix)
 * The nexus-ai worker already runs a full failover chain internally (tries every
 * configured model before returning). Retrying the entire worker call therefore
 * produces: N retries × M models = O(N*M) provider calls, stacked latency, and
 * duplicate spend. This is wrong.
 *
 * Correct approach:
 *   - Default retries = 1 (single attempt; worker handles internal failover).
 *   - Retry ONLY on transport-level errors (service-binding threw, network
 *     reset, HTTP 5xx from the worker *infrastructure* itself — not from
 *     `{error: 'All AI models failed'}` which is a logical exhaustion).
 *   - One hard deadline = timeoutMs + 10s grace, applied once.
 *   - Never retry on "All AI models failed" — the chain is already exhausted.
 */
export async function callAI(
  env: Env,
  prompt: string,
  opts: {
    taskType?: string
    outputFormat?: 'text' | 'json'
    timeoutMs?: number
    /** Number of transport-level retries (default: 1 = no retry). */
    retries?: number
    /** Whether to allow offline fallback templates (default: false). */
    allowOffline?: boolean
    /** Models to exclude from failover chain. */
    excludeModelIds?: string[]
  } = {},
): Promise<AIRunTaskResponse> {
  const taskType = opts.taskType ?? 'generate_long_form'
  const outputFormat = opts.outputFormat ?? 'json'
  const timeoutMs = opts.timeoutMs ?? 60000
  const allowOffline = opts.allowOffline ?? false
  const excludeModelIds = opts.excludeModelIds
  // Default to 1 (single attempt). Callers that need transport-retry can opt in.
  const maxAttempts = Math.max(1, opts.retries ?? 1)
  // One hard deadline for the whole call — no per-attempt stacking.
  const deadlineMs = timeoutMs + 10000

  let lastErr: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const ctl = new AbortController()
    const deadlineTimer = setTimeout(() => ctl.abort(), deadlineMs)

    try {
      const req = new Request('https://nexus-ai/task', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ taskType, prompt, outputFormat, timeoutMs, excludeModelIds }),
        signal: ctl.signal,
      })

      const res = await env.AI_WORKER.fetch(req)
      const body = (await res.json()) as AIRunTaskResponse & { error?: string }

      if (!res.ok) {
        // Worker returned a structured error body.
        const msg = body?.error ?? res.statusText

        // "All AI models failed" = the internal chain is exhausted.
        // Retrying will just repeat the same exhausted chain — pure waste.
        if (msg.includes('All AI models failed')) {
          logger.warn('AI chain exhausted — not retrying', { taskType, models_tried: body?.models_tried })
          throw Object.assign(new Error(msg), { isChainExhausted: true })
        }

        // Worker infrastructure error (e.g. 503 deploy issue) — worth one retry.
        throw new Error(`AI worker ${taskType} failed: ${res.status} ${msg}`)
      }

      if (body.source === 'offline' && !allowOffline) {
        logger.error('AI call returned offline template, but offline is not allowed', undefined, { taskType })
        throw new AIUnavailableError()
      }

      logger.info('AI call succeeded', {
        taskType,
        model_used: body.model_used,
        tokens_used: body.tokens_used,
        cost_usd: body.cost_usd,
        models_tried: body.models_tried,
        attempt,
      })

      return body
    } catch (err: any) {
      clearTimeout(deadlineTimer)
      lastErr = err

      // Hard deadline fired, AIUnavailableError or chain already exhausted — never retry.
      if (err?.name === 'AbortError' || err?.isChainExhausted || err instanceof AIUnavailableError) break

      // Only retry on transport errors, not logical failures.
      if (attempt < maxAttempts) {
        const backoffMs = 400 * attempt
        logger.warn('AI transport error, will retry', { taskType, attempt, maxAttempts, backoffMs, error: err?.message })
        await new Promise((r) => setTimeout(r, backoffMs))
      }
      continue
    } finally {
      clearTimeout(deadlineTimer)
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}

/**
 * Simplified wrapper that returns just the output string. Used by routes
 * that don't need model metadata (agent, manager, marketing, schedules).
 * Logs model metadata internally so it's not silently swallowed.
 */
export async function callAISimple(
  env: Env,
  prompt: string,
  opts: {
    taskType?: string
    outputFormat?: 'text' | 'json'
    timeoutMs?: number
    retries?: number
  } = {},
): Promise<string> {
  const res = await callAI(env, prompt, opts)
  return res.output ?? ''
}

/**
 * Call AI, parse JSON response, and validate against a Zod schema.
 * If validation fails, performs exactly one repair pass with the Zod validation error message.
 */
export async function callAIJson<T>(
  env: Env,
  prompt: string,
  zodSchema: z.ZodSchema<T>,
  opts: {
    taskType?: string
    timeoutMs?: number
    retries?: number
    excludeModelIds?: string[]
    meta?: { response?: AIRunTaskResponse }
  } = {},
): Promise<T> {
  const taskType = opts.taskType ?? 'generate_long_form'
  const timeoutMs = opts.timeoutMs ?? 60000
  const retries = opts.retries ?? 1

  const res = await callAI(env, prompt, {
    ...opts,
    taskType,
    outputFormat: 'json',
    timeoutMs,
    retries,
    allowOffline: false, // JSON calls should never allow offline fallback templates
  })

  if (opts.meta) {
    opts.meta.response = res
  }

  let parsed = safeJson<T>(res.output)
  if (parsed === null) {
    throw new Error(`Failed to parse AI output as JSON: ${res.output}`)
  }

  const validation = zodSchema.safeParse(parsed)
  if (validation.success) {
    return validation.data
  }

  const zodErrorMsg = validation.error.message
  logger.warn('Zod validation failed, attempting repair', { taskType, zodError: zodErrorMsg })

  const repairPrompt = `${prompt}\n\nYour previous response was invalid. Zod validation error:\n${zodErrorMsg}\n\nReturn ONLY a valid JSON object matching the requested schema.`

  const repairRes = await callAI(env, repairPrompt, {
    ...opts,
    taskType,
    outputFormat: 'json',
    timeoutMs,
    retries,
    allowOffline: false,
  })

  if (opts.meta) {
    opts.meta.response = repairRes
  }

  const repairedParsed = safeJson<T>(repairRes.output)
  if (repairedParsed !== null) {
    const secondValidation = zodSchema.safeParse(repairedParsed)
    if (secondValidation.success) {
      return secondValidation.data
    }
  }

  // If still invalid, throw ZodError or standard Error
  return zodSchema.parse(repairedParsed)
}
