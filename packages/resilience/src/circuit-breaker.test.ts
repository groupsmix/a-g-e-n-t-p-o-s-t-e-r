/**
 * Tests for CircuitBreaker.
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { CircuitBreaker } from './circuit-breaker.js'
import { CircuitOpenError } from './errors.js'

describe('CircuitBreaker', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('lets calls through while CLOSED', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 3 })
    const fn = vi.fn().mockResolvedValue('ok')
    expect(await cb.exec(fn)).toBe('ok')
    expect(cb.getStats().state).toBe('CLOSED')
  })

  it('opens after threshold consecutive failures', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 1000 })
    const fn = vi.fn().mockRejectedValue(new Error('fail'))
    for (let i = 0; i < 3; i++) {
      await expect(cb.exec(fn)).rejects.toThrow('fail')
    }
    expect(cb.getStats().state).toBe('OPEN')
    await expect(cb.exec(fn)).rejects.toBeInstanceOf(CircuitOpenError)
  })

  it('transitions to HALF_OPEN after cooldown then CLOSED on success', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 2, cooldownMs: 1000 })
    const failing = vi.fn().mockRejectedValue(new Error('fail'))
    const passing = vi.fn().mockResolvedValue('ok')

    await expect(cb.exec(failing)).rejects.toThrow()
    await expect(cb.exec(failing)).rejects.toThrow()
    expect(cb.getStats().state).toBe('OPEN')

    vi.advanceTimersByTime(1100)
    const result = await cb.exec(passing)
    expect(result).toBe('ok')
    expect(cb.getStats().state).toBe('CLOSED')
  })

  it('re-opens from HALF_OPEN if probe fails', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 2, cooldownMs: 1000 })
    const failing = vi.fn().mockRejectedValue(new Error('fail'))

    await expect(cb.exec(failing)).rejects.toThrow()
    await expect(cb.exec(failing)).rejects.toThrow()
    vi.advanceTimersByTime(1100)
    await expect(cb.exec(failing)).rejects.toThrow('fail')
    expect(cb.getStats().state).toBe('OPEN')
  })

  it('reset() forces back to CLOSED', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 60_000 })
    const failing = vi.fn().mockRejectedValue(new Error('fail'))
    await expect(cb.exec(failing)).rejects.toThrow()
    expect(cb.getStats().state).toBe('OPEN')
    cb.reset()
    expect(cb.getStats().state).toBe('CLOSED')
  })
})
