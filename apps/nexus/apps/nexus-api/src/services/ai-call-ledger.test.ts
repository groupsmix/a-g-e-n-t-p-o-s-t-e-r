import { describe, expect, it, vi } from 'vitest'
import { scheduleAICallLedgerWrite, tokensFromAttempts, writeAICallLedger } from './ai-call-ledger'

describe('ai-call-ledger', () => {
  it('sums token usage from attempt logs', () => {
    expect(
      tokensFromAttempts([
        { model: 'a', provider: 'openai', latencyMs: 10, status: 'success', tokensIn: 10, tokensOut: 20 },
        { model: 'b', provider: 'anthropic', latencyMs: 20, status: 'failed', tokensIn: 1, tokensOut: 2 },
      ]),
    ).toEqual({ tokensIn: 11, tokensOut: 22 })
  })

  it('writes a ledger row with serialized attempts and models', async () => {
    const run = vi.fn().mockResolvedValue(undefined)
    const bind = vi.fn(() => ({ run }))
    const prepare = vi.fn(() => ({ bind }))
    const env = { DB: { prepare } } as any

    await writeAICallLedger(env, {
      taskType: 'generate_long_form',
      caller: 'workflow-engine',
      workflowId: 'wf-1',
      latencyMs: 1234,
      ok: true,
      response: {
        model_used: 'deepseek-v3',
        source: 'model',
        models_tried: ['claude', 'deepseek-v3'],
        cost_usd: 0.42,
        attempts: [
          { model: 'claude', provider: 'anthropic', latencyMs: 500, status: 'failed', errorClass: 'RateLimitError' },
          { model: 'deepseek-v3', provider: 'deepseek', latencyMs: 734, status: 'success', tokensIn: 20, tokensOut: 40, costUsd: 0.42 },
        ],
      },
    })

    expect(prepare).toHaveBeenCalledOnce()
    expect(bind).toHaveBeenCalledOnce()
    const args = (bind.mock.calls[0] ?? []) as unknown[]
    expect(args[2]).toBe('generate_long_form')
    expect(args[3]).toBe('deepseek-v3')
    expect(args[5]).toBe(JSON.stringify(['claude', 'deepseek-v3']))
    expect(args[7]).toBe(20)
    expect(args[8]).toBe(40)
    expect(args[10]).toBe(1234)
    expect(args[11]).toBe('workflow-engine')
    expect(args[12]).toBe('wf-1')
    expect(args[13]).toBe(1)
    expect(run).toHaveBeenCalledOnce()
  })

  it('uses waitUntil when an execution context is available', () => {
    const waitUntil = vi.fn()
    const executionCtx = { waitUntil }
    const env = { DB: { prepare: vi.fn(() => ({ bind: vi.fn(() => ({ run: vi.fn().mockResolvedValue(undefined) })) })) } } as any

    scheduleAICallLedgerWrite(env, executionCtx, {
      taskType: 'generate_short_copy',
      latencyMs: 1,
      ok: false,
      errorMessage: 'boom',
    })

    expect(waitUntil).toHaveBeenCalledOnce()
  })
})
