import type { D1Database } from '@cloudflare/workers-types'
import type { VentureVertical } from '@nexus/types'
import { createVenture } from './venture-service'

// ============================================================
// Venture Multiplier Service
// Purpose: Generate draft ventures for all compatible verticals automatically
// ============================================================

const VERTICAL_COMPATIBILITY: Record<string, VentureVertical[]> = {
  // opportunity type → compatible verticals
  'template_or_planner': ['digital', 'pod', 'content', 'affiliate', 'freelance'],
  'information_product': ['digital', 'content', 'affiliate'],
  'design_asset': ['digital', 'pod', 'freelance'],
  'tool_or_workflow': ['digital', 'content', 'affiliate', 'freelance'],
  'physical_need': ['pod', 'ecommerce', 'affiliate'],
  'skill_education': ['digital', 'content', 'freelance'],
  'research_or_data': ['digital', 'content', 'affiliate'],
  'general': ['digital', 'pod', 'content', 'affiliate', 'freelance', 'ecommerce'],
}

interface OpportunityRow {
  id: string
  trend_name: string
  target_buyer: string
  product_idea: string
  why_it_sells: string
  suggested_format: string
}

interface VentureRow {
  id: string
  vertical: string
  status: string
}

// ── Multiply opportunity into ventures ─────────────────────────

export async function multiplyOpportunity(
  db: D1Database,
  opportunityId: string
): Promise<string[]> {
  // Fetch opportunity
  const opportunity = await db.prepare('SELECT * FROM opportunities WHERE id = ?')
    .bind(opportunityId)
    .first<OpportunityRow>()

  if (!opportunity) {
    throw new Error('Opportunity not found')
  }

  // Fetch existing ventures
  const existingVentures = await db.prepare('SELECT * FROM ventures WHERE opportunity_id = ?')
    .bind(opportunityId)
    .all<VentureRow>()

  // Determine opportunity type
  const opportunityType = classifyOpportunityType(opportunity)

  // Get compatible verticals
  const compatibleVerticals = getCompatibleVerticals(opportunityType)

  // Exclude verticals that already have a non-killed venture
  const existingVerticals = new Set(
    (existingVentures.results ?? [])
      .filter((v) => v.status !== 'killed' && v.status !== 'archived')
      .map((v) => v.vertical)
  )

  const verticalsToCreate = compatibleVerticals.filter((v) => !existingVerticals.has(v))

  // Create venture drafts for each remaining vertical
  const newVentureIds: string[] = []

  for (const vertical of verticalsToCreate) {
    try {
      const strategy = await generateStrategyForVertical(db, opportunity, vertical)

      const venture = await createVenture(db, {
        opportunity_id: opportunityId,
        vertical,
        strategy,
        budget_cap_cents: 500, // $5 test budget
        test_quota_clicks: 100,
      })

      newVentureIds.push(venture.id)
    } catch (err) {
      console.error(`Failed to create venture for vertical ${vertical}:`, err)
    }
  }

  return newVentureIds
}

// ── Get compatible verticals for opportunity type ───────────────

export function getCompatibleVerticals(opportunityType: string): VentureVertical[] {
  return VERTICAL_COMPATIBILITY[opportunityType] || VERTICAL_COMPATIBILITY.general
}

// ── Classify opportunity type ─────────────────────────────────

export function classifyOpportunityType(opportunity: OpportunityRow): string {
  const { trend_name, target_buyer, product_idea, suggested_format } = opportunity
  const text = `${trend_name} ${target_buyer} ${product_idea} ${suggested_format}`.toLowerCase()

  // Simple keyword-based classification
  if (
    text.includes('template') ||
    text.includes('planner') ||
    text.includes('checklist') ||
    text.includes('tracker')
  ) {
    return 'template_or_planner'
  }

  if (
    text.includes('guide') ||
    text.includes('tutorial') ||
    text.includes('ebook') ||
    text.includes('course') ||
    text.includes('learn')
  ) {
    return 'information_product'
  }

  if (
    text.includes('design') ||
    text.includes('template') ||
    text.includes('graphic') ||
    text.includes('icon')
  ) {
    return 'design_asset'
  }

  if (
    text.includes('tool') ||
    text.includes('workflow') ||
    text.includes('automation') ||
    text.includes('system')
  ) {
    return 'tool_or_workflow'
  }

  if (
    text.includes('physical') ||
    text.includes('merch') ||
    text.includes('print') ||
    text.includes('apparel')
  ) {
    return 'physical_need'
  }

  if (
    text.includes('skill') ||
    text.includes('education') ||
    text.includes('training') ||
    text.includes('mentor')
  ) {
    return 'skill_education'
  }

  if (
    text.includes('research') ||
    text.includes('data') ||
    text.includes('report') ||
    text.includes('analysis')
  ) {
    return 'research_or_data'
  }

  return 'general'
}

// ── Generate strategy for vertical ─────────────────────────────

async function generateStrategyForVertical(
  _db: D1Database,
  opportunity: OpportunityRow,
  vertical: VentureVertical
): Promise<string> {
  // For now, return a simple strategy description
  // In production, this would call the AI worker to generate a more detailed strategy
  const strategies: Record<VentureVertical, string> = {
    digital: `Create a digital product for ${opportunity.target_buyer} addressing ${opportunity.trend_name}. Focus on ${opportunity.product_idea}.`,
    pod: `Create a print-on-demand product line for ${opportunity.target_buyer} related to ${opportunity.trend_name}.`,
    content: `Build content marketing assets for ${opportunity.trend_name} targeting ${opportunity.target_buyer}.`,
    affiliate: `Develop affiliate marketing campaigns for ${opportunity.trend_name} products for ${opportunity.target_buyer}.`,
    freelance: `Package ${opportunity.product_idea} as a freelance service offering for ${opportunity.target_buyer}.`,
    ecommerce: `Set up e-commerce listing for ${opportunity.product_idea} targeting ${opportunity.target_buyer}.`,
  }

  return strategies[vertical] || `Develop ${vertical} offering for ${opportunity.trend_name}`
}
