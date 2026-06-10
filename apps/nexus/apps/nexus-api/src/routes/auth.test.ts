import { describe, it, expect } from 'vitest'
import {
  hashPassword,
  verifyPassword,
  isLegacyHash,
  isAccessConfigured,
  verifyAccessPassword,
} from './auth'
import type { Env } from '../env'

/**
 * Auth gate tests — verifies the PBKDF2 password hashing (audit 1.3), the
 * legacy SHA-256 → PBKDF2 migration, and the session/config logic for the
 * solo-owner access model.
 */

// A KV stub that records writes so we can prove which paths touch it.
function kvStub(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial))
  return {
    get: async (k: string) => store.get(k) ?? null,
    put: async (k: string, v: string) => void store.set(k, v),
    delete: async (k: string) => void store.delete(k),
    _store: store,
  }
}

// Reproduce the legacy (pre-audit-1.3) scheme so we can seed KV with a hash
// exactly as the old code would have written it.
async function legacyHash(password: string): Promise<string> {
  const data = new TextEncoder().encode('nexus.access.v1:' + password)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

describe('PBKDF2 password hashing (audit 1.3)', () => {
  it('produces a self-describing pbkdf2-sha256 hash', async () => {
    const hash = await hashPassword('test-password')
    expect(hash).toMatch(/^pbkdf2-sha256\$\d+\$[0-9a-f]{32}\$[0-9a-f]{64}$/)
    const iterations = parseInt(hash.split('$')[1], 10)
    expect(iterations).toBeGreaterThanOrEqual(100_000)
  })

  it('salts every hash: hashing the same password twice gives different hashes', async () => {
    const hash1 = await hashPassword('same-password')
    const hash2 = await hashPassword('same-password')
    expect(hash1).not.toBe(hash2)
    // ...but both verify.
    expect(await verifyPassword('same-password', hash1)).toBe(true)
    expect(await verifyPassword('same-password', hash2)).toBe(true)
  })

  it('verifyPassword rejects a wrong password', async () => {
    const hash = await hashPassword('correct-password')
    expect(await verifyPassword('wrong-password', hash)).toBe(false)
    expect(await verifyPassword('', hash)).toBe(false)
  })

  it('verifyPassword still verifies a legacy SHA-256 hash', async () => {
    const stored = await legacyHash('old-password-1234')
    expect(isLegacyHash(stored)).toBe(true)
    expect(await verifyPassword('old-password-1234', stored)).toBe(true)
    expect(await verifyPassword('not-the-password', stored)).toBe(false)
  })

  it('treats a malformed pbkdf2 encoding as non-matching instead of throwing', async () => {
    expect(await verifyPassword('whatever', 'pbkdf2-sha256$abc$zz$nope')).toBe(false)
    expect(await verifyPassword('whatever', 'pbkdf2-sha256$100000$deadbeef')).toBe(false)
  })
})

describe('legacy hash migration (audit 1.3)', () => {
  it('rehashes a legacy KV hash to PBKDF2 on the first successful verification', async () => {
    const password = 'a-sufficiently-long-password'
    const kv = kvStub({ access_hash: await legacyHash(password) })
    const env = { CONFIG: kv } as unknown as Env

    expect(await verifyAccessPassword(env, password)).toBe(true)

    const migrated = kv._store.get('access_hash') as string
    expect(migrated.startsWith('pbkdf2-sha256$')).toBe(true)
    // The migrated hash keeps working.
    expect(await verifyAccessPassword(env, password)).toBe(true)
    expect(await verifyAccessPassword(env, 'wrong-password')).toBe(false)
  })

  it('does NOT rewrite KV on a failed verification against a legacy hash', async () => {
    const stored = await legacyHash('the-real-password')
    const kv = kvStub({ access_hash: stored })
    const env = { CONFIG: kv } as unknown as Env

    expect(await verifyAccessPassword(env, 'wrong-guess')).toBe(false)
    expect(kv._store.get('access_hash')).toBe(stored)
  })
})

describe('access config — ACCESS_PASSWORD env secret (T1)', () => {
  it('is configured the instant the secret is set (gate active at boot)', async () => {
    const env = { ACCESS_PASSWORD: 'a-very-long-password', CONFIG: kvStub() } as unknown as Env
    expect(await isAccessConfigured(env)).toBe(true)
    expect(await verifyAccessPassword(env, 'a-very-long-password')).toBe(true)
    expect(await verifyAccessPassword(env, 'something-else')).toBe(false)
  })

  it('ACCESS_PASSWORD takes precedence over a stale KV hash and never touches KV', async () => {
    const staleKvHash = await legacyHash('old-kv-password')
    const kv = kvStub({ access_hash: staleKvHash })
    const env = {
      ACCESS_PASSWORD: 'env-authoritative-password',
      CONFIG: kv,
    } as unknown as Env

    expect(await verifyAccessPassword(env, 'env-authoritative-password')).toBe(true)
    expect(await verifyAccessPassword(env, 'old-kv-password')).toBe(false)
    // The env path must not read-migrate or overwrite the KV entry.
    expect(kv._store.get('access_hash')).toBe(staleKvHash)
  })

  it('falls back to the KV hash when ACCESS_PASSWORD is unset', async () => {
    const kv = kvStub({ access_hash: await hashPassword('kv-managed-password') })
    const env = { CONFIG: kv } as unknown as Env
    expect(await isAccessConfigured(env)).toBe(true)
    expect(await verifyAccessPassword(env, 'kv-managed-password')).toBe(true)
  })

  it('is unconfigured when neither ACCESS_PASSWORD nor a KV hash exists', async () => {
    const env = { CONFIG: kvStub() } as unknown as Env
    expect(await isAccessConfigured(env)).toBe(false)
    expect(await verifyAccessPassword(env, 'anything')).toBe(false)
  })

  it('treats an empty ACCESS_PASSWORD as unset (does not lock with an empty password)', async () => {
    const kv = kvStub({ access_hash: await hashPassword('kv-managed-password') })
    const env = { ACCESS_PASSWORD: '', CONFIG: kv } as unknown as Env
    expect(await isAccessConfigured(env)).toBe(true)
    expect(await verifyAccessPassword(env, 'kv-managed-password')).toBe(true)
    expect(await verifyAccessPassword(env, '')).toBe(false)
  })
})
