import { describe, it, expect } from 'vitest'
import { hashPassword } from './auth'

/**
 * Auth gate tests — verifies the password hashing and session logic
 * works correctly for the solo-owner access model.
 */

describe('auth gate', () => {
  it('hashPassword produces consistent hex digest', async () => {
    const hash1 = await hashPassword('test-password')
    const hash2 = await hashPassword('test-password')
    expect(hash1).toBe(hash2)
    expect(hash1).toMatch(/^[0-9a-f]{64}$/) // SHA-256 = 64 hex chars
  })

  it('hashPassword produces different hashes for different passwords', async () => {
    const hash1 = await hashPassword('password-a')
    const hash2 = await hashPassword('password-b')
    expect(hash1).not.toBe(hash2)
  })

  it('hashPassword includes salt so raw SHA-256 of password differs', async () => {
    // The function uses 'nexus.access.v1:' as salt
    const hash = await hashPassword('123456789')
    // Raw SHA-256 of '123456789' would be different
    const rawData = new TextEncoder().encode('123456789')
    const rawDigest = await crypto.subtle.digest('SHA-256', rawData)
    const rawHex = [...new Uint8Array(rawDigest)].map((b) => b.toString(16).padStart(2, '0')).join('')
    expect(hash).not.toBe(rawHex)
  })

  it('hashPassword handles empty string', async () => {
    const hash = await hashPassword('')
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })
})
