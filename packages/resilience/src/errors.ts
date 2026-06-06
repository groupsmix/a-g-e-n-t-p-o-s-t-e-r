/**
 * Typed errors for the resilience layer.
 */

/** Thrown when a retry budget is exhausted. */
export class RetryExhaustedError extends Error {
  public readonly attempts: number
  public readonly lastError: unknown

  constructor(attempts: number, lastError: unknown) {
    super(
      `Retry exhausted after ${attempts} attempt(s): ${
        lastError instanceof Error ? lastError.message : String(lastError)
      }`,
    )
    this.name = 'RetryExhaustedError'
    this.attempts = attempts
    this.lastError = lastError
  }
}

/** Thrown when a circuit breaker is open and rejects a call. */
export class CircuitOpenError extends Error {
  public readonly resetAt: Date

  constructor(name: string, resetAt: Date) {
    super(`Circuit "${name}" is OPEN until ${resetAt.toISOString()}`)
    this.name = 'CircuitOpenError'
    this.resetAt = resetAt
  }
}

/** Thrown when a timeout wrapper expires. */
export class TimeoutError extends Error {
  public readonly timeoutMs: number

  constructor(timeoutMs: number, label?: string) {
    super(`Operation${label ? ` "${label}"` : ''} timed out after ${timeoutMs}ms`)
    this.name = 'TimeoutError'
    this.timeoutMs = timeoutMs
  }
}

/** Mark an error as non-retryable (skip backoff, throw immediately). */
export class NonRetryableError extends Error {
  public readonly cause: unknown

  constructor(message: string, cause?: unknown) {
    super(message)
    this.name = 'NonRetryableError'
    this.cause = cause
  }
}

/** Returns true if the error should NOT be retried. */
export function isNonRetryable(err: unknown): boolean {
  if (err instanceof NonRetryableError) return true
  // HTTP 4xx (except 408, 429) are usually non-retryable
  if (err && typeof err === 'object' && 'status' in err) {
    const status = (err as { status: number }).status
    if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
      return true
    }
  }
  return false
}
