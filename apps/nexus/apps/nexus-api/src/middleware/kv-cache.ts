import type { Context, Next } from 'hono'
import type { Env } from '../env'

export function kvCache(ttlSeconds = 30) {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    if (!c.env.CONFIG) return next()

    const key = `cache:${c.req.path}`
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
