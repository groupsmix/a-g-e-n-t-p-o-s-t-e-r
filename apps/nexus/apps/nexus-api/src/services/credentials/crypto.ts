/**
 * AES-256-GCM at-rest encryption for the credentials vault.
 *
 * Cloudflare KV is encrypted at rest by Cloudflare, but the contents are
 * still readable by anyone who can call our worker.  The credentials vault
 * adds application-layer AES-256-GCM on top of KV so the only place the
 * plaintext key ever exists is inside a single Hono request handler — and
 * only after a successful decrypt with the Key Encryption Key (KEK) bound
 * as a Workers secret.
 *
 * Format (versioned so we can rotate the cipher without breaking old rows):
 *
 *   v1.<base64url(iv)>.<base64url(ciphertext + auth-tag)>
 *
 * - `v1`              identifies the cipher (AES-256-GCM, 96-bit IV)
 * - `iv`              12 random bytes per record (sampled fresh on every
 *                     encrypt; never reused)
 * - `ciphertext+tag`  AES-GCM appends a 16-byte authentication tag to the
 *                     ciphertext; we store the concatenation verbatim
 *
 * Legacy plaintext (no `v1.` prefix) is recognised by `isEncrypted` so the
 * vault route can transparently migrate older rows on first read.
 *
 * KEK source: the worker environment.  Either:
 *   - `KEK` / `MASTER_KEY` set to a 64-char hex string (32 bytes), or
 *   - any 32 raw bytes base64url-encoded under the same name.
 *
 * For local dev / tests, `generateKek()` produces a fresh hex KEK.
 */

const VERSION = 'v1' as const
const ALG = 'AES-GCM' as const
const IV_BYTES = 12
const KEY_BITS = 256
const KEY_BYTES = KEY_BITS / 8

// ─── Byte ⇄ string helpers ────────────────────────────────────────────────

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]!)
  const b64 = btoa(binary)
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(b64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

function fromHex(s: string): Uint8Array {
  if (s.length % 2 !== 0) throw new Error('crypto: hex KEK has odd length')
  const out = new Uint8Array(s.length / 2)
  for (let i = 0; i < out.length; i++) {
    const byte = parseInt(s.substr(i * 2, 2), 16)
    if (Number.isNaN(byte)) throw new Error('crypto: invalid hex character in KEK')
    out[i] = byte
  }
  return out
}

// ─── KEK loading ───────────────────────────────────────────────────────────

/**
 * Parse a KEK from a string.  Accepts a 64-char hex string OR a base64url
 * encoding of 32 raw bytes.  Throws on the wrong length.
 */
export function parseKek(raw: string): Uint8Array {
  const trimmed = raw.trim()
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) return fromHex(trimmed)
  // Otherwise assume base64url.  Length after decode must be 32 bytes.
  const decoded = fromBase64Url(trimmed)
  if (decoded.byteLength !== KEY_BYTES) {
    throw new Error(
      `crypto: KEK must be 32 bytes (64 hex chars or base64url(32 bytes)); got ${decoded.byteLength}`,
    )
  }
  return decoded
}

/** Produce a fresh random KEK (hex), suitable for `wrangler secret put MASTER_KEY`. */
export function generateKek(): string {
  const bytes = new Uint8Array(KEY_BYTES)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

async function importKek(rawKek: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', rawKek, ALG, false, ['encrypt', 'decrypt'])
}

// ─── Public API ────────────────────────────────────────────────────────────

/** Heuristic: does `s` look like a `v1.…` ciphertext (vs legacy plaintext)? */
export function isEncrypted(s: string): boolean {
  return /^v1\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}$/.test(s)
}

/**
 * Encrypt `plaintext` under `kek`.  Returns the wire format string.
 * Throws on empty plaintext (callers should DELETE the KV entry instead
 * of writing a sentinel).
 */
export async function encrypt(plaintext: string, kek: Uint8Array): Promise<string> {
  if (plaintext.length === 0) throw new Error('crypto: refusing to encrypt empty string')
  const key = await importKek(kek)
  const iv = new Uint8Array(IV_BYTES)
  crypto.getRandomValues(iv)
  const ptBytes = new TextEncoder().encode(plaintext)
  const ctBuf = await crypto.subtle.encrypt({ name: ALG, iv }, key, ptBytes)
  return `${VERSION}.${toBase64Url(iv)}.${toBase64Url(new Uint8Array(ctBuf))}`
}

/**
 * Decrypt a `v1.…` token under `kek`.  Throws if the format is wrong, the
 * KEK doesn't match, or the auth tag check fails (tamper).
 */
export async function decrypt(token: string, kek: Uint8Array): Promise<string> {
  if (!isEncrypted(token)) throw new Error('crypto: token is not a v1 ciphertext')
  const parts = token.split('.')
  if (parts.length !== 3 || parts[0] !== VERSION) {
    throw new Error('crypto: malformed token')
  }
  const iv = fromBase64Url(parts[1]!)
  const ct = fromBase64Url(parts[2]!)
  const key = await importKek(kek)
  const ptBuf = await crypto.subtle.decrypt({ name: ALG, iv }, key, ct)
  return new TextDecoder().decode(ptBuf)
}

/**
 * Try to decrypt; if the token is legacy plaintext (no `v1.` prefix) return
 * it as-is.  The vault route uses this on read so existing KV entries keep
 * working until the next write rewraps them.
 *
 * Re-throws cipher errors (wrong KEK, tamper) so the caller can surface a
 * meaningful "key store is corrupt" error instead of silently returning
 * garbage.
 */
export async function decryptOrPassthrough(stored: string, kek: Uint8Array): Promise<string> {
  if (!isEncrypted(stored)) return stored
  return decrypt(stored, kek)
}
