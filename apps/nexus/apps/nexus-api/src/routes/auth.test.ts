import { describe, it, expect } from 'vitest'
import {
  hashPassword,
  verifyPassword,
  verifyAccessPassword,
  getAccessHash,
  isLegacyHash,
  getSessionGeneration,
  bumpSessionGeneration,
  createSession,
  validateSessionToken,
  ENV_PASSWORD_SENTINEL,
} from './auth'
import type { Env } from '../env'

/**
 * Auth gate tests — verifies the password hashing (PBKDF2, audit 1.3),
 * legacy-hash migration, and generation-checked session logic (audit 1.5)
 * for the solo-owner access model.
 */

// A KV stub that records writes so we can assert against the store directly.
function kvStub(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial))
  return {
    get: async (k: string) => store.get(k) ?? null,
    put: async (k: string, v: string) => void store.set(k, v),
    delete: async (k: string) => void store.delete(k),
    _store: store,
  }
}

function makeEnv(over: Record<string, unknown> = {}): Env {
  return { CONFIG: kvStub(), ...over } as unknown as Env
}

const LEGACY_SALT = 'nexus.access.v1:'
async function legacyHash(password: string): Promise<string> {
  const data = new TextEncoder().encode(LEGACY_SALT + password)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

describe('password hashing — PBKDF2 (audit 1.3)', () => {
  it('produces the pbkdf2$iterations$salt$hash format', async () => {
    const hash = await hashPassword('test-password')
    expect(hash).toMatch(/^pbkdf2\$100000\$[0-9a-f]{32}\$[0-9a-f]{64}$/)
  })

  it('uses a random per-hash salt — same password, different hashes', async () => {
    const hash1 = await hashPassword('test-password')
    const hash2 = await hashPassword('test-password')
    expect(hash1).not.toBe(hash2)
  })

  it('verifyPassword round-trips a PBKDF2 hash', async () => {
    const hash = await hashPassword('correct horse battery staple')
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true)
    expect(await verifyPassword('wrong password entirely!', hash)).toBe(false)
  })

  it('verifyPassword still accepts a legacy SHA-256 hash (migration window)', async () => {
    const stored = await legacyHash('old-password-sixteen')
    expect(isLegacyHash(stored)).toBe(true)
    expect(await verifyPassword('old-password-sixteen', stored)).toBe(true)
    expect(await verifyPassword('not-the-password!', stored)).toBe(false)
  })

  it('rejects malformed stored hashes instead of throwing', async () => {
    expect(await verifyPassword('whatever', 'not-a-hash')).toBe(false)
    expect(await verifyPassword('whatever', 'pbkdf2$bogus')).toBe(false)
    expect(await verifyPassword('whatever', '')).toBe(false)
  })
})

describe('legacy hash migration on successful login (audit 1.3)', () => {
  it('re-hashes a legacy KV hash to PBKDF2 after a successful verify', async () => {
    const kv = kvStub({ access_hash: await legacyHash('migrate-me-please-16') })
    const env = { CONFIG: kv } as unknown as Env
    expect(await verifyAccessPassword(env, 'migrate-me-please-16')).toBe(true)
    const stored = kv._store.get('access_hash')!
    expect(stored.startsWith('pbkdf2$')).toBe(true)
    // And the migrated hash still verifies.
    expect(await verifyAccessPassword(env, 'migrate-me-please-16')).toBe(true)
  })

  it('does NOT rewrite the hash on a failed verify', async () => {
    const legacy = await legacyHash('migrate-me-please-16')
    const kv = kvStub({ access_hash: legacy })
    const env = { CONFIG: kv } as unknown as Env
    expect(await verifyAccessPassword(env, 'wrong-password-here')).toBe(false)
    expect(kv._store.get('access_hash')).toBe(legacy)
  })
})

describe('access gate — ACCESS_PASSWORD env secret (T1)', () => {
  it('reports configured (sentinel) when the secret is set — gate active immediately', async () => {
    const env = makeEnv({ ACCESS_PASSWORD: 'a-very-long-password' })
    expect(await getAccessHash(env)).toBe(ENV_PASSWORD_SENTINEL)
  })

  it('verifies the env password directly, constant-time, no KV involved', async () => {
    const kv = kvStub({ access_hash: 'stale-kv-hash-value' })
    const env = { ACCESS_PASSWORD: 'env-authoritative-password', CONFIG: kv } as unknown as Env
    expect(await verifyAccessPassword(env, 'env-authoritative-password')).toBe(true)
    expect(await verifyAccessPassword(env, 'stale-kv-password')).toBe(false)
    // The env path never rewrites KV.
    expect(kv._store.get('access_hash')).toBe('stale-kv-hash-value')
  })

  it('ACCESS_PASSWORD takes precedence over a stale KV hash', async () => {
    const env = makeEnv({
      ACCESS_PASSWORD: 'env-authoritative-password',
      CONFIG: kvStub({ access_hash: 'stale-kv-hash-value' }),
    })
    expect(await getAccessHash(env)).toBe(ENV_PASSWORD_SENTINEL)
  })

  it('falls back to the KV hash when ACCESS_PASSWORD is unset', async () => {
    const env = makeEnv({ CONFIG: kvStub({ access_hash: 'kv-hash' }) })
    expect(await getAccessHash(env)).toBe('kv-hash')
  })

  it('is unconfigured (null) when neither ACCESS_PASSWORD nor a KV hash exists', async () => {
    expect(await getAccessHash(makeEnv())).toBeNull()
  })

  it('treats an empty ACCESS_PASSWORD as unset (does not lock with an empty password)', async () => {
    const env = makeEnv({ ACCESS_PASSWORD: '', CONFIG: kvStub({ access_hash: 'kv-hash' }) })
    expect(await getAccessHash(env)).toBe('kv-hash')
  })
})

describe('sessions — generation-checked revocation (audit 1.5)', () => {
  it('mints sessions that record createdAt, ip, ua and generation', async () => {
    const kv = kvStub()
    const env = { CONFIG: kv } as unknown as Env
    const token = await createSession(env, '203.0.113.7', 'Mozilla/5.0')
    const raw = kv._store.get('session:' + token)!
    const record = JSON.parse(raw)
    expect(record.ip).toBe('203.0.113.7')
    expect(record.ua).toBe('Mozilla/5.0')
    expect(record.gen).toBe(0)
    expect(new Date(record.createdAt).getTime()).not.toBeNaN()
    expect(await validateSessionToken(env, token)).toBe(true)
  })

  it('bumping the generation invalidates ALL outstanding sessions', async () => {
    const env = makeEnv()
    const a = await createSession(env, '203.0.113.7')
    const b = await createSession(env, '198.51.100.4')
    expect(await validateSessionToken(env, a)).toBe(true)
    expect(await validateSessionToken(env, b)).toBe(true)
    await bumpSessionGeneration(env)
    expect(await validateSessionToken(env, a)).toBe(false)
    expect(await validateSessionToken(env, b)).toBe(false)
    // New sessions minted after the bump are valid again.
    const c = await createSession(env, '203.0.113.7')
    expect(await validateSessionToken(env, c)).toBe(true)
  })

  it('legacy value-"1" sessions are valid only at generation 0', async () => {
    const env = makeEnv({ CONFIG: kvStub({ 'session:legacy-token': '1' }) })
    expect(await validateSessionToken(env, 'legacy-token')).toBe(true)
    await bumpSessionGeneration(env)
    expect(await validateSessionToken(env, 'legacy-token')).toBe(false)
  })

  it('rejects unknown tokens and garbage session values', async () => {
    const env = makeEnv({ CONFIG: kvStub({ 'session:garbage': 'not-json{' }) })
    expect(await validateSessionToken(env, 'nope')).toBe(false)
    expect(await validateSessionToken(env, 'garbage')).toBe(false)
    expect(await validateSessionToken(env, '')).toBe(false)
  })

  it('getSessionGeneration tolerates a missing or corrupt counter', async () => {
    expect(await getSessionGeneration(makeEnv())).toBe(0)
    const env = makeEnv({ CONFIG: kvStub({ session_generation: 'NaN-garbage' }) })
    expect(await getSessionGeneration(env)).toBe(0)
  })
})
