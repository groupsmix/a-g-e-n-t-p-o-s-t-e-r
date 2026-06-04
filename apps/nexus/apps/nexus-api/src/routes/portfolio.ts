import { Hono } from 'hono'
import type { Env } from '../env'
import type {
  Signal, Venture, Offer, TrackedLink, EconomicEvent,
  AssetLibraryItem, AllocatorAction,
  CreateSignalInput, CreateVentureInput, CreateOfferInput,
  CreateTrackedLinkInput, CreateEconomicEventInput,
  CreateAssetLibraryItemInput, CreateAllocatorActionInput,
  SignalFilters, VentureFilters, OfferFilters, EconomicEventFilters,
  AssetLibraryFilters
} from '@nexus/types/portfolio'

export const portfolioRoutes = new Hono<{ Bindings: Env }>()

// ============================================================
// SIGNALS
// ============================================================

// GET /api/portfolio/signals - List signals with optional filtering
portfolioRoutes.get('/signals', async (c) => {
  const filters: SignalFilters = {
    status: c.req.query('status') as any,
    source_type: c.req.query('source_type') as any,
    min_demand_score: c.req.query('min_demand_score') ? Number(c.req.query('min_demand_score')) : undefined,
    limit: Math.min(Number(c.req.query('limit') || '50'), 200),
    offset: Number(c.req.query('offset') || '0'),
  }

  let sql = 'SELECT * FROM signals WHERE 1=1'
  const params: any[] = []

  if (filters.status) {
    sql += ' AND status = ?'
    params.push(filters.status)
  }
  if (filters.source_type) {
    sql += ' AND source_type = ?'
    params.push(filters.source_type)
  }
  if (filters.min_demand_score) {
    sql += ' AND demand_score >= ?'
    params.push(filters.min_demand_score)
  }

  sql += ' ORDER BY demand_score DESC, created_at DESC LIMIT ? OFFSET ?'
  params.push(filters.limit, filters.offset)

  const result = await c.env.DB.prepare(sql).bind(...params).all<Signal>()
  const countResult = await c.env.DB.prepare(
    'SELECT COUNT(*) as total FROM signals WHERE 1=1' +
    (filters.status ? ' AND status = ?' : '') +
    (filters.source_type ? ' AND source_type = ?' : '') +
    (filters.min_demand_score ? ' AND demand_score >= ?' : '')
  ).bind(...params.slice(0, params.length - 2)).first<{ total: number }>()

  return c.json({
    signals: result.results || [],
    total: countResult?.total || 0,
    limit: filters.limit,
    offset: filters.offset,
  })
})

// GET /api/portfolio/signals/:id - Get a single signal
portfolioRoutes.get('/signals/:id', async (c) => {
  const id = c.req.param('id')
  const signal = await c.env.DB.prepare('SELECT * FROM signals WHERE id = ?')
    .bind(id)
    .first<Signal>()

  if (!signal) {
    return c.json({ error: 'Signal not found' }, 404)
  }

  return c.json({ signal })
})

// POST /api/portfolio/signals - Create a new signal
portfolioRoutes.post('/signals', async (c) => {
  const input = await c.req.json<CreateSignalInput>()
  
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  await c.env.DB.prepare(`
    INSERT INTO signals (id, source_type, source_ref, title, extracted_audience, extracted_problem, 
                        evidence_json, demand_score, freshness_score, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    input.source_type,
    input.source_ref || null,
    input.title,
    input.extracted_audience || null,
    input.extracted_problem || null,
    JSON.stringify(input.evidence_json || {}),
    input.demand_score || 0,
    input.freshness_score || 0,
    'raw',
    now,
    now
  ).run()

  const signal = await c.env.DB.prepare('SELECT * FROM signals WHERE id = ?')
    .bind(id)
    .first<Signal>()

  return c.json({ signal }, 201)
})

// PUT /api/portfolio/signals/:id - Update a signal
portfolioRoutes.put('/signals/:id', async (c) => {
  const id = c.req.param('id')
  const input = await c.req.json<Partial<CreateSignalInput & { status?: string }>>()
  
  const now = new Date().toISOString()
  const updates: string[] = ['updated_at = ?']
  const params: any[] = [now]

  if (input.title !== undefined) {
    updates.push('title = ?')
    params.push(input.title)
  }
  if (input.extracted_audience !== undefined) {
    updates.push('extracted_audience = ?')
    params.push(input.extracted_audience)
  }
  if (input.extracted_problem !== undefined) {
    updates.push('extracted_problem = ?')
    params.push(input.extracted_problem)
  }
  if (input.evidence_json !== undefined) {
    updates.push('evidence_json = ?')
    params.push(JSON.stringify(input.evidence_json))
  }
  if (input.demand_score !== undefined) {
    updates.push('demand_score = ?')
    params.push(input.demand_score)
  }
  if (input.freshness_score !== undefined) {
    updates.push('freshness_score = ?')
    params.push(input.freshness_score)
  }
  if (input.status !== undefined) {
    updates.push('status = ?')
    params.push(input.status)
  }

  params.push(id)

  await c.env.DB.prepare(
    `UPDATE signals SET ${updates.join(', ')} WHERE id = ?`
  ).bind(...params).run()

  const signal = await c.env.DB.prepare('SELECT * FROM signals WHERE id = ?')
    .bind(id)
    .first<Signal>()

  if (!signal) {
    return c.json({ error: 'Signal not found' }, 404)
  }

  return c.json({ signal })
})

// ============================================================
// VENTURES
// ============================================================

// GET /api/portfolio/ventures - List ventures with optional filtering
portfolioRoutes.get('/ventures', async (c) => {
  const filters: VentureFilters = {
    opportunity_id: c.req.query('opportunity_id'),
    vertical: c.req.query('vertical') as any,
    status: c.req.query('status') as any,
    signal_id: c.req.query('signal_id'),
    limit: Math.min(Number(c.req.query('limit') || '50'), 200),
    offset: Number(c.req.query('offset') || '0'),
  }

  let sql = 'SELECT * FROM ventures WHERE 1=1'
  const params: any[] = []

  if (filters.opportunity_id) {
    sql += ' AND opportunity_id = ?'
    params.push(filters.opportunity_id)
  }
  if (filters.vertical) {
    sql += ' AND vertical = ?'
    params.push(filters.vertical)
  }
  if (filters.status) {
    sql += ' AND status = ?'
    params.push(filters.status)
  }
  if (filters.signal_id) {
    sql += ' AND signal_id = ?'
    params.push(filters.signal_id)
  }

  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?'
  params.push(filters.limit, filters.offset)

  const result = await c.env.DB.prepare(sql).bind(...params).all<Venture>()
  
  return c.json({
    ventures: result.results || [],
    limit: filters.limit,
    offset: filters.offset,
  })
})

// GET /api/portfolio/ventures/:id - Get a single venture
portfolioRoutes.get('/ventures/:id', async (c) => {
  const id = c.req.param('id')
  const venture = await c.env.DB.prepare('SELECT * FROM ventures WHERE id = ?')
    .bind(id)
    .first<Venture>()

  if (!venture) {
    return c.json({ error: 'Venture not found' }, 404)
  }

  return c.json({ venture })
})

// POST /api/portfolio/ventures - Create a new venture
portfolioRoutes.post('/ventures', async (c) => {
  const input = await c.req.json<CreateVentureInput>()
  
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  await c.env.DB.prepare(`
    INSERT INTO ventures (id, opportunity_id, vertical, strategy, status, 
                         budget_cap_cents, test_quota_clicks, signal_id, 
                         ai_cost_cents, revenue_cents, profit_cents, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    input.opportunity_id,
    input.vertical,
    input.strategy,
    'draft',
    input.budget_cap_cents || 0,
    input.test_quota_clicks || 100,
    input.signal_id || null,
    0,
    0,
    0,
    now,
    now
  ).run()

  const venture = await c.env.DB.prepare('SELECT * FROM ventures WHERE id = ?')
    .bind(id)
    .first<Venture>()

  return c.json({ venture }, 201)
})

// PUT /api/portfolio/ventures/:id - Update a venture
portfolioRoutes.put('/ventures/:id', async (c) => {
  const id = c.req.param('id')
  const input = await c.req.json<Partial<CreateVentureInput & { status?: string; budget_cap_cents?: number; revenue_cents?: number; profit_cents?: number }>>()
  
  const now = new Date().toISOString()
  const updates: string[] = ['updated_at = ?']
  const params: any[] = [now]

  if (input.status !== undefined) {
    updates.push('status = ?')
    params.push(input.status)
  }
  if (input.strategy !== undefined) {
    updates.push('strategy = ?')
    params.push(input.strategy)
  }
  if (input.budget_cap_cents !== undefined) {
    updates.push('budget_cap_cents = ?')
    params.push(input.budget_cap_cents)
  }
  if (input.revenue_cents !== undefined) {
    updates.push('revenue_cents = ?')
    params.push(input.revenue_cents)
  }
  if (input.profit_cents !== undefined) {
    updates.push('profit_cents = ?')
    params.push(input.profit_cents)
  }

  params.push(id)

  await c.env.DB.prepare(
    `UPDATE ventures SET ${updates.join(', ')} WHERE id = ?`
  ).bind(...params).run()

  const venture = await c.env.DB.prepare('SELECT * FROM ventures WHERE id = ?')
    .bind(id)
    .first<Venture>()

  if (!venture) {
    return c.json({ error: 'Venture not found' }, 404)
  }

  return c.json({ venture })
})

// ============================================================
// OFFERS
// ============================================================

// GET /api/portfolio/offers - List offers with optional filtering
portfolioRoutes.get('/offers', async (c) => {
  const filters: OfferFilters = {
    venture_id: c.req.query('venture_id'),
    platform_id: c.req.query('platform_id'),
    status: c.req.query('status') as any,
    limit: Math.min(Number(c.req.query('limit') || '50'), 200),
    offset: Number(c.req.query('offset') || '0'),
  }

  let sql = 'SELECT * FROM offers WHERE 1=1'
  const params: any[] = []

  if (filters.venture_id) {
    sql += ' AND venture_id = ?'
    params.push(filters.venture_id)
  }
  if (filters.platform_id) {
    sql += ' AND platform_id = ?'
    params.push(filters.platform_id)
  }
  if (filters.status) {
    sql += ' AND status = ?'
    params.push(filters.status)
  }

  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?'
  params.push(filters.limit, filters.offset)

  const result = await c.env.DB.prepare(sql).bind(...params).all<Offer>()
  
  return c.json({
    offers: result.results || [],
    limit: filters.limit,
    offset: filters.offset,
  })
})

// GET /api/portfolio/offers/:id - Get a single offer
portfolioRoutes.get('/offers/:id', async (c) => {
  const id = c.req.param('id')
  const offer = await c.env.DB.prepare('SELECT * FROM offers WHERE id = ?')
    .bind(id)
    .first<Offer>()

  if (!offer) {
    return c.json({ error: 'Offer not found' }, 404)
  }

  return c.json({ offer })
})

// POST /api/portfolio/offers - Create a new offer
portfolioRoutes.post('/offers', async (c) => {
  const input = await c.req.json<CreateOfferInput>()
  
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  await c.env.DB.prepare(`
    INSERT INTO offers (id, venture_id, platform_id, title, description, 
                        price_cents, currency, variant_type, variant_data, 
                        status, published_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    input.venture_id,
    input.platform_id || null,
    input.title || null,
    input.description || null,
    input.price_cents,
    input.currency || 'USD',
    input.variant_type || null,
    JSON.stringify(input.variant_data || {}),
    'draft',
    null,
    now,
    now
  ).run()

  const offer = await c.env.DB.prepare('SELECT * FROM offers WHERE id = ?')
    .bind(id)
    .first<Offer>()

  return c.json({ offer }, 201)
})

// PUT /api/portfolio/offers/:id - Update an offer
portfolioRoutes.put('/offers/:id', async (c) => {
  const id = c.req.param('id')
  const input = await c.req.json<Partial<CreateOfferInput & { status?: string; external_listing_id?: string; external_url?: string }>>()
  
  const now = new Date().toISOString()
  const updates: string[] = ['updated_at = ?']
  const params: any[] = [now]

  if (input.title !== undefined) {
    updates.push('title = ?')
    params.push(input.title)
  }
  if (input.description !== undefined) {
    updates.push('description = ?')
    params.push(input.description)
  }
  if (input.price_cents !== undefined) {
    updates.push('price_cents = ?')
    params.push(input.price_cents)
  }
  if (input.status !== undefined) {
    updates.push('status = ?')
    params.push(input.status)
    if (input.status === 'active') {
      updates.push('published_at = ?')
      params.push(now)
    }
  }
  if (input.external_listing_id !== undefined) {
    updates.push('external_listing_id = ?')
    params.push(input.external_listing_id)
  }
  if (input.external_url !== undefined) {
    updates.push('external_url = ?')
    params.push(input.external_url)
  }

  params.push(id)

  await c.env.DB.prepare(
    `UPDATE offers SET ${updates.join(', ')} WHERE id = ?`
  ).bind(...params).run()

  const offer = await c.env.DB.prepare('SELECT * FROM offers WHERE id = ?')
    .bind(id)
    .first<Offer>()

  if (!offer) {
    return c.json({ error: 'Offer not found' }, 404)
  }

  return c.json({ offer })
})

// ============================================================
// TRACKED LINKS
// ============================================================

// GET /api/portfolio/tracked-links - List tracked links for an offer
portfolioRoutes.get('/tracked-links', async (c) => {
  const offerId = c.req.query('offer_id')
  if (!offerId) {
    return c.json({ error: 'offer_id is required' }, 400)
  }

  const result = await c.env.DB.prepare(
    'SELECT * FROM tracked_links WHERE offer_id = ? ORDER BY created_at DESC'
  ).bind(offerId).all<TrackedLink>()

  return c.json({ tracked_links: result.results || [] })
})

// POST /api/portfolio/tracked-links - Create a tracked link
portfolioRoutes.post('/tracked-links', async (c) => {
  const input = await c.req.json<CreateTrackedLinkInput>()
  
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  await c.env.DB.prepare(`
    INSERT INTO tracked_links (id, offer_id, channel, slug, destination_url, 
                               utm_source, utm_medium, utm_campaign, utm_content, utm_term, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    input.offer_id,
    input.channel,
    input.slug,
    input.destination_url,
    input.utm_source || null,
    input.utm_medium || null,
    input.utm_campaign || null,
    input.utm_content || null,
    input.utm_term || null,
    now
  ).run()

  const link = await c.env.DB.prepare('SELECT * FROM tracked_links WHERE id = ?')
    .bind(id)
    .first<TrackedLink>()

  return c.json({ tracked_link: link }, 201)
})

// ============================================================
// ECONOMIC EVENTS
// ============================================================

// GET /api/portfolio/economic-events - List economic events with filtering
portfolioRoutes.get('/economic-events', async (c) => {
  const filters: EconomicEventFilters = {
    offer_id: c.req.query('offer_id'),
    tracked_link_id: c.req.query('tracked_link_id'),
    event_type: c.req.query('event_type') as any,
    category: c.req.query('category'),
    occurred_after: c.req.query('occurred_after'),
    occurred_before: c.req.query('occurred_before'),
    limit: Math.min(Number(c.req.query('limit') || '50'), 200),
    offset: Number(c.req.query('offset') || '0'),
  }

  let sql = 'SELECT * FROM economic_events WHERE 1=1'
  const params: any[] = []

  if (filters.offer_id) {
    sql += ' AND offer_id = ?'
    params.push(filters.offer_id)
  }
  if (filters.tracked_link_id) {
    sql += ' AND tracked_link_id = ?'
    params.push(filters.tracked_link_id)
  }
  if (filters.event_type) {
    sql += ' AND event_type = ?'
    params.push(filters.event_type)
  }
  if (filters.category) {
    sql += ' AND category = ?'
    params.push(filters.category)
  }
  if (filters.occurred_after) {
    sql += ' AND occurred_at >= ?'
    params.push(filters.occurred_after)
  }
  if (filters.occurred_before) {
    sql += ' AND occurred_at <= ?'
    params.push(filters.occurred_before)
  }

  sql += ' ORDER BY occurred_at DESC LIMIT ? OFFSET ?'
  params.push(filters.limit, filters.offset)

  const result = await c.env.DB.prepare(sql).bind(...params).all<EconomicEvent>()
  
  return c.json({
    economic_events: result.results || [],
    limit: filters.limit,
    offset: filters.offset,
  })
})

// POST /api/portfolio/economic-events - Record an economic event
portfolioRoutes.post('/economic-events', async (c) => {
  const input = await c.req.json<CreateEconomicEventInput>()
  
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const occurredAt = input.occurred_at || now

  await c.env.DB.prepare(`
    INSERT INTO economic_events (id, offer_id, tracked_link_id, event_type, amount_cents, 
                                 currency, description, category, external_event_id, 
                                 external_provider, metadata, occurred_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    input.offer_id,
    input.tracked_link_id || null,
    input.event_type,
    input.amount_cents,
    input.currency || 'USD',
    input.description || null,
    input.category || null,
    input.external_event_id || null,
    input.external_provider || null,
    JSON.stringify(input.metadata || {}),
    occurredAt,
    now
  ).run()

  const event = await c.env.DB.prepare('SELECT * FROM economic_events WHERE id = ?')
    .bind(id)
    .first<EconomicEvent>()

  return c.json({ economic_event: event }, 201)
})

// ============================================================
// ASSET LIBRARY
// ============================================================

// GET /api/portfolio/asset-library - List asset library items
portfolioRoutes.get('/asset-library', async (c) => {
  const filters: AssetLibraryFilters = {
    venture_id: c.req.query('venture_id'),
    offer_id: c.req.query('offer_id'),
    asset_type: c.req.query('asset_type') as any,
    min_performance_score: c.req.query('min_performance_score') ? Number(c.req.query('min_performance_score')) : undefined,
    limit: Math.min(Number(c.req.query('limit') || '50'), 200),
    offset: Number(c.req.query('offset') || '0'),
  }

  let sql = 'SELECT * FROM asset_library WHERE 1=1'
  const params: any[] = []

  if (filters.venture_id) {
    sql += ' AND venture_id = ?'
    params.push(filters.venture_id)
  }
  if (filters.offer_id) {
    sql += ' AND offer_id = ?'
    params.push(filters.offer_id)
  }
  if (filters.asset_type) {
    sql += ' AND asset_type = ?'
    params.push(filters.asset_type)
  }
  if (filters.min_performance_score) {
    sql += ' AND performance_score >= ?'
    params.push(filters.min_performance_score)
  }

  sql += ' ORDER BY performance_score DESC, usage_count DESC, created_at DESC LIMIT ? OFFSET ?'
  params.push(filters.limit, filters.offset)

  const result = await c.env.DB.prepare(sql).bind(...params).all<AssetLibraryItem>()
  
  return c.json({
    assets: result.results || [],
    limit: filters.limit,
    offset: filters.offset,
  })
})

// POST /api/portfolio/asset-library - Add an asset to the library
portfolioRoutes.post('/asset-library', async (c) => {
  const input = await c.req.json<CreateAssetLibraryItemInput>()
  
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  await c.env.DB.prepare(`
    INSERT INTO asset_library (id, venture_id, offer_id, asset_type, file_path, 
                               cdn_url, prompt_used, ai_model_used, tags, 
                               performance_score, usage_count, metadata, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    input.venture_id || null,
    input.offer_id || null,
    input.asset_type,
    input.file_path || null,
    input.cdn_url || null,
    input.prompt_used || null,
    input.ai_model_used || null,
    JSON.stringify(input.tags || []),
    0,
    0,
    JSON.stringify(input.metadata || {}),
    now,
    now
  ).run()

  const asset = await c.env.DB.prepare('SELECT * FROM asset_library WHERE id = ?')
    .bind(id)
    .first<AssetLibraryItem>()

  return c.json({ asset }, 201)
})

// ============================================================
// ALLOCATOR ACTIONS
// ============================================================

// GET /api/portfolio/allocator-actions - List allocator actions for a venture
portfolioRoutes.get('/allocator-actions', async (c) => {
  const ventureId = c.req.query('venture_id')
  if (!ventureId) {
    return c.json({ error: 'venture_id is required' }, 400)
  }

  const result = await c.env.DB.prepare(
    'SELECT * FROM allocator_actions WHERE venture_id = ? ORDER BY created_at DESC'
  ).bind(ventureId).all<AllocatorAction>()

  return c.json({ allocator_actions: result.results || [] })
})

// POST /api/portfolio/allocator-actions - Record an allocator action
portfolioRoutes.post('/allocator-actions', async (c) => {
  const input = await c.req.json<CreateAllocatorActionInput>()
  
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  await c.env.DB.prepare(`
    INSERT INTO allocator_actions (id, venture_id, action_type, reason, confidence, 
                                   data_before, data_after, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    input.venture_id,
    input.action_type,
    input.reason,
    input.confidence || 0,
    JSON.stringify(input.data_before || {}),
    JSON.stringify(input.data_after || {}),
    now
  ).run()

  const action = await c.env.DB.prepare('SELECT * FROM allocator_actions WHERE id = ?')
    .bind(id)
    .first<AllocatorAction>()

  return c.json({ allocator_action: action }, 201)
})

// ============================================================
// PORTFOLIO SCOREBOARD (NXM-012)
// ============================================================

// GET /api/portfolio/scoreboard - Full portfolio state for dashboard
portfolioRoutes.get('/scoreboard', async (c) => {
  // Cashflow summary
  const cashflowResult = await c.env.DB.prepare(`
    SELECT 
      SUM(CASE WHEN event_type = 'revenue' THEN amount_cents ELSE 0 END) as total_revenue_cents,
      SUM(CASE WHEN event_type = 'refund' THEN amount_cents ELSE 0 END) as total_refunds_cents,
      SUM(CASE WHEN event_type = 'fee' AND category = 'platform' THEN amount_cents ELSE 0 END) as total_platform_fees_cents,
      SUM(CASE WHEN event_type = 'fee' AND category = 'ai' THEN amount_cents ELSE 0 END) as total_ai_cost_cents,
      SUM(CASE WHEN event_type = 'cost' AND category = 'promotion' THEN amount_cents ELSE 0 END) as total_promotion_spend_cents
    FROM economic_events
  `).first<{
    total_revenue_cents: number
    total_refunds_cents: number
    total_platform_fees_cents: number
    total_ai_cost_cents: number
    total_promotion_spend_cents: number
  }>()

  const totalRevenue = cashflowResult?.total_revenue_cents || 0
  const totalRefunds = cashflowResult?.total_refunds_cents || 0
  const totalPlatformFees = cashflowResult?.total_platform_fees_cents || 0
  const totalAiCost = cashflowResult?.total_ai_cost_cents || 0
  const totalPromoSpend = cashflowResult?.total_promotion_spend_cents || 0

  const netProfit = totalRevenue - totalRefunds - totalPlatformFees - totalAiCost - totalPromoSpend

  // Time-based cashflow
  const todayProfit = await getProfitForPeriod(c.env.DB, 1)
  const weekProfit = await getProfitForPeriod(c.env.DB, 7)
  const monthProfit = await getProfitForPeriod(c.env.DB, 30)

  // Active opportunities and live ventures
  const activeOpps = await c.env.DB.prepare(
    "SELECT COUNT(*) as count FROM opportunities WHERE status IN ('approved', 'in_progress')"
  ).first<{ count: number }>()

  const liveVentures = await c.env.DB.prepare(
    "SELECT COUNT(*) as count FROM ventures WHERE status IN ('live', 'scaling')"
  ).first<{ count: number }>()

  // Agent costs today
  const agentCostToday = await c.env.DB.prepare(`
    SELECT COALESCE(SUM(cost_cents), 0) as total
    FROM agent_runs
    WHERE DATE(created_at) = DATE('now')
  `).first<{ total: number }>()

  // Winners (profitable opportunities)
  const winners = await c.env.DB.prepare(`
    SELECT 
      o.id as opportunity_id,
      o.trend_name as title,
      COALESCE(SUM(e.amount_cents), 0) as revenue_cents
    FROM opportunities o
    LEFT JOIN ventures v ON v.opportunity_id = o.id
    LEFT JOIN offers off ON off.venture_id = v.id
    LEFT JOIN economic_events e ON e.offer_id = off.id AND e.event_type = 'revenue'
    WHERE o.status != 'dismissed'
    GROUP BY o.id
    HAVING revenue_cents > 0
    ORDER BY revenue_cents DESC
    LIMIT 10
  `).all<{ opportunity_id: string; title: string; revenue_cents: number }>()

  // Kill board (killed ventures from last 7 days)
  const killBoard = await c.env.DB.prepare(`
    SELECT 
      v.id, v.vertical, v.status, v.created_at,
      o.trend_name as opportunity_title
    FROM ventures v
    JOIN opportunities o ON o.id = v.opportunity_id
    WHERE v.status = 'killed' AND DATE(v.updated_at) >= DATE('now', '-7 days')
    ORDER BY v.updated_at DESC
    LIMIT 10
  `).all<any>()

  // Expansion queue (draft ventures)
  const expansionQueue = await c.env.DB.prepare(`
    SELECT 
      v.id, v.vertical, v.status, v.created_at,
      o.trend_name as opportunity_title
    FROM ventures v
    JOIN opportunities o ON o.id = v.opportunity_id
    WHERE v.status = 'draft'
    ORDER BY v.created_at DESC
    LIMIT 10
  `).all<any>()

  // Opportunity matrix (vertical × opportunity)
  const opportunityMatrix = await c.env.DB.prepare(`
    SELECT 
      o.id as opportunity_id,
      o.trend_name as title,
      v.vertical,
      COALESCE(SUM(e.amount_cents), 0) as profit_cents
    FROM opportunities o
    LEFT JOIN ventures v ON v.opportunity_id = o.id
    LEFT JOIN offers off ON off.venture_id = v.id
    LEFT JOIN economic_events e ON e.offer_id = off.id AND e.event_type = 'revenue'
    GROUP BY o.id, v.vertical
    ORDER BY o.total_score DESC
  `).all<any>()

  // Build matrix structure
  const matrixMap = new Map<string, any>()
  for (const row of opportunityMatrix.results ?? []) {
    const oppId = row.opportunity_id
    if (!matrixMap.has(oppId)) {
      matrixMap.set(oppId, {
        opportunity_id: oppId,
        title: row.title,
        verticals: {
          digital: null,
          pod: null,
          content: null,
          affiliate: null,
          freelance: null,
          ecommerce: null,
        },
      })
    }
    const matrix = matrixMap.get(oppId)!
    matrix.verticals[row.vertical] = row.profit_cents
  }

  return c.json({
    cashflow: {
      net_profit_today_cents: todayProfit,
      net_profit_week_cents: weekProfit,
      net_profit_month_cents: monthProfit,
      total_revenue_cents: totalRevenue,
      total_refunds_cents: totalRefunds,
      total_ai_cost_cents: totalAiCost,
      total_promotion_spend_cents: totalPromoSpend,
      total_platform_fees_cents: totalPlatformFees,
      net_profit_cents: netProfit,
    },
    active_opportunities: activeOpps?.count || 0,
    live_ventures: liveVentures?.count || 0,
    winners: (winners.results ?? []).map((w) => ({
      opportunity_id: w.opportunity_id,
      title: w.title,
      profit_cents: w.revenue_cents,
    })),
    kill_board: killBoard.results ?? [],
    expansion_queue: expansionQueue.results ?? [],
    opportunity_matrix: Array.from(matrixMap.values()),
    agent_cost_today_cents: agentCostToday?.total || 0,
  })
})

// GET /api/portfolio/allocation - Allocator's last decisions
portfolioRoutes.get('/allocation', async (c) => {
  const result = await c.env.DB.prepare(`
    SELECT 
      aa.*,
      v.vertical,
      o.trend_name as opportunity_title,
      aa.created_at as executed_at
    FROM allocator_actions aa
    JOIN ventures v ON v.id = aa.venture_id
    JOIN opportunities o ON o.id = v.opportunity_id
    ORDER BY aa.created_at DESC
    LIMIT 50
  `).all<any>()

  return c.json({ allocations: result.results ?? [] })
})

// GET /api/portfolio/cashflow - Time-series cashflow data
portfolioRoutes.get('/cashflow', async (c) => {
  const period = c.req.query('period') || '7d'
  const days = period === '30d' ? 30 : period === '90d' ? 90 : 7

  const result = await c.env.DB.prepare(`
    SELECT 
      DATE(occurred_at) as date,
      SUM(CASE WHEN event_type = 'revenue' THEN amount_cents ELSE 0 END) as revenue_cents,
      SUM(CASE WHEN event_type = 'refund' THEN amount_cents ELSE 0 END) as refund_cents,
      SUM(CASE WHEN event_type = 'fee' AND category = 'platform' THEN amount_cents ELSE 0 END) as platform_fee_cents,
      SUM(CASE WHEN event_type = 'fee' AND category = 'ai' THEN amount_cents ELSE 0 END) as ai_cost_cents,
      SUM(CASE WHEN event_type = 'cost' AND category = 'promotion' THEN amount_cents ELSE 0 END) as promotion_cost_cents
    FROM economic_events
    WHERE DATE(occurred_at) >= DATE('now', '-' || ? || ' days')
    GROUP BY DATE(occurred_at)
    ORDER BY date DESC
  `).bind(days).all<any>()

  const cashflow = (result.results ?? []).map((row) => ({
    date: row.date,
    net_profit_cents: row.revenue_cents - row.refund_cents - row.platform_fee_cents - row.ai_cost_cents - row.promotion_cost_cents,
    revenue_cents: row.revenue_cents,
    refund_cents: row.refund_cents,
    platform_fee_cents: row.platform_fee_cents,
    ai_cost_cents: row.ai_cost_cents,
    promotion_cost_cents: row.promotion_cost_cents,
  }))

  return c.json({ cashflow, period })
})

// Helper: Get profit for a time period in days
async function getProfitForPeriod(db: D1Database, days: number): Promise<number> {
  const result = await db.prepare(`
    SELECT 
      SUM(CASE WHEN event_type = 'revenue' THEN amount_cents ELSE 0 END) -
      SUM(CASE WHEN event_type = 'refund' THEN amount_cents ELSE 0 END) -
      SUM(CASE WHEN event_type = 'fee' AND category = 'platform' THEN amount_cents ELSE 0 END) -
      SUM(CASE WHEN event_type = 'fee' AND category = 'ai' THEN amount_cents ELSE 0 END) -
      SUM(CASE WHEN event_type = 'cost' AND category = 'promotion' THEN amount_cents ELSE 0 END) as net_profit
    FROM economic_events
    WHERE DATE(occurred_at) >= DATE('now', '-' || ? || ' days')
  `).bind(days).first<{ net_profit: number }>()

  return result?.net_profit || 0
}