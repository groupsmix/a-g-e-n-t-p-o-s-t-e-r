import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { runWithFailover, parseRateLimitReset, clampReset } from './failover'

// Mock fetch globally
const fetchMock = vi.fn()
globalThis.fetch = fetchMock

// Mock KV
class MockKV {
  private store = new Map<string, string>()
  async get(key: string, type?: 'json' | 'text') {
    const val = this.store.get(key)
    if (!val) return null
    if (type === 'json') return JSON.parse(val)
    return val
  }
  async put(key: string, value: string, _options?: any) {
    this.store.set(key, value)
  }
  async delete(key: string) {
    this.store.delete(key)
  }
}

describe('Failover Engine', () => {
  let env: any

  beforeEach(() => {
    vi.useFakeTimers()
    fetchMock.mockReset()
    env = {
      CONFIG: new MockKV(),
      AI: {
        run: vi.fn().mockResolvedValue({ response: 'workers-ai-output' })
      },
      // Keys to pass validation
      ANTHROPIC_API_KEY: 'test-anthropic',
      DEEPSEEK_API_KEY: 'test-deepseek',
      SILICONFLOW_API_KEY: 'test-siliconflow',
      GROQ_API_KEY: 'test-groq'
    }
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('advances to next model on 500 error', async () => {
    // Task: research_psychology
    // Models: claude (anthropic), deepseek-r1 (deepseek)
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Internal Server Error', headers: new Headers(), json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, headers: new Headers(), json: async () => ({ choices: [{ message: { content: 'deepseek-success' } }] }) })

    const res = await runWithFailover('research_psychology', 'prompt', env)
    
    expect(res.model_used).toBe('deepseek-r1')
    expect(res.models_tried).toContain('claude')
    expect(res.models_tried).toContain('deepseek-r1')
    expect(res.output).toBe('deepseek-success')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('429 writes ai_status to KV and skips model while reset_at is in future', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 429, statusText: 'Too Many Requests', headers: new Headers(), json: async () => ({}) })
    fetchMock.mockResolvedValueOnce({ ok: true, headers: new Headers(), json: async () => ({ choices: [{ message: { content: 'deepseek-success' } }] }) })

    await runWithFailover('research_psychology', 'prompt', env)
    
    const statusRaw = await env.CONFIG.get('ai_status:claude', 'json')
    expect(statusRaw).toBeTruthy()
    expect(statusRaw.type).toBe('rate_limited')
    // Default reset is 15 min when no header present
    expect(statusRaw.reset_at).toBeGreaterThan(Date.now() + 800_000)

    // 2nd run: claude should be skipped entirely
    fetchMock.mockReset()
    fetchMock.mockResolvedValueOnce({ ok: true, headers: new Headers(), json: async () => ({ choices: [{ message: { content: 'deepseek-success-2' } }] }) })

    const res2 = await runWithFailover('research_psychology', 'prompt', env)
    
    expect(res2.model_used).toBe('deepseek-r1')
    expect(res2.models_tried).not.toContain('claude')
    expect(fetchMock).toHaveBeenCalledTimes(1) // Only deepseek called

    // Fast forward > 15 min (default cooldown)
    vi.advanceTimersByTime(901_000)

    // 3rd run: claude should be retried
    fetchMock.mockReset()
    fetchMock.mockResolvedValueOnce({ ok: true, headers: new Headers(), json: async () => ({ content: [{ text: 'claude-success' }] }) })

    const res3 = await runWithFailover('research_psychology', 'prompt', env)
    
    expect(res3.model_used).toBe('claude')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('daily cap skips paid models and falls through to universal/offline', async () => {
    await env.CONFIG.put('ai_daily_cap_usd', '1.0')
    const today = new Date().toISOString().slice(0, 10)
    await env.CONFIG.put(`ai_spend:${today}`, '1.5')

    // All registry models are isFree:false — cap means all are skipped.
    // Groq universal fallback kicks in (has GROQ_API_KEY in env).
    fetchMock.mockResolvedValueOnce({ ok: true, headers: new Headers(), json: async () => ({ choices: [{ message: { content: 'groq-success' } }] }) })

    const res = await runWithFailover('research_psychology', 'prompt', env)

    // No paid model from the registry should have been tried
    expect(res.models_tried).not.toContain('claude')
    expect(res.models_tried).not.toContain('deepseek-r1')
    // The universal Groq fallback should have fired
    expect(res.model_used).toBe('groq-llama-3.3-70b')
  })

  it('offline fallback fires only when every provider fails', async () => {
    // Fail everything
    fetchMock.mockResolvedValue({ ok: false, status: 500, statusText: 'Error', headers: new Headers(), json: async () => ({}) })
    env.AI.run.mockRejectedValue(new Error('workers-ai failed'))

    const res = await runWithFailover('research_psychology', 'prompt', env)
    
    expect(res.model_used).toBe('offline-template')
    expect(res.output).toBeTruthy()
  })
})

describe('parseRateLimitReset', () => {
  it('parses Retry-After seconds', () => {
    const headers = new Headers({ 'retry-after': '60' })
    const { resetAt, source } = parseRateLimitReset(headers)
    expect(source).toBe('retry-after-seconds')
    expect(resetAt).toBeGreaterThan(Date.now() + 55_000)
    expect(resetAt).toBeLessThan(Date.now() + 65_000)
  })

  it('parses x-ratelimit-reset-tokens in "21s" format', () => {
    const headers = new Headers({ 'x-ratelimit-reset-tokens': '21s' })
    const { resetAt, source } = parseRateLimitReset(headers)
    expect(source).toBe('x-ratelimit-reset-tokens')
    expect(resetAt).toBeGreaterThan(Date.now() + 18_000)
    expect(resetAt).toBeLessThan(Date.now() + 25_000)
  })

  it('parses x-ratelimit-reset-requests in ms format', () => {
    const headers = new Headers({ 'x-ratelimit-reset-requests': '1500ms' })
    const { resetAt, source } = parseRateLimitReset(headers)
    expect(source).toBe('x-ratelimit-reset-requests')
    expect(resetAt).toBeGreaterThan(Date.now() + 1000)
    expect(resetAt).toBeLessThan(Date.now() + 3000)
  })

  it('parses Retry-After HTTP-date', () => {
    const future = new Date(Date.now() + 120_000).toUTCString()
    const headers = new Headers({ 'retry-after': future })
    const { resetAt, source } = parseRateLimitReset(headers)
    expect(source).toBe('retry-after-date')
    expect(resetAt).toBeGreaterThan(Date.now() + 100_000)
  })

  it('returns null when no headers present', () => {
    const headers = new Headers()
    const { resetAt, source } = parseRateLimitReset(headers)
    expect(resetAt).toBeNull()
    expect(source).toBeNull()
  })
})

describe('clampReset', () => {
  it('clamps short resets to at least 30s', () => {
    const result = clampReset(Date.now() + 5_000)
    expect(result).toBeGreaterThanOrEqual(Date.now() + 29_000)
  })

  it('clamps long resets to at most 6h', () => {
    const result = clampReset(Date.now() + 100 * 3_600_000)
    expect(result).toBeLessThanOrEqual(Date.now() + 6 * 3_600_000 + 1000)
  })

  it('passes through valid resets unchanged', () => {
    const input = Date.now() + 900_000 // 15 min
    const result = clampReset(input)
    expect(Math.abs(result - input)).toBeLessThan(100)
  })
})
