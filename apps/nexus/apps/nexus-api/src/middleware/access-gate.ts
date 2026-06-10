// Access gate — the single choke-point in front of every /api route.
//
// T17 (audit Worker API auth on every route): this rule used to live inline
// in index.ts, which made it impossible to unit-test and easy to drift the
// day someone mounts a router outside `/api`. It now lives here, is mounted
// once via `api.use('*', accessGate())`, and is covered by access-gate.test.ts
// so the "every /api route requires a valid bearer token once a password is
// configured" invariant can't silently break.
//
// Open by design (must stay reachable without a token):
//   - /api/auth/*          login / logout / session bootstrap — open in EVERY
//                          state, otherwise the owner could never set or
//                          present a password
//   - /api/assets/*        asset URLs load via <img>/downloads that can't
//                          carry an Authorization header (only once configured)
//   - /api/email/subscribe public newsletter signup, rate-limited (only once
//                          configured)
//
// FAIL-CLOSED (audit 1.2): when NO password is configured (no ACCESS_PASSWORD
// secret and no access_hash in KV), every /api route EXCEPT /api/auth/* returns
// 403 setup_required. A fresh deploy is locked until the owner completes the
// bootstrap flow via /api/auth/setup — there is no "open until a password is
// set" state anymore. Setting the ACCESS_PASSWORD secret activates the gate
// the instant the worker boots.

import type { MiddlewareHandler } from 'hono'
import type { Env } from '../env'
import { getAccessHash, validateSessionToken } from '../routes/auth'
import { createLogger } from '@nexus/logger'

const logger = createLogger({ service: 'nexus-api' })

// Reachable without a bearer token in EVERY state, including unconfigured.
// This must contain exactly the auth surface and nothing else — it is the
// only thing standing between an unconfigured deploy and the internet.
const ALWAYS_OPEN_PREFIXES = ['/api/auth/'] as const

// Additionally reachable without a bearer token ONCE a password is configured.
// Keep this list tiny — every entry here is an unauthenticated surface, so
// widening it should be a deliberate, reviewed change (the test asserts the
// exact set).
const OPEN_WHEN_CONFIGURED_PREFIXES = ['/api/assets/'] as const

/**
 * Per-IP rate limit for /api/email/subscribe.
 *
 * Backed by the CONFIG KV namespace (60-second windows, 5 requests per
 * IP per window). Returns `true` if the request should be rejected.
 *
 * Errors against KV are non-fatal — we let the request through rather
 * than block the public signup form because of an infra hiccup. The KV
 * miss / outage path is logged so we can spot it.
 */
export async function emailSubscribeRateLimit(env: Env, req: Request): Promise<boolean> {
  const limit = 5
  const windowSec = 60
  const ip =
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  const bucket = Math.floor(Date.now() / 1000 / windowSec)
  const key = `ratelimit:email-subscribe:${ip}:${bucket}`
  try {
    const current = await env.CONFIG.get(key)
    const count = current ? parseInt(current, 10) || 0 : 0
    if (count >= limit) return true
    // KV writes settle eventually, but for short windows the read-after-
    // write skew is well under the window length, so this is fine.
    await env.CONFIG.put(key, String(count + 1), { expirationTtl: windowSec * 2 })
    return false
  } catch (err) {
    logger.warn('email-subscribe rate-limit KV error', {
      error: err instanceof Error ? err.message : String(err),
    })
    return false
  }
}

/**
 * The access gate. Mount once on the /api router:
 *
 *   api.use('*', accessGate())
 *
 * Policy (audit 1.2 — fail-closed):
 *   unconfigured  → only /api/auth/* responds; everything else 403 setup_required
 *   configured    → /api/auth/*, /api/assets/* and the rate-limited
 *                   /api/email/subscribe are open; everything else needs a
 *                   valid bearer session token (401 otherwise)
 */
export function accessGate(): MiddlewareHandler<{ Bindings: Env }> {
  return async (c, next) => {
    if (c.req.method === 'OPTIONS') return next()
    const path = c.req.path // full path, e.g. /api/auth/login

    // The auth surface is reachable in every state — it's how the owner
    // bootstraps the password and how anyone gets a session token.
    if (ALWAYS_OPEN_PREFIXES.some((p) => path.startsWith(p))) return next()

    // FAIL-CLOSED: nothing else responds until a password is configured.
    // A fresh deploy without ACCESS_PASSWORD used to be wide open here
    // ("not protected yet"); now it refuses everything and points at setup.
    const hash = await getAccessHash(c.env)
    if (!hash) {
      logger.warn('access gate refused request on unconfigured deploy', { path })
      return c.json(
        {
          error: 'Access gate is not configured. Set a password via /api/auth/setup.',
          code: 'setup_required',
        },
        403,
      )
    }

    // /api/email/subscribe is unauthenticated by design (public newsletter
    // signup). AUDIT-PR20 #11: that makes it spammable into D1, so we
    // apply a simple per-IP rate-limit before letting it through.
    if (path === '/api/email/subscribe') {
      const limited = await emailSubscribeRateLimit(c.env, c.req.raw)
      if (limited) {
        return c.json(
          { error: 'rate_limited', message: 'Too many requests. Try again later.' },
          429,
        )
      }
      return next()
    }

    if (OPEN_WHEN_CONFIGURED_PREFIXES.some((p) => path.startsWith(p))) return next()
    const auth = c.req.header('Authorization') || ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
    if (!token) return c.json({ error: 'Unauthorized', code: 'auth_required' }, 401)
    const valid = await validateSessionToken(c.env, token)
    if (!valid) return c.json({ error: 'Unauthorized', code: 'auth_required' }, 401)
    return next()
  }
}
