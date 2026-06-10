import type { D1Database } from '@cloudflare/workers-types'
import type {
  Venture,
  VentureMetrics,
  CreateVentureInput,
  Vertical,
} from '@posteragent/types/nexus'

// ============================================================
// Venture Service
// Purpose: CRUD operations for ventures with computed metrics
// ============================================================

interface VentureRow {
  id: string
  opportunity_id: string
  vertical: string
  strategy: string
  status: string
  budget_cap_cents: number
  test_quota_clicks: number
  signal_id: string | null
  ai_cost_cents: number
  revenue_cents: number
  profit_cents: number
  created_at: string
  updated_at: string
}

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

interface EconomicEventRow {
  id: string
  offer_id: string
  tracked_link_id: string | null
  event_type: string
  amount_cents: number
  currency: string
  description: string | null
  category: string | null
  external_event_id: string | null
  external_provider: string | null
  metadata: string
  occurred_at: string
  created_at: string
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

// ── Create venture ───────────────────────────────────────────────

export async function createVenture(
  db: D1Database,
  input: CreateVentureInput
): Promise<Venture> {
  const validVerticals: Vertical[] = ['digital', 'pod', 'content', 'affiliate', 'freelance', 'ecommerce']
  if (!validVerticals.includes(input.vertical)) {
    throw new Error(`Invalid vertical: ${input.vertical}. Must be one of: ${validVerticals.join(', ')}`)
  }

  const id = crypto.randomUUID().replace(/-/g, '')

  await db.prepare(`
    INSERT INTO ventures (
      id, opportunity_id, vertical, strategy, status,
      budget_cap_cents, test_quota_clicks, signal_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    input.opportunity_id,
    input.vertical,
    input.strategy,
    'draft',
    input.budget_cap_cents ?? 0,
    input.test_quota_clicks ?? 100,
    input.signal_id ?? null,
  ).run()

  const venture = await db.prepare('SELECT * FROM ventures WHERE id = ?')
    .bind(id)
    .first<VentureRow>()

  if (!venture) {
    throw new Error('Failed to create venture')
  }

  return mapVentureRow(venture)
}

// ── Get venture with metrics ───────────────────────────────────────

export async function getVentureWithMetrics(
  db: D1Database,
  ventureId: string
) {
  const venture = await db.prepare('SELECT * FROM ventures WHERE id = ?')
    .bind(ventureId)
    .first<VentureRow>()

  if (!venture) {
    return null
  }

  const metrics = await computeVentureMetrics(db, ventureId)
  const offers = await getOffersForVenture(db, ventureId)

  return {
    venture: mapVentureRow(venture),
    metrics,
    offers,
  }
}

// ── Update venture ─────────────────────────────────────────────────

export async function updateVenture(
  db: D1Database,
  ventureId: string,
  patch: {
    status?: string
    budget_cap_cents?: number
    strategy?: string
    test_quota_clicks?: number
  }
): Promise<Venture | null> {
  const updates: string[] = []
  const params: unknown[] = []

  if (patch.status !== undefined) {
    const validStatuses = ['draft', 'building', 'testing', 'live', 'scaling', 'mutating', 'killed', 'archived']
    if (!validStatuses.includes(patch.status)) {
      throw new Error(`Invalid status: ${patch.status}`)
    }
    updates.push('status = ?')
    params.push(patch.status)
  }
  if (patch.budget_cap_cents !== undefined) {
    updates.push('budget_cap_cents = ?')
    params.push(patch.budget_cap_cents)
  }
  if (patch.strategy !== undefined) {
    updates.push('strategy = ?')
    params.push(patch.strategy)
  }
  if (patch.test_quota_clicks !== undefined) {
    updates.push('test_quota_clicks = ?')
    params.push(patch.test_quota_clicks)
  }

  if (updates.length === 0) {
    // No updates, just return existing venture
    const existing = await db.prepare('SELECT * FROM ventures WHERE id = ?')
      .bind(ventureId)
      .first<VentureRow>()
    return existing ? mapVentureRow(existing) : null
  }

  updates.push("updated_at = datetime('now')")
  params.push(ventureId)

  await db.prepare(`
    UPDATE ventures SET ${updates.join(', ')} WHERE id = ?
  `).bind(...params).run()

  const updated = await db.prepare('SELECT * FROM ventures WHERE id = ?')
    .bind(ventureId)
    .first<VentureRow>()

  return updated ? mapVentureRow(updated) : null
}

// ── Kill venture (soft delete) ─────────────────────────────────────

export async function killVenture(
  db: D1Database,
  ventureId: string,
  reason: string = 'manual_kill'
): Promise<void> {
  // Set status to killed
  await db.prepare(`
    UPDATE ventures SET status = 'killed', updated_at = datetime('now') WHERE id = ?
  `).bind(ventureId).run()

  // Record allocator action
  await db.prepare(`
    INSERT INTO allocator_actions (venture_id, action_type, reason, confidence, data_before, data_after)
    VALUES (?, 'kill', ?, 1, '{}', '{}')
  `).bind(ventureId, reason).run()
}

// ── List ventures for opportunity ───────────────────────────────────

export async function listVenturesForOpportunity(
  db: D1Database,
  opportunityId: string
) {
  const venturesResult = await db
    .prepare('SELECT * FROM ventures WHERE opportunity_id = ? ORDER BY created_at DESC')
    .bind(opportunityId)
    .all<VentureRow>()

  const ventures = venturesResult.results ?? []

  const venturesWithMetrics = await Promise.all(
    ventures.map(async (venture) => {
      const metrics = await computeVentureMetrics(db, venture.id)
      const offers = await getOffersForVenture(db, venture.id)
      return {
        venture: mapVentureRow(venture),
        metrics,
        offers,
      }
    })
  )

  return venturesWithMetrics
}

// ── Compute venture metrics ────────────────────────────────────────

export async function computeVentureMetrics(
  db: D1Database,
  ventureId: string
): Promise<VentureMetrics> {
  const offersResult = await db
    .prepare('SELECT id FROM offers WHERE venture_id = ?')
    .bind(ventureId)
    .all<{ id: string }>()

  const offers = offersResult.results ?? []
  const offerIds = offers.map((o) => o.id)

  // Initialize metrics
  let revenueCents = 0
  let refundCents = 0
  let platformFeeCents = 0
  let aiCostCents = 0
  let promotionCostCents = 0
  let fulfillmentCostCents = 0
  let clicks = 0
  let conversions = 0

  if (offerIds.length > 0) {
    const placeholders = offerIds.map(() => '?').join(',')

    // Aggregate economic events
    const eventsResult = await db
      .prepare(`SELECT * FROM economic_events WHERE offer_id IN (${placeholders})`)
      .bind(...offerIds)
      .all<EconomicEventRow>()

    const events = eventsResult.results ?? []

    for (const event of events) {
      switch (event.event_type) {
        case 'revenue':
          revenueCents += event.amount_cents
          conversions += 1
          break
        case 'refund':
          refundCents += event.amount_cents
          break
        case 'fee':
          if (event.category === 'platform') {
            platformFeeCents += event.amount_cents
          }
          break
        case 'cost':
          if (event.category === 'promotion') {
            promotionCostCents += event.amount_cents
          } else if (event.category === 'fulfillment') {
            fulfillmentCostCents += event.amount_cents
          }
          break
      }
    }

    // Count tracked links (clicks)
    const linksResult = await db
      .prepare(`SELECT * FROM tracked_links WHERE offer_id IN (${placeholders})`)
      .bind(...offerIds)
      .all<TrackedLinkRow>()

    clicks = (linksResult.results ?? []).length
  }

  // Get AI costs from agent_runs linked to this venture
  const agentRunsResult = await db
    .prepare('SELECT SUM(cost_cents) as total FROM agent_runs WHERE venture_id = ?')
    .bind(ventureId)
    .first<{ total: number }>()

  aiCostCents = agentRunsResult?.total ?? 0

  // Get venture details for budget/quota
  const venture = await db
    .prepare('SELECT budget_cap_cents, test_quota_clicks, signal_id FROM ventures WHERE id = ?')
    .bind(ventureId)
    .first<{ budget_cap_cents: number; test_quota_clicks: number; signal_id: string | null }>()

  const budgetCapCents = venture?.budget_cap_cents ?? 0
  const testQuotaClicks = venture?.test_quota_clicks ?? 100
  const qualifiedSignals = venture?.signal_id ? 1 : 0

  // Compute derived metrics
  const profitCents = revenueCents - refundCents - platformFeeCents - aiCostCents - promotionCostCents - fulfillmentCostCents
  const refundRate = revenueCents > 0 ? refundCents / revenueCents : 0

  return {
    ventureId,
    vertical: 'digital' as const, // Will be overridden by caller
    revenueCents,
    refundCents,
    platformFeeCents,
    aiCostCents,
    promotionCostCents,
    fulfillmentCostCents,
    clicks,
    conversions,
    qualifiedSignals,
    budgetCapCents,
    testQuotaClicks,
    refundRate,
    profitCents,
  }
}

// ── Helper: Get offers for venture ─────────────────────────────────

async function getOffersForVenture(db: D1Database, ventureId: string) {
  const offersResult = await db
    .prepare('SELECT * FROM offers WHERE venture_id = ? ORDER BY created_at DESC')
    .bind(ventureId)
    .all<OfferRow>()

  return (offersResult.results ?? []).map(mapOfferRow)
}

// ── Helper: Map venture row ────────────────────────────────────────

function mapVentureRow(row: VentureRow): Venture {
  return {
    id: row.id,
    opportunity_id: row.opportunity_id,
    vertical: row.vertical as Vertical,
    strategy: row.strategy,
    status: row.status as Venture['status'],
    budget_cap_cents: row.budget_cap_cents,
    test_quota_clicks: row.test_quota_clicks,
    signal_id: row.signal_id,
    ai_cost_cents: row.ai_cost_cents,
    revenue_cents: row.revenue_cents,
    profit_cents: row.profit_cents,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

// ── Helper: Map offer row ──────────────────────────────────────────

function mapOfferRow(row: OfferRow) {
  return {
    id: row.id,
    venture_id: row.venture_id,
    platform_id: row.platform_id,
    title: row.title,
    description: row.description,
    price_cents: row.price_cents,
    currency: row.currency,
    variant_type: row.variant_type,
    variant_data: safeParseJson(row.variant_data),
    status: row.status,
    published_at: row.published_at,
    external_listing_id: row.external_listing_id,
    external_url: row.external_url,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

function safeParseJson(str: string): unknown {
  try {
    return JSON.parse(str)
  } catch {
    return {}
  }
}
