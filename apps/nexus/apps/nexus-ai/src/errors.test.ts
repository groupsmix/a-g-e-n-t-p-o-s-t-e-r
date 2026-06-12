import { describe, expect, it } from 'vitest'
import {
  AuthError,
  BadOutputError,
  QuotaError,
  RateLimitError,
  TimeoutError,
  classifyProviderError,
} from './errors'

describe('classifyProviderError', () => {
  it('classifies 429 responses as RateLimitError', () => {
    const err = classifyProviderError({ status: 429, message: 'Too Many Requests', resetAt: Date.now() + 60_000 })
    expect(err).toBeInstanceOf(RateLimitError)
    expect(err.name).toBe('RateLimitError')
  })

  it('classifies quota failures as QuotaError', () => {
    const err = classifyProviderError({ status: 402, message: 'insufficient_quota' })
    expect(err).toBeInstanceOf(QuotaError)
    expect(err.name).toBe('QuotaError')
  })

  it('classifies auth failures as AuthError', () => {
    const err = classifyProviderError({ status: 401, message: 'invalid api key' })
    expect(err).toBeInstanceOf(AuthError)
    expect(err.name).toBe('AuthError')
  })

  it('classifies aborted requests as TimeoutError', () => {
    const err = classifyProviderError({ name: 'AbortError', message: 'The operation was aborted' })
    expect(err).toBeInstanceOf(TimeoutError)
    expect(err.name).toBe('TimeoutError')
  })

  it('classifies invalid json failures as BadOutputError', () => {
    const err = classifyProviderError(new Error('Invalid JSON and repair failed'))
    expect(err).toBeInstanceOf(BadOutputError)
    expect(err.name).toBe('BadOutputError')
  })
})
