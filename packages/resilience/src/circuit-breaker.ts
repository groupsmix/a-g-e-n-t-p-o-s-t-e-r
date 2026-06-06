/**
 * Circuit breaker — stops calling a failing dependency for a cool-down window.
 *
 * States:
 *   CLOSED  → calls flow through; failures counted
 *   OPEN    → fast-fail every call until cooldown elapses
 *   HALF    → allow a single probe; success closes, failure re-opens
 */

import { createLogger } from '@posteragent/logger'
import { CircuitOpenError } from './errors.js'

const log = createLogger('resilience:circuit')

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN'

export interface CircuitBreakerOptions {
  /** Consecutive failures before opening. Default 5. */
  failureThreshold?: number
  /** Cooldown window before half-open probe in ms. Default 30_000. */
  cooldownMs?: number
  /** Successful calls in HALF_OPEN required to close. Default 1. */
  halfOpenMaxCalls?: number
  /** Optional name for logs / errors. */
  name?: string
}

export interface CircuitStats {
  state: CircuitState
  failures: number
  successes: number
  openedAt?: Date
  resetAt?: Date
}

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED'
  private failures = 0
  private successes = 0
  private openedAt?: Date
  private resetAt?: Date
  private halfOpenInFlight = 0
  private readonly name: string
  private readonly failureThreshold: number
  private readonly cooldownMs: number
  private readonly halfOpenMaxCalls: number

  constructor(opts: CircuitBreakerOptions = {}) {
    this.name = opts.name ?? 'anonymous'
    this.failureThreshold = opts.failureThreshold ?? 5
    this.cooldownMs = opts.cooldownMs ?? 30_000
    this.halfOpenMaxCalls = opts.halfOpenMaxCalls ?? 1
  }

  /** Execute a function through the breaker. */
  async exec<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      const now = Date.now()
      if (this.resetAt && now >= this.resetAt.getTime()) {
        this.transitionTo('HALF_OPEN')
      } else {
        throw new CircuitOpenError(this.name, this.resetAt ?? new Date())
      }
    }

    if (this.state === 'HALF_OPEN' && this.halfOpenInFlight >= this.halfOpenMaxCalls) {
      throw new CircuitOpenError(this.name, this.resetAt ?? new Date())
    }

    if (this.state === 'HALF_OPEN') this.halfOpenInFlight++

    try {
      const result = await fn()
      this.recordSuccess()
      return result
    } catch (err) {
      this.recordFailure()
      throw err
    } finally {
      if (this.state === 'HALF_OPEN' && this.halfOpenInFlight > 0) this.halfOpenInFlight--
    }
  }

  private recordSuccess(): void {
    this.successes++
    if (this.state === 'HALF_OPEN') {
      this.transitionTo('CLOSED')
    }
    this.failures = 0
  }

  private recordFailure(): void {
    this.failures++
    if (this.state === 'HALF_OPEN') {
      this.transitionTo('OPEN')
      return
    }
    if (this.state === 'CLOSED' && this.failures >= this.failureThreshold) {
      this.transitionTo('OPEN')
    }
  }

  private transitionTo(next: CircuitState): void {
    if (this.state === next) return
    const prev = this.state
    this.state = next
    if (next === 'OPEN') {
      this.openedAt = new Date()
      this.resetAt = new Date(Date.now() + this.cooldownMs)
      log.warn('circuit:open', {
        name: this.name,
        failures: this.failures,
        resetAt: this.resetAt.toISOString(),
      })
    } else if (next === 'HALF_OPEN') {
      log.info('circuit:half-open', { name: this.name })
      this.halfOpenInFlight = 0
    } else if (next === 'CLOSED') {
      log.info('circuit:closed', { name: this.name, prevState: prev })
      this.failures = 0
      this.openedAt = undefined
      this.resetAt = undefined
    }
  }

  /** Get current breaker stats. */
  getStats(): CircuitStats {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      openedAt: this.openedAt,
      resetAt: this.resetAt,
    }
  }

  /** Force-close the breaker (e.g. for manual reset endpoint). */
  reset(): void {
    this.transitionTo('CLOSED')
  }
}

/** Module-level registry to share breakers across an app. */
const registry = new Map<string, CircuitBreaker>()

/** Get-or-create a named breaker. */
export function getBreaker(name: string, opts?: Omit<CircuitBreakerOptions, 'name'>): CircuitBreaker {
  let cb = registry.get(name)
  if (!cb) {
    cb = new CircuitBreaker({ ...opts, name })
    registry.set(name, cb)
  }
  return cb
}

/** List all registered breakers (for health endpoints). */
export function listBreakers(): Record<string, CircuitStats> {
  const out: Record<string, CircuitStats> = {}
  for (const [name, cb] of registry.entries()) {
    out[name] = cb.getStats()
  }
  return out
}
