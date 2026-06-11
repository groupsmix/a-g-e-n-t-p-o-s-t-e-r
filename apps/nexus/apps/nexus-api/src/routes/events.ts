import { Hono } from 'hono'
import type { Env } from '../env'
import { rateLimit } from '../middleware/rate-limit'


// ── Types ────────────────────────────────────────────────────

interface EconomicEventInput {
  event_type: 'revenue' | 'cost' | 'fee' | 'refund' | 'commission'
  opportunity_id?: string
  venture_id?: string
  offer_id?: string
  external_event_id?: string
  channel?: string
  campaign?: string
  amount_cents: number
  currency?: string
  description?: string
  category?: string
  external_provider?: string
  metadata_json?: Record<string, unknown>
  occurred_at?: string
}

export const eventRoutes = new Hono<{ Bindings: Env }>()

// ── Ingest events (batch) ─────────────────────────────────────

  .post('/ingest', rateLimit(30), async (c) => {
  const body = await c.req.json<{ events: EconomicEventInput[] }>()

  if (!Array.isArray(body.events) || body.events.length === 0) {
    return c.json({ error: 'events array is required' }, 400)
  }

  let inserted = 0
  let skippedDuplicates = 0
  const affectedVentureIds = new Set<string>()

  for (const eventInput of body.events) {
    // Resolve offer_id if not provided
    let offerId = eventInput.offer_id
    if (!offerId && eventInput.venture_id) {
      // Get first offer for this venture
      const offer = await c.env.DB.prepare('SELECT id FROM offers WHERE venture_id = ? LIMIT 1')
        .bind(eventInput.venture_id)
        .first<{ id: string }>()
      offerId = offer?.id
    } else if (!offerId && eventInput.opportunity_id) {
      // Get first offer for this opportunity
      const offer = await c.env.DB.prepare(`
        SELECT o.id FROM offers o 
        JOIN ventures v ON o.venture_id = v.id 
        WHERE v.opportunity_id = ? LIMIT 1
      `).bind(eventInput.opportunity_id).first<{ id: string }>()
      offerId = offer?.id
    }

    if (!offerId) {
      console.warn(`Cannot resolve offer_id for event, skipping: ${JSON.stringify(eventInput)}`)
      continue
    }

    // Insert event with deduplication
    const eventId = crypto.randomUUID().replace(/-/g, '')

    const result = await c.env.DB.prepare(`
      INSERT OR IGNORE INTO economic_events (
        id, offer_id, event_type, amount_cents, currency,
        description, category, external_event_id, external_provider,
        metadata, occurred_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).bind(
      eventId,
      offerId,
      eventInput.event_type,
      eventInput.amount_cents,
      eventInput.currency ?? 'USD',
      eventInput.description ?? null,
      eventInput.category ?? null,
      eventInput.external_event_id ?? null,
      eventInput.external_provider ?? null,
      JSON.stringify(eventInput.metadata_json ?? {}),
      eventInput.occurred_at ?? null,
    ).run()

    if (result.meta.changes > 0) {
      inserted++
      // Track affected venture
      const venture = await c.env.DB.prepare('SELECT venture_id FROM offers WHERE id = ?')
        .bind(offerId)
        .first<{ venture_id: string }>()
      if (venture) {
        affectedVentureIds.add(venture.venture_id)
      }
    } else {
      skippedDuplicates++
    }
  }

  // Trigger capital allocator evaluation for affected ventures (async, don't await)
  for (const ventureId of affectedVentureIds) {
    c.executionCtx.waitUntil((async () => {
      try {
        const { allocateVenture } = await import('../services/capital-allocator')
        await allocateVenture(c.env.DB, ventureId)
      } catch (err) {
        console.error(`Failed to evaluate capital allocator for venture ${ventureId}:`, err)
      }
    })())
  }

  return c.json({
    inserted,
    skipped_duplicates: skippedDuplicates,
    affected_venture_ids: Array.from(affectedVentureIds),
  })
})


// ── Get events summary by venture ──────────────────────────────

  .get('/summary', async (c) => {
  const ventureId = c.req.query('venture_id')
  const opportunityId = c.req.query('opportunity_id')

  let query = `
    SELECT 
      SUM(CASE WHEN event_type = 'revenue' THEN amount_cents ELSE 0 END) as revenue_cents,
      SUM(CASE WHEN event_type = 'refund' THEN amount_cents ELSE 0 END) as refund_cents,
      SUM(CASE WHEN event_type = 'fee' AND category = 'platform' THEN amount_cents ELSE 0 END) as platform_fee_cents,
      SUM(CASE WHEN event_type = 'fee' AND category = 'ai' THEN amount_cents ELSE 0 END) as ai_cost_cents,
      SUM(CASE WHEN event_type = 'cost' AND category = 'promotion' THEN amount_cents ELSE 0 END) as promotion_spend_cents,
      SUM(CASE WHEN event_type = 'cost' AND category = 'fulfillment' THEN amount_cents ELSE 0 END) as fulfillment_cost_cents,
      COUNT(*) as event_count
    FROM economic_events e
  `
  const params: unknown[] = []

  if (ventureId) {
    query += `
      JOIN offers o ON e.offer_id = o.id
      WHERE o.venture_id = ?
    `
    params.push(ventureId)
  } else if (opportunityId) {
    query += `
      JOIN offers o ON e.offer_id = o.id
      JOIN ventures v ON o.venture_id = v.id
      WHERE v.opportunity_id = ?
    `
    params.push(opportunityId)
  }

  const result = await c.env.DB.prepare(query).bind(...params).first<{
    revenue_cents: number
    refund_cents: number
    platform_fee_cents: number
    ai_cost_cents: number
    promotion_spend_cents: number
    fulfillment_cost_cents: number
    event_count: number
  }>()

  const revenue = result?.revenue_cents ?? 0
  const refund = result?.refund_cents ?? 0
  const platformFee = result?.platform_fee_cents ?? 0
  const aiCost = result?.ai_cost_cents ?? 0
  const promotionCost = result?.promotion_spend_cents ?? 0
  const fulfillmentCost = result?.fulfillment_cost_cents ?? 0

  const profitCents = revenue - refund - platformFee - aiCost - promotionCost - fulfillmentCost

  return c.json({
    revenue_cents: revenue,
    refund_cents: refund,
    platform_fee_cents: platformFee,
    ai_cost_cents: aiCost,
    promotion_spend_cents: promotionCost,
    fulfillment_cost_cents: fulfillmentCost,
    profit_cents: profitCents,
    event_count: result?.event_count ?? 0,
  })
})


// ── List events (paginated) ───────────────────────────────────

  .get('/', async (c) => {
  const ventureId = c.req.query('venture_id')
  const type = c.req.query('type')
  const limit = parseInt(c.req.query('limit') || '50', 10)
  const offset = parseInt(c.req.query('offset') || '0', 10)

  let query = 'SELECT e.* FROM economic_events e'
  const params: unknown[] = []

  if (ventureId) {
    query += ' JOIN offers o ON e.offer_id = o.id WHERE o.venture_id = ?'
    params.push(ventureId)
  }

  if (type) {
    query += ventureId ? ' AND e.event_type = ?' : ' WHERE e.event_type = ?'
    params.push(type)
  }

  query += ' ORDER BY e.occurred_at DESC LIMIT ? OFFSET ?'
  params.push(limit, offset)

  const result = await c.env.DB.prepare(query).bind(...params).all()

  return c.json({
    events: result.results ?? [],
    limit,
    offset,
  })
})
