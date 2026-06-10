import { Hono } from 'hono'
import type { Env } from '../env'

// ============================================================
// Access gate — a single shared password that locks the whole
// dashboard + API.
//
// Hashing (audit 1.3): passwords are stored as PBKDF2-SHA256 with a
// per-hash random salt and 100k iterations, serialized as
// `pbkdf2$<iterations>$<saltHex>$<hashHex>`. Legacy single-pass
// SHA-256 hashes (bare 64-char hex) are still verified and are
// transparently re-hashed to PBKDF2 on the next successful login,
// so the migration needs no manual step.
//
// Sessions (audit 1.5): tokens are random 256-bit hex strings stored
// in KV with a 24 h TTL. The value records { createdAt, ip, gen }.
// `gen` is checked against a global `session_generation` counter —
// bumping the counter (password change, /auth/logout-all) instantly
// invalidates every outstanding session without a KV list-and-delete.
// ============================================================

const KV_HASH = 'access_hash'
const KV_SESSION_GEN = 'session_generation'

// Legacy (pre-audit-1.3) static salt — kept ONLY to verify old hashes
// during the migration window. New hashes never use it.
const LEGACY_SALT = 'nexus.access.v1:'

// PBKDF2 parameters (audit 1.3). 100k iterations is the documented safe
// ceiling for Workers' native WebCrypto and is GPU-hostile enough for a
// 16+ char minimum password. Iterations are encoded per-hash, so this
// constant can be raised later without breaking stored hashes.
const PBKDF2_ITERATIONS = 100_000
const PBKDF2_SALT_BYTES = 16
const PBKDF2_KEY_BYTES = 32
const PBKDF2_PREFIX = 'pbkdf2'

// Rate-limit window: max 5 attempts per IP per 60 s.
const RL_MAX = 5
const RL_WINDOW_S = 60
const RL_PREFIX = 'rl:auth:'

// Session token settings
const SESSION_PREFIX = 'session:'
const SESSION_TTL_S = 86400 // 24 hours

// FIX #1 — minimum password length raised to 16 characters.
const MIN_PASSWORD_LENGTH = 16

// Sentinel returned by getAccessHash when the password is pinned by the
// ACCESS_PASSWORD secret. The gate only needs truthiness ("is the gate
// configured?"); verification goes through verifyAccessPassword, so we
// never derive a hash per-request (PBKDF2 on every gate check would burn
// Worker CPU for nothing).
export const ENV_PASSWORD_SENTINEL = 'env:ACCESS_PASSWORD'

// ── hex helpers ─────────────────────────────────────────────────────────

function toHex(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

function randomHex(byteLength: number): string {
  const bytes = new Uint8Array(byteLength)
  crypto.getRandomValues(bytes)
  return toHex(bytes)
}

// Constant-time string compare — used for password/hash comparison so a
// timing oracle can't leak prefix matches.
export function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// ── password hashing (audit 1.3) ────────────────────────────────────────

async function pbkdf2Hex(password: string, saltHex: string, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: hexToBytes(saltHex), iterations },
    key,
    PBKDF2_KEY_BYTES * 8,
  )
  return toHex(bits)
}

async function legacySha256Hex(password: string): Promise<string> {
  const data = new TextEncoder().encode(LEGACY_SALT + password)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return toHex(digest)
}

// A bare 64-char hex string is a legacy single-pass SHA-256 hash.
export function isLegacyHash(stored: string): boolean {
  return /^[0-9a-f]{64}$/.test(stored)
}

/**
 * Hash a password for storage. PBKDF2-SHA256, per-hash random salt,
 * iterations encoded in the stored string:
 *
 *   pbkdf2$100000$<saltHex32>$<hashHex64>
 *
 * NOTE: output is non-deterministic (random salt). Use verifyPassword()
 * to check a candidate against a stored hash — never re-hash and compare.
 */
export async function hashPassword(password: string): Promise<string> {
  const saltHex = randomHex(PBKDF2_SALT_BYTES)
  const hashHex = await pbkdf2Hex(password, saltHex, PBKDF2_ITERATIONS)
  return `${PBKDF2_PREFIX}$${PBKDF2_ITERATIONS}$${saltHex}$${hashHex}`
}

/**
 * Verify a candidate password against a stored hash. Supports both the
 * PBKDF2 format and legacy single-pass SHA-256 hashes (migration window).
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (stored.startsWith(PBKDF2_PREFIX + '$')) {
    const parts = stored.split('$')
    if (parts.length !== 4) return false
    const iterations = parseInt(parts[1], 10)
    const saltHex = parts[2]
    const expected = parts[3]
    if (!Number.isFinite(iterations) || iterations < 1 || !saltHex || !expected) return false
    const actual = await pbkdf2Hex(password, saltHex, iterations)
    return timingSafeEqualStr(actual, expected)
  }
  if (isLegacyHash(stored)) {
    return timingSafeEqualStr(await legacySha256Hex(password), stored)
  }
  return false
}

// ── access-gate credential resolution ───────────────────────────────────

// Resolve the active access-gate credential.
//
// Precedence:
//   1. ACCESS_PASSWORD env secret (authoritative when set) → returns the
//      ENV_PASSWORD_SENTINEL marker. The gate is active the instant the
//      worker boots; verification compares against the secret directly in
//      verifyAccessPassword (constant-time), so no hash is derived here.
//   2. KV `access_hash` (the dashboard bootstrap/change flow).
//   3. null → unconfigured (the gate fails closed, audit 1.2).
export async function getAccessHash(env: Env): Promise<string | null> {
  if (env.ACCESS_PASSWORD && env.ACCESS_PASSWORD.length > 0) {
    return ENV_PASSWORD_SENTINEL
  }
  if (!env.CONFIG) return null
  return env.CONFIG.get(KV_HASH)
}

/**
 * Verify a candidate password against the active credential, whatever its
 * source. Audit 1.3 migration lives here: a legacy SHA-256 KV hash that
 * verifies successfully is immediately re-written as PBKDF2.
 */
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
    // Migration on successful login: upgrade the stored hash to PBKDF2.
    await env.CONFIG.put(KV_HASH, await hashPassword(password))
  }
  return ok
}

// Whether the password is pinned by the ACCESS_PASSWORD secret (so the
// runtime change flow is disabled — rotate via the secret instead).
function isEnvPasswordActive(env: Env): boolean {
  return Boolean(env.ACCESS_PASSWORD && env.ACCESS_PASSWORD.length > 0)
}

// ── sessions (audit 1.5) ────────────────────────────────────────────────

interface SessionRecord {
  v: 1
  createdAt: string
  ip: string
  gen: number
}

/** Current session generation. Sessions minted under an older generation
 *  are invalid — bumping the counter is the global "revoke all". */
export async function getSessionGeneration(env: Env): Promise<number> {
  if (!env.CONFIG) return 0
  const raw = await env.CONFIG.get(KV_SESSION_GEN)
  if (!raw) return 0
  const n = parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** Invalidate every outstanding session (password change / logout-all). */
export async function bumpSessionGeneration(env: Env): Promise<number> {
  const next = (await getSessionGeneration(env)) + 1
  await env.CONFIG.put(KV_SESSION_GEN, String(next))
  return next
}

function generateToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return toHex(bytes)
}

/** Mint a session bound to the current generation, recording origin
 *  metadata (audit 1.5: createdAt + IP, cheap forensics). */
export async function createSession(env: Env, ip: string): Promise<string> {
  const token = generateToken()
  const record: SessionRecord = {
    v: 1,
    createdAt: new Date().toISOString(),
    ip,
    gen: await getSessionGeneration(env),
  }
  await env.CONFIG.put(SESSION_PREFIX + token, JSON.stringify(record), {
    expirationTtl: SESSION_TTL_S,
  })
  return token
}

// Validate a bearer token by checking KV.
//
// Legacy sessions (value '1', minted before audit 1.5) stay valid only
// while the generation counter is still 0 — the first bump retires them
// all, which is exactly the semantics we want from "revoke everything".
export async function validateSessionToken(env: Env, token: string): Promise<boolean> {
  if (!token || !env.CONFIG) return false
  const stored = await env.CONFIG.get(SESSION_PREFIX + token)
  if (!stored) return false
  const gen = await getSessionGeneration(env)
  if (stored === '1') return gen === 0
  try {
    const record = JSON.parse(stored) as SessionRecord
    return record.gen === gen
  } catch {
    return false
  }
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

function clientIp(headers: { get(name: string): string | null }): string {
  return (
    headers.get('cf-connecting-ip') ||
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  )
}

export const authRoutes = new Hono<{ Bindings: Env }>()

// Whether a password has been set (so the UI knows to show login vs setup).
authRoutes.get('/status', async (c) => {
  const hash = await getAccessHash(c.env)
  return c.json({ protected: Boolean(hash) })
})

// Exchange a password for a session token.
authRoutes.post('/login', async (c) => {
  const ip = clientIp(c.req.raw.headers)
  if (!(await checkRateLimit(c.env, ip))) {
    return c.json({ error: 'Too many attempts. Try again in a minute.' }, 429)
  }

  const { password } = await c.req.json<{ password?: string }>()
  const configured = await getAccessHash(c.env)
  if (!configured) return c.json({ error: 'No password set yet' }, 400)
  if (!password || !(await verifyAccessPassword(c.env, password))) {
    return c.json({ error: 'Wrong password' }, 401)
  }

  const token = await createSession(c.env, ip)
  return c.json({ token })
})

// Revoke EVERY outstanding session (including this one) by bumping the
// generation counter. Requires a currently-valid bearer token — the gate
// keeps /api/auth/* open, so this route authenticates itself.
authRoutes.post('/logout-all', async (c) => {
  const auth = c.req.header('Authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token || !(await validateSessionToken(c.env, token))) {
    return c.json({ error: 'Unauthorized', code: 'auth_required' }, 401)
  }
  await bumpSessionGeneration(c.env)
  return c.json({ ok: true })
})

// Set (first time) or change the password.
// - First time: requires the MONEY_MACHINE_TOKEN bearer (bootstrap gate) so
//   that an internet scanner who reaches the worker before the owner can't
//   set a password and lock the owner out. The token is already a required
//   server secret for /api/money-machine, so reusing it costs nothing.
//   If MONEY_MACHINE_TOKEN is unset, bootstrap is allowed without auth and
//   logs a warning — keeps the legacy local-dev workflow alive.
// - Change: must present the current password (no token needed). A
//   successful change bumps the session generation, so every session minted
//   under the old password dies immediately (audit 1.5).
authRoutes.post('/setup', async (c) => {
  const ip = clientIp(c.req.raw.headers)
  if (!(await checkRateLimit(c.env, ip))) {
    return c.json({ error: 'Too many attempts. Try again in a minute.' }, 429)
  }

  // When the password is pinned by the ACCESS_PASSWORD secret, runtime
  // changes are meaningless (getAccessHash always reports the env secret, so
  // a KV write would be silently shadowed). Reject clearly and tell the
  // owner where to rotate it.
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

  const existing = await getAccessHash(c.env)
  if (!existing) {
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

  if (existing) {
    // Password CHANGE: kill every session minted under the old password
    // before issuing a fresh one (audit 1.5 — rotation on privilege change).
    await bumpSessionGeneration(c.env)
  }

  const token = await createSession(c.env, ip)
  return c.json({ ok: true, token })
})

// FIX #2 — /auth/disable is permanently removed.
// Allowing the gate to be disabled in production creates a route that can be
// social-engineered or accidentally triggered. Remove it entirely; if you ever
// need to reset the gate, delete the KV key directly from the Cloudflare
// dashboard (Workers → KV → CONFIG → delete "access_hash").
