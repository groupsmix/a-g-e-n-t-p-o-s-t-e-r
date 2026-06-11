import { Hono } from 'hono'
import type { Env } from '../env'
import { rateLimit } from '../middleware/rate-limit'
import type { Offer } from '@posteragent/types/nexus'


// ── Types ────────────────────────────────────────────────────

interface OfferRow {
  id: string
  venture_id: string
  platform_id: string | null
  title: string | null
  description: string | null
  price_cents: number
  currency: string
  variant_type: string | null
  variant_data: string
  status: string
  published_at: string | null
  external_listing_id: string | null
  external_url: string | null
  created_at: string
  updated_at: string
}


interface TrackedLinkRow {
  id: string
  offer_id: string
  channel: string
  slug: string
  destination_url: string
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_content: string | null
  utm_term: string | null
  created_at: string
}

export const offerRoutes = new Hono<{ Bindings: Env }>()

// ── Create offer ───────────────────────────────────────────────

  .post('/', rateLimit(10), async (c) => {
  const body = await c.req.json<{
    venture_id: string
    platform_id?: string
    title?: string
    description?: string
    price_cents: number
    currency?: string
    variant_type?: string
    variant_data?: Record<string, unknown>
  }>()

  if (!body.venture_id || body.price_cents === undefined) {
    return c.json({ error: 'Missing required fields: venture_id, price_cents' }, 400)
  }

  if (body.price_cents < 0) {
    return c.json({ error: 'price_cents must be >= 0' }, 400)
  }

  // Validate venture exists
  const venture = await c.env.DB.prepare('SELECT id FROM ventures WHERE id = ?')
    .bind(body.venture_id)
    .first<{ id: string }>()

  if (!venture) {
    return c.json({ error: 'Venture not found' }, 404)
  }

  const id = crypto.randomUUID().replace(/-/g, '')

  await c.env.DB.prepare(`
    INSERT INTO offers (
      id, venture_id, platform_id, title, description,
      price_cents, currency, variant_type, variant_data, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    body.venture_id,
    body.platform_id ?? null,
    body.title ?? null,
    body.description ?? null,
    body.price_cents,
    body.currency ?? 'USD',
    body.variant_type ?? null,
    JSON.stringify(body.variant_data ?? {}),
    'draft'
  ).run()

  const offer = await c.env.DB.prepare('SELECT * FROM offers WHERE id = ?')
    .bind(id)
    .first<OfferRow>()

  if (!offer) {
    return c.json({ error: 'Failed to create offer' }, 500)
  }

  return c.json({ offer: mapOfferRow(offer) }, 201)
})


// ── List offers ───────────────────────────────────────────────

  .get('/', async (c) => {
  const ventureId = c.req.query('venture_id')
  const opportunityId = c.req.query('opportunity_id')
  const platform = c.req.query('platform')
  const status = c.req.query('status')

  let query = 'SELECT * FROM offers WHERE 1=1'
  const params: unknown[] = []

  if (ventureId) {
    query += ' AND venture_id = ?'
    params.push(ventureId)
  }
  if (opportunityId) {
    query += ' AND venture_id IN (SELECT id FROM ventures WHERE opportunity_id = ?)'
    params.push(opportunityId)
  }
  if (platform) {
    query += ' AND platform_id = ?'
    params.push(platform)
  }
  if (status) {
    query += ' AND status = ?'
    params.push(status)
  }

  query += ' ORDER BY created_at DESC'

  const result = await c.env.DB.prepare(query).bind(...params).all<OfferRow>()
  const offers = (result.results ?? []).map(mapOfferRow)

  return c.json({ offers })
})


// ── Get single offer with details ───────────────────────────────

  .get('/:id', async (c) => {
  const { id } = c.req.param()

  const offer = await c.env.DB.prepare('SELECT * FROM offers WHERE id = ?')
    .bind(id)
    .first<OfferRow>()

  if (!offer) {
    return c.json({ error: 'Not found' }, 404)
  }

  // Get tracked links
  const linksResult = await c.env.DB.prepare('SELECT * FROM tracked_links WHERE offer_id = ?')
    .bind(id)
    .all<TrackedLinkRow>()

  // Get economic events summary
  const eventsResult = await c.env.DB.prepare(`
    SELECT 
      event_type,
      SUM(amount_cents) as total_amount_cents,
      COUNT(*) as count
    FROM economic_events
    WHERE offer_id = ?
    GROUP BY event_type
  `).bind(id).all<{ event_type: string; total_amount_cents: number; count: number }>()

  const eventSummary = (eventsResult.results ?? []).reduce((acc, row) => {
    acc[row.event_type] = {
      total_cents: row.total_amount_cents,
      count: row.count,
    }
    return acc
  }, {} as Record<string, { total_cents: number; count: number }>)

  return c.json({
    offer: mapOfferRow(offer),
    tracked_links: (linksResult.results ?? []).map(mapTrackedLinkRow),
    economic_events_summary: eventSummary,
  })
})


// ── Update offer ───────────────────────────────────────────────

  .patch('/:id', async (c) => {
  const { id } = c.req.param()
  const body = await c.req.json<{
    title?: string
    description?: string
    price_cents?: number
    asset_bundle_id?: string
  }>()

  if (body.price_cents !== undefined && body.price_cents < 0) {
    return c.json({ error: 'price_cents must be >= 0' }, 400)
  }

  const updates: string[] = []
  const params: unknown[] = []

  if (body.title !== undefined) {
    updates.push('title = ?')
    params.push(body.title)
  }
  if (body.description !== undefined) {
    updates.push('description = ?')
    params.push(body.description)
  }
  if (body.price_cents !== undefined) {
    updates.push('price_cents = ?')
    params.push(body.price_cents)
  }
  if (body.asset_bundle_id !== undefined) {
    updates.push('asset_bundle_id = ?')
    params.push(body.asset_bundle_id)
  }

  if (updates.length === 0) {
    // No updates, return current offer
    const current = await c.env.DB.prepare('SELECT * FROM offers WHERE id = ?')
      .bind(id)
      .first<OfferRow>()
    if (!current) return c.json({ error: 'Not found' }, 404)
    return c.json({ offer: mapOfferRow(current) })
  }

  updates.push("updated_at = datetime('now')")
  params.push(id)

  await c.env.DB.prepare(`
    UPDATE offers SET ${updates.join(', ')} WHERE id = ?
  `).bind(...params).run()

  const updated = await c.env.DB.prepare('SELECT * FROM offers WHERE id = ?')
    .bind(id)
    .first<OfferRow>()

  if (!updated) {
    return c.json({ error: 'Not found' }, 404)
  }

  return c.json({ offer: mapOfferRow(updated) })
})


// ── Approve offer ─────────────────────────────────────────────

  .patch('/:id/approve', async (c) => {
  const { id } = c.req.param()

  // Get venture_id for logging allocator action
  const offer = await c.env.DB.prepare('SELECT venture_id FROM offers WHERE id = ?')
    .bind(id)
    .first<{ venture_id: string }>()

  if (!offer) {
    return c.json({ error: 'Not found' }, 404)
  }

  // Set status to approved
  await c.env.DB.prepare(`
    UPDATE offers SET status = 'approved', updated_at = datetime('now') WHERE id = ?
  `).bind(id).run()

  // Log allocator action
  await c.env.DB.prepare(`
    INSERT INTO allocator_actions (venture_id, action_type, reason, confidence, data_before, data_after)
    VALUES (?, 'approve_offer', 'manual_approval', 1, '{}', '{}')
  `).bind(offer.venture_id).run()

  const updated = await c.env.DB.prepare('SELECT * FROM offers WHERE id = ?')
    .bind(id)
    .first<OfferRow>()

  return c.json({ offer: mapOfferRow(updated!) })
})


// ── Pause offer ───────────────────────────────────────────────

  .patch('/:id/pause', async (c) => {
  const { id } = c.req.param()

  const offer = await c.env.DB.prepare('SELECT venture_id FROM offers WHERE id = ?')
    .bind(id)
    .first<{ venture_id: string }>()

  if (!offer) {
    return c.json({ error: 'Not found' }, 404)
  }

  await c.env.DB.prepare(`
    UPDATE offers SET status = 'paused', updated_at = datetime('now') WHERE id = ?
  `).bind(id).run()

  await c.env.DB.prepare(`
    INSERT INTO allocator_actions (venture_id, action_type, reason, confidence, data_before, data_after)
    VALUES (?, 'pause_offer', 'manual_pause', 1, '{}', '{}')
  `).bind(offer.venture_id).run()

  const updated = await c.env.DB.prepare('SELECT * FROM offers WHERE id = ?')
    .bind(id)
    .first<OfferRow>()

  return c.json({ offer: mapOfferRow(updated!) })
})


// ── Kill offer ────────────────────────────────────────────────

  .patch('/:id/kill', async (c) => {
  const { id } = c.req.param()

  const offer = await c.env.DB.prepare('SELECT venture_id FROM offers WHERE id = ?')
    .bind(id)
    .first<{ venture_id: string }>()

  if (!offer) {
    return c.json({ error: 'Not found' }, 404)
  }

  await c.env.DB.prepare(`
    UPDATE offers SET status = 'killed', updated_at = datetime('now') WHERE id = ?
  `).bind(id).run()

  await c.env.DB.prepare(`
    INSERT INTO allocator_actions (venture_id, action_type, reason, confidence, data_before, data_after)
    VALUES (?, 'kill_offer', 'manual_kill', 1, '{}', '{}')
  `).bind(offer.venture_id).run()

  const updated = await c.env.DB.prepare('SELECT * FROM offers WHERE id = ?')
    .bind(id)
    .first<OfferRow>()

  return c.json({ offer: mapOfferRow(updated!) })
})


// ── Clone offer ───────────────────────────────────────────────

  .post('/:id/clone', async (c) => {
  const { id } = c.req.param()

  const original = await c.env.DB.prepare('SELECT * FROM offers WHERE id = ?')
    .bind(id)
    .first<OfferRow>()

  if (!original) {
    return c.json({ error: 'Not found' }, 404)
  }

  const newId = crypto.randomUUID().replace(/-/g, '')

  await c.env.DB.prepare(`
    INSERT INTO offers (
      id, venture_id, platform_id, title, description,
      price_cents, currency, variant_type, variant_data, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    newId,
    original.venture_id,
    original.platform_id,
    `${original.title} (Copy)` || null,
    original.description,
    original.price_cents,
    original.currency,
    original.variant_type,
    original.variant_data,
    'draft'
  ).run()

  const cloned = await c.env.DB.prepare('SELECT * FROM offers WHERE id = ?')
    .bind(newId)
    .first<OfferRow>()

  return c.json({ offer: mapOfferRow(cloned!) }, 201)
})


// ── Helpers ──────────────────────────────────────────────────

function mapOfferRow(row: OfferRow): Offer {
  return {
    id: row.id,
    venture_id: row.venture_id,
    platform_id: row.platform_id,
    title: row.title,
    description: row.description,
    price_cents: row.price_cents,
    currency: row.currency,
    variant_type: row.variant_type,
    variant_data: row.variant_data,
    status: row.status as Offer['status'],
    published_at: row.published_at,
    external_listing_id: row.external_listing_id,
    external_url: row.external_url,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}


function mapTrackedLinkRow(row: TrackedLinkRow) {
  return {
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
  }
}
