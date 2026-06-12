import type { Env } from '../../env'
import type { AIRunTaskResponse } from '@posteragent/types/nexus'
import { createLogger } from '@posteragent/logger/workers'
import { safeJson } from './json-parse'
import { z } from 'zod'
import { scheduleAICallLedgerWrite, type WaitUntilLike } from '../ai-call-ledger'

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
    /** Fire-and-forget context for ledger writes when available. */
    executionCtx?: WaitUntilLike
    /** Logical caller name for observability. */
    caller?: string
    /** Optional workflow run id to join AI calls to workflow traces. */
    workflowId?: string
  } = {},
): Promise<AIRunTaskResponse> {
  const taskType = opts.taskType ?? 'generate_long_form'
  const outputFormat = opts.outputFormat ?? 'json'
  const timeoutMs = opts.timeoutMs ?? 60000
  const allowOffline = opts.allowOffline ?? false
  const excludeModelIds = opts.excludeModelIds
  const executionCtx = opts.executionCtx
  const caller = opts.caller ?? 'unknown'
  const workflowId = opts.workflowId
  // Default to 1 (single attempt). Callers that need transport-retry can opt in.
  const maxAttempts = Math.max(1, opts.retries ?? 1)
  // One hard deadline for the whole call — no per-attempt stacking.
  const deadlineMs = timeoutMs + 10000

  let lastErr: unknown
  const callStartedAt = Date.now()
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const deadlinePromise = new Promise<Response>((_, reject) => {
      setTimeout(() => reject(new Error(`AI worker ${taskType} timed out`)), deadlineMs)
    })

    try {
      const res = await Promise.race([
        env.AI_WORKER.fetch('https://nexus-ai/task', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ taskType, prompt, outputFormat, timeoutMs, excludeModelIds }),
        }),
        deadlinePromise,
      ])
      const contentType = res.headers.get('content-type') || ''
      const body = contentType.includes('application/json')
        ? (await res.json().catch(() => null)) as (AIRunTaskResponse & {
            error?: string
            errorClass?: string
            attempts?: unknown[]
          }) | null
        : null

      if (!res.ok) {
        const msg = body?.error ?? res.statusText
        const isStructuredWorkerError = Boolean(body?.errorClass || body?.attempts?.length)

        // "All AI models failed" = the internal chain is exhausted.
        // Retrying will just repeat the same exhausted chain — pure waste.
        if (msg.includes('All AI models failed')) {
          logger.warn('AI chain exhausted — not retrying', {
            taskType,
            models_tried: body?.models_tried,
            attempts: body?.attempts?.length ?? 0,
          })
          throw Object.assign(new Error(msg), {
            isChainExhausted: true,
            isStructuredWorkerError: true,
            response: body,
          })
        }

        // Any clean JSON worker error body is a logical failure, not transport.
        // Retrying would replay the same worker logic and duplicate latency/spend.
        if (isStructuredWorkerError) {
          logger.warn('AI worker returned structured error — not retrying', {
            taskType,
            status: res.status,
            errorClass: body?.errorClass,
          })
          throw Object.assign(new Error(msg), { isStructuredWorkerError: true, response: body })
        }

        // Worker infrastructure error (e.g. 503 deploy issue) — worth one retry.
        throw new Error(`AI worker ${taskType} failed: ${res.status} ${msg}`)
      }

      if (!body) {
        throw new Error(`AI worker ${taskType} returned a non-JSON success response`)
      }

      if (body.source === 'offline' && !allowOffline) {
        scheduleAICallLedgerWrite(env, executionCtx, {
          taskType,
          caller,
          workflowId,
          latencyMs: Date.now() - callStartedAt,
          ok: false,
          response: body,
          errorMessage: 'Offline fallback returned but caller disallows offline output',
        })
        logger.error('AI call returned offline template, but offline is not allowed', undefined, { taskType })
        throw new AIUnavailableError()
      }

      scheduleAICallLedgerWrite(env, executionCtx, {
        taskType,
        caller,
        workflowId,
        latencyMs: Date.now() - callStartedAt,
        ok: true,
        response: body,
      })
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
      lastErr = err

      // Hard deadline fired, AIUnavailableError, chain exhaustion, or any clean
      // structured worker error — never retry.
      if (/timed out/i.test(err?.message ?? '') || err?.isChainExhausted || err?.isStructuredWorkerError || err instanceof AIUnavailableError) break

      // Only retry on transport errors, not logical failures.
      if (attempt < maxAttempts) {
        const backoffMs = 400 * attempt
        logger.warn('AI transport error, will retry', { taskType, attempt, maxAttempts, backoffMs, error: err?.message })
        await new Promise((r) => setTimeout(r, backoffMs))
      }
      continue
    }
  }

  scheduleAICallLedgerWrite(env, executionCtx, {
    taskType,
    caller,
    workflowId,
    latencyMs: Date.now() - callStartedAt,
    ok: false,
    response: (lastErr as { response?: AIRunTaskResponse } | null)?.response,
    errorMessage: lastErr instanceof Error ? lastErr.message : String(lastErr),
  })
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
    executionCtx?: WaitUntilLike
    caller?: string
    workflowId?: string
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
    executionCtx?: WaitUntilLike
    caller?: string
    workflowId?: string
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
