/**
 * Tests for the AES-256-GCM credential vault crypto.
 *
 * Runs in Node's vitest using the same Web Crypto API the Workers runtime
 * exposes (crypto.subtle), so behaviour is identical in CI and prod.
 */

import { describe, it, expect } from 'vitest'
import {
  encrypt,
  decrypt,
  decryptOrPassthrough,
  isEncrypted,
  parseKek,
  generateKek,
} from './crypto'

const TEST_KEK_HEX = generateKek()
const KEK = parseKek(TEST_KEK_HEX)

describe('crypto / KEK', () => {
  it('generateKek produces 64 hex chars', () => {
    const k = generateKek()
    expect(k).toMatch(/^[0-9a-f]{64}$/)
  })

  it('parseKek accepts 64-char hex', () => {
    const bytes = parseKek(TEST_KEK_HEX)
    expect(bytes.byteLength).toBe(32)
  })

  it('parseKek accepts base64url-encoded 32 bytes', () => {
    // 32 random bytes → base64url
    const raw = new Uint8Array(32)
    crypto.getRandomValues(raw)
    let bin = ''
    for (const b of raw) bin += String.fromCharCode(b)
    const b64 = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const parsed = parseKek(b64)
    expect(parsed.byteLength).toBe(32)
  })

  it('parseKek rejects wrong-length KEKs', () => {
    expect(() => parseKek('abc')).toThrow()
    expect(() => parseKek('00'.repeat(31))).toThrow() // 31 bytes
    expect(() => parseKek('zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz')).toThrow()
  })

  it('parseKek rejects odd-length hex', () => {
    expect(() => parseKek('a'.repeat(63))).toThrow()
  })
})

describe('crypto / round-trip', () => {
  it('encrypts and decrypts a short string', async () => {
    const ct = await encrypt('sk-test-1234', KEK)
    expect(ct).toMatch(/^v1\./)
    expect(await decrypt(ct, KEK)).toBe('sk-test-1234')
  })

  it('encrypts and decrypts a long string', async () => {
    const long = 'sk-' + 'a'.repeat(5000)
    const ct = await encrypt(long, KEK)
    expect(await decrypt(ct, KEK)).toBe(long)
  })

  it('encrypts unicode correctly', async () => {
    const plain = 'pässwörd-✓-日本語-🔑'
    const ct = await encrypt(plain, KEK)
    expect(await decrypt(ct, KEK)).toBe(plain)
  })

  it('two encryptions of the same plaintext produce different ciphertexts (IV randomness)', async () => {
    const a = await encrypt('hello', KEK)
    const b = await encrypt('hello', KEK)
    expect(a).not.toBe(b)
    expect(await decrypt(a, KEK)).toBe('hello')
    expect(await decrypt(b, KEK)).toBe('hello')
  })

  it('refuses to encrypt the empty string', async () => {
    await expect(encrypt('', KEK)).rejects.toThrow()
  })
})

describe('crypto / tamper detection', () => {
  // Helper: flip a char in the middle of a base64url segment to guarantee
  // the underlying bytes actually change (flipping the final char may not
  // change any byte when the final base64 group only uses partial bits).
  function tamperMid(s: string): string {
    const i = Math.floor(s.length / 2)
    const ch = s[i]!
    const replacement = ch === 'A' ? 'B' : 'A'
    return s.slice(0, i) + replacement + s.slice(i + 1)
  }

  it('decryption fails when the ciphertext is altered', async () => {
    const ct = await encrypt('sk-tamper', KEK)
    const parts = ct.split('.')
    parts[2] = tamperMid(parts[2]!)
    await expect(decrypt(parts.join('.'), KEK)).rejects.toThrow()
  })

  it('decryption fails when the IV is altered', async () => {
    const ct = await encrypt('sk-tamper', KEK)
    const parts = ct.split('.')
    parts[1] = tamperMid(parts[1]!)
    await expect(decrypt(parts.join('.'), KEK)).rejects.toThrow()
  })

  it('decryption fails under a different KEK', async () => {
    const ct = await encrypt('sk-tamper', KEK)
    const otherKek = parseKek(generateKek())
    await expect(decrypt(ct, otherKek)).rejects.toThrow()
  })

  it('decryption fails on malformed input', async () => {
    await expect(decrypt('not a token', KEK)).rejects.toThrow()
    await expect(decrypt('v2.aa.bb', KEK)).rejects.toThrow()
    await expect(decrypt('v1.only-two-parts', KEK)).rejects.toThrow()
  })
})

describe('crypto / format detection', () => {
  it('isEncrypted recognises v1 tokens', async () => {
    const ct = await encrypt('sk-test', KEK)
    expect(isEncrypted(ct)).toBe(true)
  })

  it('isEncrypted returns false for plaintext', () => {
    expect(isEncrypted('sk-plaintext-secret-xyz')).toBe(false)
    expect(isEncrypted('hello world')).toBe(false)
    expect(isEncrypted('')).toBe(false)
    expect(isEncrypted('v1.short.x')).toBe(false) // too short to match
  })
})

describe('crypto / decryptOrPassthrough (legacy migration)', () => {
  it('decrypts v1 tokens normally', async () => {
    const ct = await encrypt('sk-migrate', KEK)
    expect(await decryptOrPassthrough(ct, KEK)).toBe('sk-migrate')
  })

  it('returns legacy plaintext unchanged', async () => {
    expect(await decryptOrPassthrough('sk-legacy-plain', KEK)).toBe('sk-legacy-plain')
  })

  it('still throws on a tampered v1 token (not silently passthrough)', async () => {
    const ct = await encrypt('sk-tamper', KEK)
    const parts = ct.split('.')
    const seg = parts[2]!
    const i = Math.floor(seg.length / 2)
    parts[2] = seg.slice(0, i) + (seg[i] === 'A' ? 'B' : 'A') + seg.slice(i + 1)
    await expect(decryptOrPassthrough(parts.join('.'), KEK)).rejects.toThrow()
  })
})
