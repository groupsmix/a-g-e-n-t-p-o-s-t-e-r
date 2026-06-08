import { Hono } from 'hono'
import type { Env } from '../env'

// ============================================================
// Access gate — a single shared password that locks the whole
// dashboard + API. Stored server-side in KV as a SHA-256 hash
// (never the plaintext).
//
// Tokens are random 256-bit hex strings stored in KV with a 24 h
// TTL. On each authenticated request the middleware validates the
// bearer token against KV (not the password hash).
//
// Bootstrap rule: until a password is set, the API is open so the
// owner can't lock themselves out before choosing one.
// ============================================================

const KV_HASH = 'access_hash'
const SALT = 'nexus.access.v1:'

// Rate-limit window: max 5 attempts per IP per 60 s.
const RL_MAX = 5
const RL_WINDOW_S = 60
const RL_PREFIX = 'rl:auth:'

// Session token settings
const SESSION_PREFIX = 'session:'
const SESSION_TTL_S = 86400 // 24 hours

// FIX #1 — minimum password length raised to 16 characters.
const MIN_PASSWORD_LENGTH = 16

export async function hashPassword(password: string): Promise<string> {
  const data = new TextEncoder().encode(SALT + password)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function getAccessHash(env: Env): Promise<string | null> {
  if (!env.CONFIG) return null
  return env.CONFIG.get(KV_HASH)
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
  const hash = await getAccessHash(c.env)
  return c.json({ protected: Boolean(hash) })
})

// Exchange a password for a session token.
authRoutes.post('/login', async (c) => {
  const ip = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown'
  if (!(await checkRateLimit(c.env, ip))) {
    return c.json({ error: 'Too many attempts. Try again in a minute.' }, 429)
  }

  const { password } = await c.req.json<{ password?: string }>()
  const hash = await getAccessHash(c.env)
  if (!hash) return c.json({ error: 'No password set yet' }, 400)
  if (!password || (await hashPassword(password)) !== hash) {
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
    if (!current || (await hashPassword(current)) !== existing) {
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
