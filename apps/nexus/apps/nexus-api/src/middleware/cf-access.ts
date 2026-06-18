// FIX #5 — Cloudflare Access JWT verification middleware
//
// HOW TO ENABLE:
// 1. Go to Cloudflare Zero Trust → Access → Applications → Add an application.
// 2. Set the application domain to your nexus-api worker route
//    (e.g. nexus-api.simohamed.workers.dev).
// 3. Set the team domain to your Cloudflare Access team
//    (e.g. yourteam.cloudflareaccess.com) and note it for CF_ACCESS_TEAM_DOMAIN.
// 4. Set the Application Audience (AUD) tag from the Access app settings page.
//    Add it as a wrangler secret: wrangler secret put CF_ACCESS_AUD
// 5. Add CF_ACCESS_TEAM_DOMAIN as a secret: wrangler secret put CF_ACCESS_TEAM_DOMAIN
// 6. Mount this middleware in index.ts BEFORE the CORS middleware on all /api routes
//    (see example at the bottom of this file).
//
// After setup, only requests that pass through Cloudflare Access reach the Worker.
// Cloudflare strips the CF-Access-Jwt-Assertion header from requests that haven't
// been authenticated, so the Worker can trust its presence and verify the signature.

import type { MiddlewareHandler } from 'hono'
import type { Env } from '../env'

// Cloudflare Access public key JWKS endpoint format.
// Replace <team> with your Cloudflare Zero Trust team name.
function certsUrl(teamDomain: string): string {
  return `https://${teamDomain}/cdn-cgi/access/certs`
}

// Decode a base64url string to a Uint8Array.
function base64UrlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/').padEnd(str.length + ((4 - (str.length % 4)) % 4), '=')
  const raw = atob(base64)
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

// Verify the CF-Access JWT.
async function verifyAccessJWT(token: string, aud: string, teamDomain: string): Promise<boolean> {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return false

    // Fetch public keys from Cloudflare.
    const jwksRes = await fetch(certsUrl(teamDomain), { cf: { cacheEverything: true, cacheTtl: 600 } } as RequestInit)
    if (!jwksRes.ok) return false
    const jwks = await jwksRes.json<{ keys: Array<{ kid: string; n: string; e: string; kty: string }> }>()

    // Decode the header to find which key to use.
    const header = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[0]))) as { kid: string; alg: string }
    const jwk = jwks.keys.find((k) => k.kid === header.kid)
    if (!jwk) return false

    // Import the public key.
    const key = await crypto.subtle.importKey(
      'jwk',
      jwk as unknown as JsonWebKey,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    )

    // Verify the signature.
    const signingInput = new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
    const signature = base64UrlDecode(parts[2])
    const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, signingInput)
    if (!valid) return false

    // Verify aud and exp claims.
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1]))) as {
      aud: string | string[]
      exp: number
    }
    const audMatch = Array.isArray(payload.aud) ? payload.aud.includes(aud) : payload.aud === aud
    const notExpired = payload.exp > Math.floor(Date.now() / 1000)
    return audMatch && notExpired
  } catch {
    return false
  }
}

// Middleware — mount this on the routes you want behind Cloudflare Access.
// Paths in `bypassPaths` are checked WITHOUT CF Access (public webhook receivers, etc.).
export function cfAccessMiddleware(bypassPaths: string[] = []): MiddlewareHandler<{ Bindings: Env & { CF_ACCESS_AUD?: string; CF_ACCESS_TEAM_DOMAIN?: string } }> {
  return async (c, next) => {
    // Allow OPTIONS through (CORS preflight).
    if (c.req.method === 'OPTIONS') return next()

    // Allow explicitly bypassed paths.
    const path = c.req.path
    if (bypassPaths.some((p) => path.startsWith(p))) return next()

    const aud = c.env.CF_ACCESS_AUD
    const teamDomain = c.env.CF_ACCESS_TEAM_DOMAIN

    // If not configured, skip verification (dev environment).
    if (!aud || !teamDomain) return next()

    const jwt = c.req.header('CF-Access-Jwt-Assertion')
    if (!jwt) {
      return c.json({ error: 'Access denied' }, 403)
    }

    const valid = await verifyAccessJWT(jwt, aud, teamDomain)
    if (!valid) {
      return c.json({ error: 'Access denied' }, 403)
    }

    return next()
  }
}

// ---------------------------------------------------------------
// How to mount in index.ts (add BEFORE the existing cors() call):
//
//   import { cfAccessMiddleware } from './middleware/cf-access'
//
//   // Protect everything except public asset downloads and email subscribe.
//   app.use('*', cfAccessMiddleware(['/api/assets/', '/api/email/subscribe']))
//   app.use('*', cors({ ... }))
// ---------------------------------------------------------------
