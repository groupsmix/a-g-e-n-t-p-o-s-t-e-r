import type { Env } from '../env'
import type { AIAttemptLog, AIRunTaskResponse } from '@posteragent/types/nexus'
import { createLogger } from '@posteragent/logger/workers'

const logger = createLogger({ service: 'nexus-api', module: 'ai-call-ledger' })

export interface WaitUntilLike {
  waitUntil(promise: Promise<unknown>): void
}

export interface AICallLedgerInput {
  taskType: string
  caller?: string
  workflowId?: string
  latencyMs: number
  ok: boolean
  response?: Partial<AIRunTaskResponse>
  errorMessage?: string
}

export function tokensFromAttempts(attempts?: AIAttemptLog[]): { tokensIn: number; tokensOut: number } {
  if (!attempts?.length) {
    return { tokensIn: 0, tokensOut: 0 }
  }

  return attempts.reduce(
    (acc, attempt) => ({
      tokensIn: acc.tokensIn + (attempt.tokensIn ?? 0),
      tokensOut: acc.tokensOut + (attempt.tokensOut ?? 0),
    }),
    { tokensIn: 0, tokensOut: 0 },
  )
}

export async function writeAICallLedger(
  env: Env,
  input: AICallLedgerInput,
): Promise<void> {
  if (!env.DB) return

  const attempts = input.response?.attempts ?? []
  const tokenSummary = tokensFromAttempts(attempts)
  const modelUsed = input.response?.model_used ?? (input.ok ? 'unknown' : null)
  const source = input.response?.source ?? null
  const costUsd = Number(input.response?.cost_usd ?? 0)

  try {
    await env.DB.prepare(
      `INSERT INTO ai_calls (
         id, ts, task_type, model_used, source, models_tried_json, attempts_json,
         tokens_in, tokens_out, cost_usd, latency_ms, caller, workflow_id, ok
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      new Date().toISOString(),
      input.taskType,
      modelUsed,
      source,
      JSON.stringify(input.response?.models_tried ?? []),
      JSON.stringify(
        input.errorMessage && attempts.length === 0
          ? [{ status: 'failed', model: 'unknown', provider: 'unknown', latencyMs: input.latencyMs, errorMessage: input.errorMessage }]
          : attempts,
      ),
      tokenSummary.tokensIn,
      tokenSummary.tokensOut,
      costUsd,
      Math.max(0, Math.round(input.latencyMs)),
      input.caller ?? 'unknown',
      input.workflowId ?? null,
      input.ok ? 1 : 0,
    ).run()
  } catch (error) {
    logger.error('Failed to write ai_calls ledger row', error instanceof Error ? error : new Error(String(error)), {
      taskType: input.taskType,
      caller: input.caller ?? 'unknown',
    })
  }
}

export function scheduleAICallLedgerWrite(
  env: Env,
  executionCtx: WaitUntilLike | undefined,
  input: AICallLedgerInput,
): void {
  const task = writeAICallLedger(env, input)
  if (executionCtx) {
    executionCtx.waitUntil(task)
    return
  }
  void task
}
