import type { Context, Next } from 'hono'
import type { Env } from '../env'

// Audit #6: only idempotent GETs are cached, and the cache key includes the
// full path AND query string so distinct queries (e.g. ?limit=10 vs ?limit=50)
// never collide. Non-GET requests pass straight through.
export function kvCache(ttlSeconds = 30) {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    if (!c.env.CONFIG) return next()
    if (c.req.method !== 'GET') return next()

    const url = new URL(c.req.url)
    const key = `cache:GET:${url.pathname}${url.search}`
    const cached = await c.env.CONFIG.get(key)
    if (cached) {
      return c.json(JSON.parse(cached))
    }

    await next()

    if (c.res.ok) {
      const body = await c.res.clone().text()
      c.executionCtx.waitUntil(
        c.env.CONFIG.put(key, body, { expirationTtl: ttlSeconds }),
      )
    }
  }
}
