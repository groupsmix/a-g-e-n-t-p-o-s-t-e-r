import type { Context, Next } from 'hono'
import type { Env } from '../env'

const windowMs = 60_000
const requests = new Map<string, { count: number; resetAt: number }>()

export function rateLimit(maxPerMinute: number) {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    const key = `${c.req.path}:${c.req.header('authorization') ?? 'anon'}`
    const now = Date.now()
    const entry = requests.get(key)

    if (entry && now < entry.resetAt) {
      if (entry.count >= maxPerMinute) {
        return c.json(
          { error: 'Too many requests. Please wait before trying again.' },
          429,
        )
      }
      requests.set(key, { count: entry.count + 1, resetAt: entry.resetAt })
    } else {
      requests.set(key, { count: 1, resetAt: now + windowMs })
    }

    return next()
  }
}
