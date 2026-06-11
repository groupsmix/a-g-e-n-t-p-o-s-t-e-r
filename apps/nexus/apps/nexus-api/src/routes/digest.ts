import { Hono } from 'hono'
import type { Env } from '../env'
import { buildDigest, generateAndStoreDigest, getDigestHistory, digestMarkdown } from '../services/digest'
import { sendEmail } from './schedules'

export const digestRoutes = new Hono<{ Bindings: Env }>()

// GET /digest — live "today" data (not stored, always fresh).
  .get('/', async (c) => {
  const digest = await buildDigest(c.env)
  return c.json(digest)
})


// GET /digest/today — same as above but explicit name.
  .get('/today', async (c) => {
  const digest = await buildDigest(c.env)
  return c.json(digest)
})


// GET /digest/history — past stored digests.
  .get('/history', async (c) => {
  const limit = Number(c.req.query('limit')) || 30
  const digests = await getDigestHistory(c.env, limit)
  return c.json({ digests })
})


// POST /digest/generate — manually trigger + store today's digest.
  .post('/generate', async (c) => {
  const digest = await generateAndStoreDigest(c.env)
  return c.json({ ok: true, digest })
})


// POST /digest/email — send the digest via email right now.
  .post('/email', async (c) => {
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>
  const to = typeof body.to === 'string' ? body.to : null
  const digest = await buildDigest(c.env)
  const status = await sendEmail(c.env, to, `NEXUS morning report — ${digest.date}`, digestMarkdown(digest))
  return c.json({ ok: status === 'sent', status, digest })
})
