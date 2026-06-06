/**
 * @posteragent/resilience
 * Retry, circuit breaker, and error recovery primitives.
 */

export {
  withRetry,
  type RetryOptions,
} from './retry.js'

export {
  CircuitBreaker,
  getBreaker,
  listBreakers,
  type CircuitBreakerOptions,
  type CircuitState,
  type CircuitStats,
} from './circuit-breaker.js'

export {
  RetryExhaustedError,
  CircuitOpenError,
  TimeoutError,
  NonRetryableError,
  isNonRetryable,
} from './errors.js'
