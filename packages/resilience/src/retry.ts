/**
 * Retry with exponential backoff + jitter.
 *
 * Inspired by AWS Architecture Blog "exponential backoff and jitter".
 */

import { createLogger } from '@posteragent/logger'
import { RetryExhaustedError, TimeoutError, isNonRetryable } from './errors.js'

const log = createLogger('resilience:retry')

export interface RetryOptions {
  /** Max attempts including the first one. Default 3. */
  maxAttempts?: number
  /** Initial backoff in ms. Default 500. */
  initialDelayMs?: number
  /** Cap for backoff in ms. Default 30_000. */
  maxDelayMs?: number
  /** Multiplier between attempts. Default 2. */
  factor?: number
  /** Add randomness to avoid thundering herd. Default true. */
  jitter?: boolean
  /** Per-attempt timeout in ms. */
  timeoutMs?: number
  /** Optional hook to decide if an error should be retried. */
  shouldRetry?: (err: unknown, attempt: number) => boolean
  /** Optional callback fired before each retry sleep. */
  onRetry?: (err: unknown, attempt: number, delayMs: number) => void
  /** Label for logs. */
  label?: string
}

const defaults: Required<
  Omit<RetryOptions, 'timeoutMs' | 'shouldRetry' | 'onRetry' | 'label'>
> = {
  maxAttempts: 3,
  initialDelayMs: 500,
  maxDelayMs: 30_000,
  factor: 2,
  jitter: true,
}

/** Sleep helper. */
function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms))
}

/** Compute next backoff delay with full jitter. */
function nextDelay(attempt: number, opts: Required<typeof defaults>): number {
  const exp = Math.min(opts.maxDelayMs, opts.initialDelayMs * Math.pow(opts.factor, attempt - 1))
  return opts.jitter ? Math.random() * exp : exp
}

/** Race a promise against a timeout. */
async function withTimeout<T>(p: Promise<T>, ms: number, label?: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      p,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new TimeoutError(ms, label)), ms)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * Run `fn` with retry + exponential backoff.
 *
 * @example
 * ```ts
 * const data = await withRetry(
 *   () => fetch('https://api.x.com').then(r => r.json()),
 *   { maxAttempts: 5, label: 'x-api' }
 * )
 * ```
 */
export async function withRetry<T>(fn: () => Promise<T>, options?: RetryOptions): Promise<T> {
  const opts = { ...defaults, ...options } as Required<typeof defaults> & RetryOptions
  const label = options?.label
  let lastError: unknown

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      const result = opts.timeoutMs
        ? await withTimeout(fn(), opts.timeoutMs, label)
        : await fn()
      if (attempt > 1) {
        log.info('retry:succeeded', { label, attempt })
      }
      return result
    } catch (err) {
      lastError = err

      if (isNonRetryable(err)) {
        log.warn('retry:non-retryable', { label, attempt, err: String(err) })
        throw err
      }

      if (opts.shouldRetry && !opts.shouldRetry(err, attempt)) {
        throw err
      }

      if (attempt >= opts.maxAttempts) break

      const delay = nextDelay(attempt, opts)
      log.warn('retry:will-retry', {
        label,
        attempt,
        nextAttemptInMs: Math.round(delay),
        err: err instanceof Error ? err.message : String(err),
      })
      opts.onRetry?.(err, attempt, delay)
      await sleep(delay)
    }
  }

  throw new RetryExhaustedError(opts.maxAttempts, lastError)
}
