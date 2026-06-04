import type { D1Database } from '@cloudflare/workers-types'
import type {
  OpportunityPortfolio,
  VentureMetrics,
  VentureVertical,
  AllocatorDecision,
} from '@nexus/types'

// ============================================================
// Opportunity Graph Service
// Purpose: Bridge opportunities to ventures/offers/economic events
// ============================================================

interface OpportunityRow {
  id: string
  trend_name: string
  target_buyer: string
  product_idea: string
  why_it_sells: string
  evidence: string
  competition_level: string
  urgency: string
  risk_level: string
  suggested_format: string
  difficulty: string
  confidence_score: number
  score_demand: number
  score_competition_gap: number
  score_buyer_urgency: number
  score_ease: number
  score_monetization: number
  score_timing: number
  score_safety: number
  total_score: number
  niche: string | null
  category: string | null
  source_signals: string
  status: string
  is_guess: number
  linked_job_id: string | null
  linked_product_id: string | null
  created_at: string
  updated_at: string
  expires_at: string | null
}

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

// ── Get opportunity with ventures and offers ─────────────────────

export async function getOpportunityWithVentures(
  db: D1Database,
  opportunityId: string
) {
  const opportunity = await db
    .prepare('SELECT * FROM opportunities WHERE id = ?')
    .bind(opportunityId)
    .first<OpportunityRow>()

  if (!opportunity) {
    return null
  }

  // Get all ventures for this opportunity
  const venturesResult = await db
    .prepare('SELECT * FROM ventures WHERE opportunity_id = ?')
    .bind(opportunityId)
    .all<VentureRow>()

  const ventures = venturesResult.results ?? []

  // For each venture, get offers and economic event totals
  const venturesWithDetails = await Promise.all(
    ventures.map(async (venture) => {
      const offersResult = await db
        .prepare('SELECT * FROM offers WHERE venture_id = ?')
        .bind(venture.id)
        .all<OfferRow>()

      const offers = offersResult.results ?? []

      // Calculate economic event totals for this venture
      const offerIds = offers.map((o) => o.id)
      let revenueCents = 0
      let refundCents = 0
      let platformFeeCents = 0
      let aiCostCents = 0
      let promotionCostCents = 0
      let fulfillmentCostCents = 0

      if (offerIds.length > 0) {
        const placeholders = offerIds.map(() => '?').join(',')
        const eventsResult = await db
          .prepare(`SELECT * FROM economic_events WHERE offer_id IN (${placeholders})`)
          .bind(...offerIds)
          .all<EconomicEventRow>()

        const events = eventsResult.results ?? []

        for (const event of events) {
          switch (event.event_type) {
            case 'revenue':
              revenueCents += event.amount_cents
              break
            case 'refund':
              refundCents += event.amount_cents
              break
            case 'fee':
              if (event.category === 'platform') {
                platformFeeCents += event.amount_cents
              } else if (event.category === 'ai') {
                aiCostCents += event.amount_cents
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
      }

      return {
        ...venture,
        offers,
        economic_event_totals: {
          revenue_cents: revenueCents,
          refund_cents: refundCents,
          platform_fee_cents: platformFeeCents,
          ai_cost_cents: aiCostCents,
          promotion_cost_cents: promotionCostCents,
          fulfillment_cost_cents: fulfillmentCostCents,
        },
      }
    })
  )

  return {
    opportunity: formatOpportunity(opportunity),
    ventures: venturesWithDetails,
  }
}

// ── Get opportunity portfolio view ─────────────────────────────────

export async function getOpportunityPortfolio(
  db: D1Database,
  opportunityId: string
): Promise<OpportunityPortfolio | null> {
  const opportunity = await db
    .prepare('SELECT * FROM opportunities WHERE id = ?')
    .bind(opportunityId)
    .first<OpportunityRow>()

  if (!opportunity) {
    return null
  }

  const venturesResult = await db
    .prepare('SELECT * FROM ventures WHERE opportunity_id = ?')
    .bind(opportunityId)
    .all<VentureRow>()

  const ventures = venturesResult.results ?? []

  // Calculate venture metrics for each venture
  const ventureMetrics: VentureMetrics[] = await Promise.all(
    ventures.map(async (venture) => {
      const metrics = await calculateVentureMetrics(db, venture.id)
      return {
        ventureId: venture.id,
        vertical: venture.vertical as VentureVertical,
        revenueCents: metrics.revenueCents,
        refundCents: metrics.refundCents,
        platformFeeCents: metrics.platformFeeCents,
        aiCostCents: metrics.aiCostCents,
        promotionCostCents: metrics.promotionCostCents,
        fulfillmentCostCents: metrics.fulfillmentCostCents,
        clicks: metrics.clicks,
        conversions: metrics.conversions,
        qualifiedSignals: metrics.qualifiedSignals,
        budgetCapCents: venture.budget_cap_cents,
        testQuotaClicks: venture.test_quota_clicks,
        refundRate: metrics.refundRate,
        profitCents: metrics.profitCents,
      }
    })
  )

  // Calculate portfolio-level stats
  const totalProfitCents = ventureMetrics.reduce((sum, v) => sum + v.profitCents, 0)
  
  // Find best vertical
  const bestVertical = ventureMetrics.length > 0
    ? ventureMetrics.reduce((best, current) =>
        current.profitCents > best.profitCents ? current : best
      ).vertical
    : null

  // Find active verticals
  const activeVerticals = ventureMetrics
    .filter((v) => v.profitCents > 0)
    .map((v) => v.vertical)

  // Expansion queue: verticals not yet tried
  const allVerticals: VentureVertical[] = ['digital', 'pod', 'content', 'affiliate', 'freelance', 'ecommerce']
  const triedVerticals = new Set(ventureMetrics.map((v) => v.vertical))
  const expansionQueue = allVerticals.filter((v) => !triedVerticals.has(v))

  // Get latest allocator decision
  const latestAllocatorAction = await db
    .prepare(`
      SELECT action_type, reason 
      FROM allocator_actions 
      WHERE venture_id IN (SELECT id FROM ventures WHERE opportunity_id = ?)
      ORDER BY created_at DESC 
      LIMIT 1
    `)
    .bind(opportunityId)
    .first<{ action_type: string; reason: string }>()

  const allocatorDecision: AllocatorDecision = latestAllocatorAction
    ? (latestAllocatorAction.action_type as AllocatorDecision)
    : 'mutate'

  return {
    opportunityId: opportunity.id,
    title: opportunity.trend_name,
    ventures: ventureMetrics,
    totalProfitCents,
    bestVertical,
    activeVerticals,
    expansionQueue,
    allocatorDecision,
  }
}

// ── List opportunities with portfolio stats ───────────────────────

export async function listOpportunitiesWithStats(
  db: D1Database,
  filters?: { status?: string; min_score?: number; niche?: string }
) {
  let query = 'SELECT * FROM opportunities WHERE 1=1'
  const params: unknown[] = []

  if (filters?.status) {
    query += ' AND status = ?'
    params.push(filters.status)
  }
  if (filters?.min_score) {
    query += ' AND total_score >= ?'
    params.push(filters.min_score)
  }
  if (filters?.niche) {
    query += ' AND niche = ?'
    params.push(filters.niche)
  }

  query += ' ORDER BY total_score DESC, created_at DESC'

  const opportunitiesResult = await db.prepare(query).bind(...params).all<OpportunityRow>()
  const opportunities = opportunitiesResult.results ?? []

  // Add portfolio stats to each opportunity
  const opportunitiesWithStats = await Promise.all(
    opportunities.map(async (opp) => {
      const venturesResult = await db
        .prepare('SELECT * FROM ventures WHERE opportunity_id = ?')
        .bind(opp.id)
        .all<VentureRow>()

      const ventures = venturesResult.results ?? []
      
      // Calculate totals across all ventures
      let totalProfitCents = 0
      const activeVerticals: Set<string> = new Set()

      for (const venture of ventures) {
        const metrics = await calculateVentureMetrics(db, venture.id)
        totalProfitCents += metrics.profitCents
        if (metrics.profitCents > 0) {
          activeVerticals.add(venture.vertical)
        }
      }

      // Find best vertical
      let bestVertical: string | null = null
      if (ventures.length > 0) {
        const metricsList = await Promise.all(
          ventures.map((v) => calculateVentureMetrics(db, v.id))
        )
        const best = metricsList.reduce((b, current) =>
          current.profitCents > b.profitCents ? current : b
        )
        bestVertical = ventures[metricsList.indexOf(best)].vertical
      }

      return {
        ...formatOpportunity(opp),
        venture_count: ventures.length,
        total_profit_cents: totalProfitCents,
        best_vertical: bestVertical,
        active_vertical_count: activeVerticals.size,
        active_verticals: Array.from(activeVerticals),
      }
    })
  )

  return opportunitiesWithStats
}

// ── Helper: Calculate venture metrics ───────────────────────────────

async function calculateVentureMetrics(db: D1Database, ventureId: string) {
  const offersResult = await db
    .prepare('SELECT * FROM offers WHERE venture_id = ?')
    .bind(ventureId)
    .all<OfferRow>()

  const offers = offersResult.results ?? []
  const offerIds = offers.map((o) => o.id)

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
    
    // Get economic events
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
          } else if (event.category === 'ai') {
            aiCostCents += event.amount_cents
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

    // Get tracked links for click counting
    const linksResult = await db
      .prepare(`SELECT * FROM tracked_links WHERE offer_id IN (${placeholders})`)
      .bind(...offerIds)
      .all<TrackedLinkRow>()

    const links = linksResult.results ?? []
    clicks = links.length
  }

  const profitCents = revenueCents - refundCents - platformFeeCents - aiCostCents - promotionCostCents - fulfillmentCostCents
  const refundRate = revenueCents > 0 ? refundCents / revenueCents : 0

  // Count qualified signals (signals linked to this venture)
  const venture = await db
    .prepare('SELECT signal_id FROM ventures WHERE id = ?')
    .bind(ventureId)
    .first<{ signal_id: string | null }>()

  const qualifiedSignals = venture?.signal_id ? 1 : 0

  return {
    revenueCents,
    refundCents,
    platformFeeCents,
    aiCostCents,
    promotionCostCents,
    fulfillmentCostCents,
    clicks,
    conversions,
    qualifiedSignals,
    refundRate,
    profitCents,
  }
}

// ── Helper: Format opportunity ──────────────────────────────────────

function formatOpportunity(row: OpportunityRow) {
  return {
    ...row,
    evidence: safeParseJson(row.evidence),
    source_signals: safeParseJson(row.source_signals),
    is_guess: row.is_guess === 1,
  }
}

function safeParseJson(str: string): unknown {
  try {
    return JSON.parse(str)
  } catch {
    return []
  }
}
