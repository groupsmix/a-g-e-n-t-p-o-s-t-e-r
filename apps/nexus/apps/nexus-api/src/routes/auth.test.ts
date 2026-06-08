import { describe, it, expect } from 'vitest'
import { hashPassword, getAccessHash } from './auth'
import type { Env } from '../env'

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

describe('access gate — ACCESS_PASSWORD env secret (T1)', () => {
  // A KV stub that records writes so we can prove the env path never touches it.
  function kvStub(initial: Record<string, string> = {}) {
    const store = new Map(Object.entries(initial))
    return {
      get: async (k: string) => store.get(k) ?? null,
      put: async (k: string, v: string) => void store.set(k, v),
      delete: async (k: string) => void store.delete(k),
      _store: store,
    }
  }

  it('returns the hash of ACCESS_PASSWORD when the secret is set (gate active immediately)', async () => {
    const env = { ACCESS_PASSWORD: 'a-very-long-password', CONFIG: kvStub() } as unknown as Env
    const hash = await getAccessHash(env)
    expect(hash).toBe(await hashPassword('a-very-long-password'))
  })

  it('ACCESS_PASSWORD takes precedence over a stale KV hash', async () => {
    const env = {
      ACCESS_PASSWORD: 'env-authoritative-password',
      CONFIG: kvStub({ access_hash: 'stale-kv-hash-value' }),
    } as unknown as Env
    const hash = await getAccessHash(env)
    expect(hash).toBe(await hashPassword('env-authoritative-password'))
    expect(hash).not.toBe('stale-kv-hash-value')
  })

  it('falls back to the KV hash when ACCESS_PASSWORD is unset', async () => {
    const env = { CONFIG: kvStub({ access_hash: 'kv-hash' }) } as unknown as Env
    expect(await getAccessHash(env)).toBe('kv-hash')
  })

  it('is unprotected (null) when neither ACCESS_PASSWORD nor a KV hash exists', async () => {
    const env = { CONFIG: kvStub() } as unknown as Env
    expect(await getAccessHash(env)).toBeNull()
  })

  it('treats an empty ACCESS_PASSWORD as unset (does not lock with an empty password)', async () => {
    const env = { ACCESS_PASSWORD: '', CONFIG: kvStub({ access_hash: 'kv-hash' }) } as unknown as Env
    expect(await getAccessHash(env)).toBe('kv-hash')
  })
})
