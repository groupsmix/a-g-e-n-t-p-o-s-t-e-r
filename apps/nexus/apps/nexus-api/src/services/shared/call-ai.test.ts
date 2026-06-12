import { describe, it, expect, vi, beforeEach } from 'vitest'
import { callAI } from './call-ai'

// ============================================================
// T1.3: call-ai.ts retry semantics tests
// ============================================================

function makeEnv(fetchImpl: () => Promise<any>) {
  const run = vi.fn().mockResolvedValue(undefined)
  const bind = vi.fn(() => ({ run }))
  const prepare = vi.fn(() => ({ bind }))
  return {
    AI_WORKER: { fetch: vi.fn(fetchImpl) },
    DB: { prepare },
    CONFIG: {},
  } as any
}

function makeOkResponse(body: object) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function makeErrorResponse(body: object, status = 500) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('callAI — T1.3 retry semantics', () => {
  beforeEach(() => {
    vi.useRealTimers()
  })

  it('returns the worker result on success', async () => {
    const env = makeEnv(() =>
      Promise.resolve(makeOkResponse({
        output: 'hello',
        model_used: 'deepseek-v3',
        models_tried: ['deepseek-v3'],
        tokens_used: 42,
        cost_usd: 0.001,
        attempts: [{ model: 'deepseek-v3', provider: 'deepseek', latencyMs: 10, status: 'success', tokensIn: 10, tokensOut: 32 }],
      }))
    )
    const res = await callAI(env, 'test prompt', { taskType: 'generate_long_form' })
    expect(res.output).toBe('hello')
    expect(res.model_used).toBe('deepseek-v3')
    expect(env.AI_WORKER.fetch).toHaveBeenCalledTimes(1)
    expect(env.DB.prepare).toHaveBeenCalled()
  })

  it('does NOT retry when worker returns "All AI models failed"', async () => {
    const env = makeEnv(() =>
      Promise.resolve(makeErrorResponse({ error: 'All AI models failed', taskType: 'generate_long_form' }, 500))
    )
    await expect(callAI(env, 'test prompt', { taskType: 'generate_long_form', retries: 3 }))
      .rejects.toThrow('All AI models failed')
    // Only 1 attempt despite retries: 3
    expect(env.AI_WORKER.fetch).toHaveBeenCalledTimes(1)
  })

  it('does NOT retry on any structured worker JSON error body', async () => {
    const env = makeEnv(() =>
      Promise.resolve(makeErrorResponse({ error: 'Invalid JSON and repair failed', errorClass: 'BadOutputError' }, 500))
    )
    await expect(callAI(env, 'test prompt', { taskType: 'generate_long_form', retries: 3 }))
      .rejects.toThrow('Invalid JSON and repair failed')
    expect(env.AI_WORKER.fetch).toHaveBeenCalledTimes(1)
  })

  it('does NOT retry on a 200 response (success path)', async () => {
    const env = makeEnv(() =>
      Promise.resolve(makeOkResponse({
        output: 'result',
        model_used: 'claude',
        models_tried: ['claude'],
        tokens_used: 10,
        cost_usd: 0,
      }))
    )
    await callAI(env, 'test', { retries: 3 })
    expect(env.AI_WORKER.fetch).toHaveBeenCalledTimes(1)
  })

  it('retries on transport error (binding threw) up to retries limit', async () => {
    let calls = 0
    const env = makeEnv(() => {
      calls++
      if (calls < 3) return Promise.reject(new Error('network reset'))
      return Promise.resolve(makeOkResponse({ output: 'recovered', model_used: 'm', models_tried: ['m'], tokens_used: 0, cost_usd: 0 }))
    })
    const res = await callAI(env, 'test', { retries: 3, timeoutMs: 5000 })
    expect(res.output).toBe('recovered')
    expect(calls).toBe(3)
  })

  it('retries on infrastructure 5xx (not "All AI models failed") up to limit', async () => {
    let calls = 0
    const env = makeEnv(() => {
      calls++
      if (calls === 1) return Promise.resolve(makeErrorResponse({ error: 'Worker crashed' }, 503))
      return Promise.resolve(makeOkResponse({ output: 'ok', model_used: 'm', models_tried: ['m'], tokens_used: 0, cost_usd: 0 }))
    })
    const res = await callAI(env, 'test', { retries: 2, timeoutMs: 5000 })
    expect(res.output).toBe('ok')
    expect(calls).toBe(2)
  })

  it('throws after exhausting all transport retries', async () => {
    const env = makeEnv(() => Promise.reject(new Error('network reset')))
    await expect(callAI(env, 'test', { retries: 2, timeoutMs: 1000 })).rejects.toThrow('network reset')
    expect(env.AI_WORKER.fetch).toHaveBeenCalledTimes(2)
  })

  it('uses executionCtx.waitUntil for ledger writes when provided', async () => {
    const env = makeEnv(() =>
      Promise.resolve(makeOkResponse({
        output: 'hello',
        model_used: 'deepseek-v3',
        models_tried: ['deepseek-v3'],
        tokens_used: 42,
        cost_usd: 0.001,
        attempts: [{ model: 'deepseek-v3', provider: 'deepseek', latencyMs: 10, status: 'success', tokensIn: 10, tokensOut: 32 }],
      }))
    )
    const waitUntil = vi.fn()
    await callAI(env, 'test prompt', {
      taskType: 'generate_long_form',
      executionCtx: { waitUntil },
      caller: 'unit-test',
    })
    expect(waitUntil).toHaveBeenCalledOnce()
  })
})
