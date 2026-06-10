import { Hono } from 'hono'
import type { Env } from '../env'

// ============================================================
// Access gate — a single shared password that locks the whole
// dashboard + API. Stored server-side in KV as a PBKDF2 hash
// (never the plaintext).
//
// Tokens are random 256-bit hex strings stored in KV with a 24 h
// TTL. On each authenticated request the middleware validates the
// bearer token against KV (not the password hash).
//
// Bootstrap rule (fail-closed since audit 1.2): until a password
// is set, only /api/auth/* responds — the owner bootstraps via
// /api/auth/setup; everything else returns 403 setup_required.
// ============================================================

const KV_HASH = 'access_hash'

// Legacy (pre-audit-1.3) static salt. Kept ONLY so hashes written by the old
// single-pass SHA-256 scheme can still be verified; on the first successful
// login against a legacy hash we transparently rehash with PBKDF2 (see
// verifyAccessPassword). Do not use for new hashes.
const LEGACY_SALT = 'nexus.access.v1:'

// PBKDF2 parameters (audit 1.3). SHA-256 alone is a fast hash — GPU
// bruteforceable if the KV hash ever leaks. PBKDF2-HMAC-SHA256 with a
// per-hash random salt is natively supported by Workers' crypto.subtle and
// makes offline guessing ~100,000x more expensive. Iterations are encoded in
// the stored hash, so this constant can be raised later without breaking
// existing hashes.
const PBKDF2_PREFIX = 'pbkdf2-sha256'
const PBKDF2_ITERATIONS = 100_000
const PBKDF2_SALT_BYTES = 16
const PBKDF2_KEY_BITS = 256

// Rate-limit window: max 5 attempts per IP per 60 s.
const RL_MAX = 5
const RL_WINDOW_S = 60
const RL_PREFIX = 'rl:auth:'

// Session token settings
const SESSION_PREFIX = 'session:'
const SESSION_TTL_S = 86400 // 24 hours

// FIX #1 — minimum password length raised to 16 characters.
const MIN_PASSWORD_LENGTH = 16

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return bytes
}

// Derive a PBKDF2 hash and encode it self-describingly:
//   pbkdf2-sha256$<iterations>$<salt-hex>$<derived-key-hex>
// Salt and iteration count travel WITH the hash, so verification never
// depends on current constants and parameters can be raised over time.
async function deriveHash(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    key,
    PBKDF2_KEY_BITS,
  )
  return `${PBKDF2_PREFIX}$${iterations}$${toHex(salt)}$${toHex(new Uint8Array(bits))}`
}

// Hash a password for storage. Every call uses a fresh random salt, so the
// same password produces different hashes — equality comparison of hashes is
// meaningless by design. Use verifyPassword().
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(PBKDF2_SALT_BYTES))
  return deriveHash(password, salt, PBKDF2_ITERATIONS)
}

// The pre-audit-1.3 scheme: SHA-256(LEGACY_SALT + password), hex-encoded.
// Only used to verify stored legacy hashes during migration.
async function legacyHashPassword(password: string): Promise<string> {
  const data = new TextEncoder().encode(LEGACY_SALT + password)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return toHex(new Uint8Array(digest))
}

// A stored hash is legacy iff it doesn't carry the PBKDF2 prefix.
export function isLegacyHash(stored: string): boolean {
  return !stored.startsWith(PBKDF2_PREFIX + '$')
}

// Verify a password against a stored hash (either format), in constant time
// over the comparison. Malformed PBKDF2 encodings verify as false rather
// than throwing.
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (isLegacyHash(stored)) {
    return timingSafeEqualStr(await legacyHashPassword(password), stored)
  }
  const parts = stored.split('$')
  if (parts.length !== 4) return false
  const iterations = parseInt(parts[1], 10)
  const saltHex = parts[2]
  if (!Number.isFinite(iterations) || iterations < 1 || !/^[0-9a-f]+$/.test(saltHex)) return false
  const recomputed = await deriveHash(password, fromHex(saltHex), iterations)
  return timingSafeEqualStr(recomputed, stored)
}

// Whether the access gate has a password configured at all.
//
// Precedence (unchanged from the old getAccessHash):
//   1. ACCESS_PASSWORD env secret — gate is active the instant the worker
//      boots; no window where a fresh deploy is unprotected.
//   2. KV `access_hash` (the dashboard bootstrap/change flow).
//   3. false → unconfigured (the gate fails closed, audit 1.2).
export async function isAccessConfigured(env: Env): Promise<boolean> {
  if (isEnvPasswordActive(env)) return true
  if (!env.CONFIG) return false
  return (await env.CONFIG.get(KV_HASH)) !== null
}

// Verify a presented password against whatever is authoritative right now.
//
// - ACCESS_PASSWORD set: constant-time compare against the secret itself.
//   KV is never read or written on this path (a stale KV hash stays inert).
// - Otherwise: verify against the KV hash. If the stored hash is legacy
//   SHA-256 and the password verifies, transparently rehash with PBKDF2 and
//   persist — the migration completes on the owner's next successful login
//   with zero ceremony.
export async function verifyAccessPassword(env: Env, password: string): Promise<boolean> {
  if (!password) return false
  if (isEnvPasswordActive(env)) {
    return timingSafeEqualStr(password, env.ACCESS_PASSWORD as string)
  }
  if (!env.CONFIG) return false
  const stored = await env.CONFIG.get(KV_HASH)
  if (!stored) return false
  const ok = await verifyPassword(password, stored)
  if (ok && isLegacyHash(stored)) {
    await env.CONFIG.put(KV_HASH, await hashPassword(password))
  }
  return ok
}

// Whether the password is pinned by the ACCESS_PASSWORD secret (so the
// runtime change flow is disabled — rotate via the secret instead).
function isEnvPasswordActive(env: Env): boolean {
  return Boolean(env.ACCESS_PASSWORD && env.ACCESS_PASSWORD.length > 0)
}

function generateToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// Validate a bearer token by checking KV.
export async function validateSessionToken(env: Env, token: string): Promise<boolean> {
  if (!token || !env.CONFIG) return false
  const stored = await env.CONFIG.get(SESSION_PREFIX + token)
  return stored === '1'
}

// Rate-limit check per IP. Returns true when the request is allowed.
async function checkRateLimit(env: Env, ip: string): Promise<boolean> {
  const key = RL_PREFIX + ip
  const raw = await env.CONFIG.get(key)
  const now = Math.floor(Date.now() / 1000)

  if (raw) {
    const { count, windowStart } = JSON.parse(raw) as { count: number; windowStart: number }
    if (now - windowStart < RL_WINDOW_S) {
      if (count >= RL_MAX) return false
      await env.CONFIG.put(key, JSON.stringify({ count: count + 1, windowStart }), {
        expirationTtl: RL_WINDOW_S,
      })
      return true
    }
  }
  await env.CONFIG.put(key, JSON.stringify({ count: 1, windowStart: now }), {
    expirationTtl: RL_WINDOW_S,
  })
  return true
}

export const authRoutes = new Hono<{ Bindings: Env }>()

// Whether a password has been set (so the UI knows to show login vs setup).
authRoutes.get('/status', async (c) => {
  return c.json({ protected: await isAccessConfigured(c.env) })
})

// Exchange a password for a session token.
authRoutes.post('/login', async (c) => {
  const ip = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown'
  if (!(await checkRateLimit(c.env, ip))) {
    return c.json({ error: 'Too many attempts. Try again in a minute.' }, 429)
  }

  const { password } = await c.req.json<{ password?: string }>()
  if (!(await isAccessConfigured(c.env))) return c.json({ error: 'No password set yet' }, 400)
  // verifyAccessPassword also migrates a legacy SHA-256 hash to PBKDF2 on
  // the first successful login (audit 1.3).
  if (!password || !(await verifyAccessPassword(c.env, password))) {
    return c.json({ error: 'Wrong password' }, 401)
  }

  const token = generateToken()
  await c.env.CONFIG.put(SESSION_PREFIX + token, '1', { expirationTtl: SESSION_TTL_S })
  return c.json({ token })
})

// Constant-time string compare used by the bootstrap gate. Kept local to this
// file so the auth router has no cross-module dependency on money-machine.
function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// Set (first time) or change the password.
// - First time: requires the MONEY_MACHINE_TOKEN bearer (bootstrap gate) so
//   that an internet scanner who reaches the worker before the owner can't
//   set a password and lock the owner out. The token is already a required
//   server secret for /api/money-machine, so reusing it costs nothing.
//   If MONEY_MACHINE_TOKEN is unset, bootstrap is allowed without auth and
//   logs a warning — keeps the legacy local-dev workflow alive.
// - Change: must present the current password (no token needed).
authRoutes.post('/setup', async (c) => {
  const ip = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown'
  if (!(await checkRateLimit(c.env, ip))) {
    return c.json({ error: 'Too many attempts. Try again in a minute.' }, 429)
  }

  // When the password is pinned by the ACCESS_PASSWORD secret, runtime
  // changes are meaningless (verification always uses the env secret, so a
  // KV write would be silently shadowed). Reject clearly and tell the owner
  // where to rotate it.
  if (isEnvPasswordActive(c.env)) {
    return c.json(
      { error: 'Password is managed by the ACCESS_PASSWORD secret. Rotate it with `wrangler secret put ACCESS_PASSWORD`.' },
      409,
    )
  }

  const { password, current } = await c.req.json<{ password?: string; current?: string }>()

  // FIX #1 — enforce 16-character minimum.
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return c.json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` }, 400)
  }

  const configured = await isAccessConfigured(c.env)
  if (!configured) {
    // ── Bootstrap path ────────────────────────────────────────────────────
    // First-time setup must present the static MONEY_MACHINE_TOKEN, when
    // configured. This closes the race where a scanner hits /setup before
    // the owner does. Without this check, the *.workers.dev URL is wide
    // open to a password-takeover until the owner's first visit.
    const bootstrapToken = c.env.MONEY_MACHINE_TOKEN
    if (bootstrapToken) {
      const auth = c.req.header('Authorization') || ''
      const presented = auth.startsWith('Bearer ') ? auth.slice(7) : ''
      if (!presented || !timingSafeEqualStr(presented, bootstrapToken)) {
        return c.json(
          { error: 'Bootstrap requires MONEY_MACHINE_TOKEN bearer auth' },
          401,
        )
      }
    }
    // else: legacy local-dev path — no token configured, anyone on this
    // worker can claim the password. Acceptable for `wrangler dev`.
  } else {
    if (!current || !(await verifyAccessPassword(c.env, current))) {
      return c.json({ error: 'Current password is incorrect' }, 401)
    }
  }
  const hash = await hashPassword(password)
  await c.env.CONFIG.put(KV_HASH, hash)

  const token = generateToken()
  await c.env.CONFIG.put(SESSION_PREFIX + token, '1', { expirationTtl: SESSION_TTL_S })
  return c.json({ ok: true, token })
})

// FIX #2 — /auth/disable is permanently removed.
// Allowing the gate to be disabled in production creates a route that can be
// social-engineered or accidentally triggered. Remove it entirely; if you ever
// need to reset the gate, delete the KV key directly from the Cloudflare
// dashboard (Workers → KV → CONFIG → delete "access_hash").
//
// The old handler is left here as a comment so you know what was removed:
//
// authRoutes.post('/disable', async (c) => {
//   const { current } = await c.req.json<{ current?: string }>()
//   const existing = await getAccessHash(c.env)
//   if (existing) {
//     if (!current || (await hashPassword(current)) !== existing) {
//       return c.json({ error: 'Current password is incorrect' }, 401)
//     }
//     await c.env.CONFIG.delete(KV_HASH)
//   }
//   return c.json({ ok: true })
// })
