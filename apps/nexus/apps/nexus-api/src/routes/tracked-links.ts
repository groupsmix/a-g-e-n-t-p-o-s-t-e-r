import { Hono } from 'hono'
import type { Env } from '../env'
import { rateLimit } from '../middleware/rate-limit'
import {
  createTrackedLink,
  recordClick,
  getTrackedLinkStats,
} from '../services/attribution-service'

export const trackedLinkRoutes = new Hono<{ Bindings: Env }>()

// ── Create tracked link ───────────────────────────────────────

  .post('/', rateLimit(20), async (c) => {
  const body = await c.req.json<{
    offer_id: string
    channel: string
    destination_url: string
    campaign?: string
    source?: string
    medium?: string
    content?: string
    term?: string
  }>()

  if (!body.offer_id || !body.channel || !body.destination_url) {
    return c.json(
      { error: 'Missing required fields: offer_id, channel, destination_url' },
      400
    )
  }

  // Verify offer exists
  const offer = await c.env.DB.prepare('SELECT id FROM offers WHERE id = ?')
    .bind(body.offer_id)
    .first<{ id: string }>()

  if (!offer) {
    return c.json({ error: 'Offer not found' }, 404)
  }

  try {
    const link = await createTrackedLink(c.env.DB, body)
    return c.json({ link }, 201)
  } catch (err) {
    return c.json({ error: String(err) }, 400)
  }
})


// ── List tracked links ─────────────────────────────────────────

  .get('/', async (c) => {
  const offerId = c.req.query('offer_id')

  if (!offerId) {
    return c.json({ error: 'offer_id query parameter is required' }, 400)
  }

  const result = await c.env.DB
    .prepare('SELECT * FROM tracked_links WHERE offer_id = ? ORDER BY created_at DESC')
    .bind(offerId)
    .all()

  const links = (result.results ?? []).map((row: any) => ({
    id: row.id,
    offer_id: row.offer_id,
    channel: row.channel,
    slug: row.slug,
    destination_url: row.destination_url,
    utm_source: row.utm_source,
    utm_medium: row.utm_medium,
    utm_campaign: row.utm_campaign,
    utm_content: row.utm_content,
    utm_term: row.utm_term,
    created_at: row.created_at,
  }))

  return c.json({ links })
})


// ── Get tracked link with stats ─────────────────────────────────

  .get('/:id', async (c) => {
  const { id } = c.req.param()

  const link = await c.env.DB.prepare('SELECT * FROM tracked_links WHERE id = ?')
    .bind(id)
    .first()

  if (!link) {
    return c.json({ error: 'Not found' }, 404)
  }

  const stats = await getTrackedLinkStats(c.env.DB, id)

  return c.json({
    link,
    stats,
  })
})


// ── Record click ───────────────────────────────────────────────

  .post('/:code/click', rateLimit(50), async (c) => {
  const { code } = c.req.param()
  const body = await c.req.json<{
    external_event_id?: string
    metadata?: Record<string, unknown>
  }>()

  try {
    const result = await recordClick(
      c.env.DB,
      code,
      body.external_event_id,
      body.metadata
    )
    return c.json(result)
  } catch (err) {
    return c.json({ error: String(err) }, 400)
  }
})
