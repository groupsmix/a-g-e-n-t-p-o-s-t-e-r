import type { D1Database } from '@cloudflare/workers-types'
import type { VentureVertical } from '@nexus/types'
import { multiplyOpportunity } from './venture-multiplier'
import { dispatchVentureFactory } from './factory/factory-dispatcher'
import { recycleAsset, findRecyclableAssets } from './asset-recycler'
import { computeVentureMetrics } from './venture-service'

// ============================================================
// Winner Expansion Engine
// Purpose: Automatically expand winning ventures to new verticals and opportunities
// ============================================================

const WINNER_THRESHOLD_CENTS = 5000 // $50 net profit threshold

interface VentureRow {
  id: string
  vertical: string
  opportunity_id: string
}

interface OpportunityRow {
  id: string
  trend_name: string
  target_buyer: string
}

interface ExpansionPlan {
  newVentureIds: string[]
  newSignalIds: string[]
  recycledAssets: Array<{ vertical: VentureVertical; newAssetId: string }>
  originalVentureId: string
}

interface AdjacentSuggestion {
  title: string
  problem: string
  why_buy: string
}

// ── Expand winner venture ─────────────────────────────────────

export async function expandWinner(
  db: D1Database,
  ventureId: string
): Promise<ExpansionPlan | null> {
  // Fetch venture metrics
  const metrics = await computeVentureMetrics(db, ventureId)

  if (!metrics || metrics.profitCents < WINNER_THRESHOLD_CENTS) {
    return null
  }

  // Fetch venture + opportunity
  const venture = await db
    .prepare('SELECT * FROM ventures WHERE id = ?')
    .bind(ventureId)
    .first<VentureRow>()

  if (!venture) {
    throw new Error('Venture not found')
  }

  const opportunity = await db
    .prepare('SELECT * FROM opportunities WHERE id = ?')
    .bind(venture.opportunity_id)
    .first<OpportunityRow>()

  if (!opportunity) {
    throw new Error('Opportunity not found')
  }

  // Find existing ventures for this opportunity
  const existingVentures = await db
    .prepare('SELECT * FROM ventures WHERE opportunity_id = ?')
    .bind(venture.opportunity_id)
    .all<VentureRow>()

  // Find un-tried verticals
  const allVerticals: VentureVertical[] = ['digital', 'pod', 'content', 'affiliate', 'freelance', 'ecommerce']
  const usedVerticals = new Set((existingVentures.results ?? []).map((v) => v.vertical))
  const untriedVerticals = allVerticals.filter((v) => !usedVerticals.has(v))

  const expansionPlan: ExpansionPlan = {
    newVentureIds: [],
    newSignalIds: [],
    recycledAssets: [],
    originalVentureId: ventureId,
  }

  // Create venture drafts for un-tried verticals
  if (untriedVerticals.length > 0) {
    const newVentureIds = await multiplyOpportunity(db, venture.opportunity_id)
    expansionPlan.newVentureIds = newVentureIds

    // Dispatch factory for each new venture (fire and forget)
    for (const newVentureId of newVentureIds) {
      dispatchVentureFactory(db, newVentureId).catch((err) => {
        console.error(`Factory build failed for venture ${newVentureId}:`, err)
      })
    }
  }

  // Recycle assets to new verticals
  const recyclableAssets = await findRecyclableAssets(db, venture.opportunity_id)
  if (recyclableAssets.length > 0 && untriedVerticals.length > 0) {
    for (const asset of recyclableAssets.slice(0, 3)) {
      const recycleResults = await recycleAsset(db, asset.id, untriedVerticals.slice(0, 3))
      expansionPlan.recycledAssets.push(
        ...recycleResults.map((r) => ({
          vertical: r.vertical,
          newAssetId: r.newAssetId,
        }))
      )
    }
  }

  // Generate adjacent opportunity suggestions via AI
  const adjacentSuggestions = await generateAdjacentOpportunities(opportunity)

  // Create signal records from AI suggestions
  for (const suggestion of adjacentSuggestions) {
    const signalId = crypto.randomUUID().replace(/-/g, '')
    await db.prepare(`
      INSERT INTO signals (
        id, source_type, source_ref, title, extracted_audience, extracted_problem,
        evidence_json, demand_score, freshness_score, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).bind(
      signalId,
      'winner_expansion',
      ventureId,
      suggestion.title,
      opportunity.target_buyer,
      suggestion.problem,
      JSON.stringify([{ source: 'winner_expansion', why: suggestion.why_buy }]),
      50, // Moderate demand score for expansion ideas
      100, // Fresh signal
      'raw'
    ).run()

    expansionPlan.newSignalIds.push(signalId)
  }

  // Log allocator action
  await logAllocatorAction(db, ventureId, expansionPlan, metrics)

  return expansionPlan
}

// ── Run winner scan ─────────────────────────────────────────────

export async function runWinnerScan(db: D1Database): Promise<ExpansionPlan[]> {
  // Check all live ventures for winner threshold
  const liveVentures = await db
    .prepare('SELECT * FROM ventures WHERE status IN (?, ?)')
    .bind('live', 'scaling')
    .all<VentureRow>()

  const expansions: ExpansionPlan[] = []

  for (const venture of liveVentures.results ?? []) {
    try {
      const plan = await expandWinner(db, venture.id)
      if (plan) {
        expansions.push(plan)
      }
    } catch (err) {
      console.error(`Failed to expand venture ${venture.id}:`, err)
    }
  }

  return expansions
}

// ── Generate adjacent opportunities ─────────────────────────────

async function generateAdjacentOpportunities(
  opportunity: OpportunityRow
): Promise<AdjacentSuggestion[]> {
  const prompt = `Based on a winning product: ${opportunity.trend_name} (audience: ${opportunity.target_buyer})
 Suggest 2 adjacent problems the same audience has.
 Each suggestion: title, problem, why this audience would also buy this.
 Respond ONLY in JSON array.`

  const response = await callAIGeneration(prompt)
  return parseAdjacentSuggestions(response)
}

// ── Call AI generation ─────────────────────────────────────────

async function callAIGeneration(_prompt: string): Promise<string> {
  // In a real implementation, this would call the AI worker
  // For now, return a mock response
  return JSON.stringify([
    {
      title: 'Advanced Success Strategies',
      problem: 'Users need next-level tactics after mastering basics',
      why_buy: 'Same audience ready to invest in advanced learning',
    },
    {
      title: 'Team Training Resources',
      problem: 'Users want to scale their success to team members',
      why_buy: 'Core audience expanding to team leaders and managers',
    },
  ])
}

// ── Parse adjacent suggestions ─────────────────────────────────

function parseAdjacentSuggestions(response: string): AdjacentSuggestion[] {
  try {
    return JSON.parse(response)
  } catch {
    // Fallback to default suggestions
    return [
      {
        title: 'Advanced Version',
        problem: 'Users need more advanced features',
        why_buy: 'Same audience at next level',
      },
      {
        title: 'Companion Tool',
        problem: 'Users need complementary resources',
        why_buy: 'Natural upsell for existing customers',
      },
    ]
  }
}

// ── Log allocator action ───────────────────────────────────────

async function logAllocatorAction(
  db: D1Database,
  ventureId: string,
  plan: ExpansionPlan,
  metrics: any
): Promise<void> {
  const actionId = crypto.randomUUID().replace(/-/g, '')
  await db.prepare(`
    INSERT INTO allocator_actions (
      id, venture_id, action_type, reason, confidence, data_before, data_after, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).bind(
    actionId,
    ventureId,
    'expand_verticals',
    `Winner expansion triggered: $${(metrics.profit_cents / 100).toFixed(2)} profit threshold met`,
    0.9,
    JSON.stringify(metrics),
    JSON.stringify(plan)
  ).run()
}
