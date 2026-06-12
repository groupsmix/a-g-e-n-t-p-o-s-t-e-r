import type { AIAttemptLog } from './types'

type ErrorContext = {
  cause?: unknown
  message?: string
  statusCode?: number
  resetAt?: number | null
  resetSource?: string | null
}

export class BaseAIError extends Error {
  statusCode?: number
  resetAt?: number | null
  resetSource?: string | null

  constructor(name: string, fallbackMessage: string, context: ErrorContext = {}) {
    super(context.message ?? fallbackMessage)
    this.name = name
    this.statusCode = context.statusCode
    this.resetAt = context.resetAt
    this.resetSource = context.resetSource
    if (context.cause !== undefined) {
      ;(this as Error & { cause?: unknown }).cause = context.cause
    }
  }
}

export class RateLimitError extends BaseAIError {
  constructor(context: ErrorContext = {}) {
    super('RateLimitError', 'Provider rate limit reached', { ...context, statusCode: context.statusCode ?? 429 })
  }
}

export class QuotaError extends BaseAIError {
  constructor(context: ErrorContext = {}) {
    super('QuotaError', 'Provider quota exceeded', { ...context, statusCode: context.statusCode ?? 402 })
  }
}

export class AuthError extends BaseAIError {
  constructor(context: ErrorContext = {}) {
    super('AuthError', 'Provider authentication failed', context)
  }
}

export class TimeoutError extends BaseAIError {
  constructor(context: ErrorContext = {}) {
    super('TimeoutError', 'Provider request timed out', context)
  }
}

export class BadOutputError extends BaseAIError {
  constructor(context: ErrorContext = {}) {
    super('BadOutputError', 'Provider returned invalid output', context)
  }
}

export class AllModelsFailedError extends BaseAIError {
  attempts: AIAttemptLog[]

  constructor(attempts: AIAttemptLog[], message = 'All AI models failed') {
    super('AllModelsFailedError', message, { statusCode: 503 })
    this.attempts = attempts
  }
}

export function classifyProviderError(error: unknown): BaseAIError {
  if (
    error instanceof RateLimitError ||
    error instanceof QuotaError ||
    error instanceof AuthError ||
    error instanceof TimeoutError ||
    error instanceof BadOutputError ||
    error instanceof AllModelsFailedError
  ) {
    return error
  }

  const candidate = error as {
    name?: string
    message?: string
    status?: number
    statusCode?: number
    resetAt?: number | null
    resetSource?: string | null
  } | null
  const message = candidate?.message ?? 'Unknown provider error'
  const statusCode = candidate?.status ?? candidate?.statusCode

  if (statusCode === 429) {
    return new RateLimitError({
      cause: error,
      message,
      statusCode,
      resetAt: candidate?.resetAt,
      resetSource: candidate?.resetSource,
    })
  }

  if (statusCode === 402 || /insufficient_quota|quota/i.test(message)) {
    return new QuotaError({ cause: error, message, statusCode })
  }

  if (statusCode === 401 || statusCode === 403) {
    return new AuthError({ cause: error, message, statusCode })
  }

  if (
    candidate?.name === 'AbortError' ||
    /timed out|timeout/i.test(message)
  ) {
    return new TimeoutError({ cause: error, message, statusCode })
  }

  if (/invalid json|unparseable json|bad output/i.test(message)) {
    return new BadOutputError({ cause: error, message, statusCode })
  }

  return new BaseAIError('ProviderError', 'Provider request failed', {
    cause: error,
    message,
    statusCode,
    resetAt: candidate?.resetAt,
    resetSource: candidate?.resetSource,
  })
}
