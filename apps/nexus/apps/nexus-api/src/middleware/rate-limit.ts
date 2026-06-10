import type { Context, Next } from 'hono'
import type { Env } from '../env'

// Audit #34: rate limiting used to live in a per-isolate `Map`, which reset
// whenever the isolate was recycled and was never shared between the many
// isolates Cloudflare runs concurrently — so the limits were decorative.
//
// Counters now live in KV (the CONFIG binding) using the same fixed-window
// scheme as the login limiter in routes/auth.ts. A small in-memory map is
// kept as a first layer so a hot loop inside one isolate is cut off without
// a KV round-trip, and so a KV outage degrades to the old behaviour instead
// of failing open entirely.

const WINDOW_MS = 60_000
const WINDOW_S = WINDOW_MS / 1000
const LOCAL_MAX_ENTRIES = 1_000
const local = new Map<string, { count: number; resetAt: number }>()

function clientIp(headers: { get(name: string): string | null }): string {
  return (
    headers.get('cf-connecting-ip') ||
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  )
}

// Authorization headers are part of the key (so callers do not share a
// bucket) but must never be written into KV keys verbatim — hash them.
async function fingerprint(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  )
  return [...new Uint8Array(digest).slice(0, 8)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function pruneLocal(now: number): void {
  if (local.size < LOCAL_MAX_ENTRIES) return
  for (const [key, entry] of local) {
    if (now >= entry.resetAt) local.delete(key)
  }
}

function tooMany(c: Context<{ Bindings: Env }>) {
  return c.json(
    { error: 'Too many requests. Please wait before trying again.' },
    429,
  )
}

export function rateLimit(maxPerMinute: number) {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    const now = Date.now()
    const auth = c.req.header('authorization')
    const caller = auth ? await fingerprint(auth) : clientIp(c.req.raw.headers)
    const key = `rl:${c.req.path}:${caller}`

    // Layer 1 — per-isolate fast path.
    pruneLocal(now)
    const cached = local.get(key)
    if (cached && now < cached.resetAt) {
      if (cached.count >= maxPerMinute) return tooMany(c)
      cached.count += 1
    } else {
      local.set(key, { count: 1, resetAt: now + WINDOW_MS })
    }

    // Layer 2 — shared KV counter so the limit holds across isolates,
    // recycles, and deploys.
    try {
      const nowS = Math.floor(now / 1000)
      const raw = await c.env.CONFIG.get(key)
      if (raw) {
        const rec = JSON.parse(raw) as { count: number; windowStart: number }
        if (nowS - rec.windowStart < WINDOW_S) {
          if (rec.count >= maxPerMinute) return tooMany(c)
          await c.env.CONFIG.put(
            key,
            JSON.stringify({ count: rec.count + 1, windowStart: rec.windowStart }),
            // KV enforces a 60s minimum TTL; double the window keeps the
            // record alive long enough without accumulating garbage.
            { expirationTtl: WINDOW_S * 2 },
          )
          return next()
        }
      }
      await c.env.CONFIG.put(
        key,
        JSON.stringify({ count: 1, windowStart: nowS }),
        { expirationTtl: WINDOW_S * 2 },
      )
    } catch {
      // KV hiccups must not take the route down — the in-memory layer above
      // still applies within this isolate.
    }

    return next()
  }
}
