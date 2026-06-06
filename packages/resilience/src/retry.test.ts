/**
 * Tests for withRetry.
 */

import { describe, it, expect, vi } from 'vitest'
import { withRetry } from './retry.js'
import { RetryExhaustedError, NonRetryableError, TimeoutError } from './errors.js'

describe('withRetry', () => {
  it('returns result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok')
    const result = await withRetry(fn, { initialDelayMs: 1, jitter: false })
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries on transient failure and eventually succeeds', async () => {
    let calls = 0
    const fn = vi.fn().mockImplementation(async () => {
      calls++
      if (calls < 3) throw new Error('transient')
      return 'eventual-ok'
    })
    const result = await withRetry(fn, {
      maxAttempts: 5,
      initialDelayMs: 1,
      jitter: false,
    })
    expect(result).toBe('eventual-ok')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('throws RetryExhaustedError after maxAttempts', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always-fail'))
    await expect(
      withRetry(fn, { maxAttempts: 3, initialDelayMs: 1, jitter: false }),
    ).rejects.toBeInstanceOf(RetryExhaustedError)
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('throws immediately on NonRetryableError', async () => {
    const fn = vi.fn().mockRejectedValue(new NonRetryableError('bad-input'))
    await expect(withRetry(fn, { maxAttempts: 5, initialDelayMs: 1 })).rejects.toBeInstanceOf(
      NonRetryableError,
    )
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('respects shouldRetry hook', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('skip-me'))
    await expect(
      withRetry(fn, { maxAttempts: 5, initialDelayMs: 1, shouldRetry: () => false }),
    ).rejects.toThrow('skip-me')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('times out per-attempt when timeoutMs is set', async () => {
    const fn = vi.fn().mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          setTimeout(() => resolve('too-late'), 500)
        }),
    )
    await expect(
      withRetry(fn, { maxAttempts: 1, initialDelayMs: 1, timeoutMs: 20 }),
    ).rejects.toBeInstanceOf(TimeoutError)
  })

  it('calls onRetry hook before each retry sleep', async () => {
    const onRetry = vi.fn()
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('once'))
      .mockResolvedValueOnce('ok')
    await withRetry(fn, {
      maxAttempts: 3,
      initialDelayMs: 1,
      jitter: false,
      onRetry,
    })
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
