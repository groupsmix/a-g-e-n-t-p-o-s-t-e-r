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
//   - /api/auth/*          login / logout / session bootstrap
//   - /api/assets/*        asset URLs load via <img>/downloads that can't
//                          carry an Authorization header
//   - /api/email/subscribe public newsletter signup (rate-limited instead)
//
// The gate is inactive only when NO password is configured. Setting the
// ACCESS_PASSWORD secret makes it active the instant the worker boots (no
// "open until a password is set" window); otherwise it activates once a
// password is set via the dashboard.

import type { MiddlewareHandler } from 'hono'
import type { Env } from '../env'
import { getAccessHash, validateSessionToken } from '../routes/auth'
import { createLogger } from '@nexus/logger'

const logger = createLogger({ service: 'nexus-api' })

// Path prefixes under /api that must stay reachable without a bearer token.
// Anything NOT matching these (and not the public subscribe endpoint below)
// is gated the moment a password is configured. Keep this list tiny — every
// entry here is an unauthenticated surface, so widening it should be a
// deliberate, reviewed change (the test asserts the exact set).
const OPEN_PREFIXES = ['/api/auth/', '/api/assets/'] as const

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
 * Behaviour is intentionally identical to the previous inline middleware —
 * this is an extraction for testability (T17), not a policy change.
 */
export function accessGate(): MiddlewareHandler<{ Bindings: Env }> {
  return async (c, next) => {
    if (c.req.method === 'OPTIONS') return next()
    const path = c.req.path // full path, e.g. /api/auth/login

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

    if (OPEN_PREFIXES.some((p) => path.startsWith(p))) return next()
    const hash = await getAccessHash(c.env)
    if (!hash) return next() // not protected yet
    const auth = c.req.header('Authorization') || ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
    if (!token) return c.json({ error: 'Unauthorized', code: 'auth_required' }, 401)
    const valid = await validateSessionToken(c.env, token)
    if (!valid) return c.json({ error: 'Unauthorized', code: 'auth_required' }, 401)
    return next()
  }
}
