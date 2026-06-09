import type { D1Database } from '@cloudflare/workers-types'
import type {
  AllocatorDecision,
  VentureVertical,
} from '@nexus/types'
import {
  computeVentureMetrics,
  killVenture,
  createVenture,
} from './venture-service'

// ============================================================
// Capital Allocator Engine
// Purpose: Decide what to do with each venture based on profit evidence
// ============================================================

interface AllocatorResult {
  decision: AllocatorDecision
  reason: string
  metrics: {
    profit_cents: number
    refund_rate: number
    clicks: number
    conversions: number
    ai_cost_cents: number
    budget_cap_cents: number
    test_quota_clicks: number
  }
}

interface VentureRow {
  id: string
  opportunity_id: string
  vertical: string
  status: string
  budget_cap_cents: number
  test_quota_clicks: number
}

// ── Allocate venture ─────────────────────────────────────────

export async function allocateVenture(
  db: D1Database,
  ventureId: string
): Promise<AllocatorDecision> {
  // Get venture details
  const venture = await db
    .prepare('SELECT * FROM ventures WHERE id = ?')
    .bind(ventureId)
    .first<VentureRow>()

  if (!venture) {
    throw new Error('Venture not found')
  }

  // Compute metrics
  const metrics = await computeVentureMetrics(db, ventureId)
  metrics.vertical = venture.vertical as VentureVertical

  // Apply rules in order (first match wins)
  const result = applyAllocationRules(venture, metrics)

  // Write allocator action to DB
  await db.prepare(`
    INSERT INTO allocator_actions (
      venture_id, action_type, reason, confidence, data_before, data_after
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    ventureId,
    result.decision,
    result.reason,
    1.0,
    JSON.stringify(metrics),
    JSON.stringify({ decision: result.decision })
  ).run()

  // Execute side effects based on decision
  if (result.decision === 'kill') {
    await killVenture(db, ventureId, result.reason)
  } else if (result.decision === 'expand') {
    await expandVerticals(db, venture.opportunity_id, venture.vertical, ventureId)
  } else if (result.decision === 'scale') {
    await scaleOpportunity(db, venture.opportunity_id)
  } else if (result.decision === 'mutate') {
    // Mutate the offer (set status to indicate need for changes)
    await db.prepare(`
      UPDATE ventures SET status = 'mutating', updated_at = datetime('now') WHERE id = ?
    `).bind(ventureId).run()
  } else if (result.decision === 'recycle') {
    await recycleAssets(db, venture.opportunity_id)
  }

  return result.decision
}

// ── Apply allocation rules ───────────────────────────────────

function applyAllocationRules(
  venture: VentureRow,
  metrics: any
): AllocatorResult {
  const {
    profit_cents,
    refund_rate,
    clicks,
    conversions,
    ai_cost_cents,
    budget_cap_cents,
    test_quota_clicks,
  } = metrics

  // KILL: Over budget with no conversions OR reached test quota with no conversions
  if (
    (ai_cost_cents >= budget_cap_cents && conversions === 0) ||
    (clicks >= test_quota_clicks && conversions === 0)
  ) {
    return {
      decision: 'kill',
      reason: ai_cost_cents >= budget_cap_cents
        ? `AI costs (${ai_cost_cents} cents) exceeded budget (${budget_cap_cents} cents) with ${conversions} conversions`
        : `Reached test quota (${test_quota_clicks} clicks) with ${conversions} conversions`,
      metrics: {
        profit_cents,
        refund_rate,
        clicks,
        conversions,
        ai_cost_cents,
        budget_cap_cents,
        test_quota_clicks,
      },
    }
  }

  // MUTATE: Good traffic but offer fails (30+ clicks, no conversions)
  if (clicks >= 30 && conversions === 0) {
    return {
      decision: 'mutate',
      reason: `Good traffic (${clicks} clicks) but no conversions - offer needs mutation`,
      metrics: {
        profit_cents,
        refund_rate,
        clicks,
        conversions,
        ai_cost_cents,
        budget_cap_cents,
        test_quota_clicks,
      },
    }
  }

  // RECYCLE_ASSETS: Venture killed but assets exist
  if (venture.status === 'killed') {
    return {
      decision: 'recycle',
      reason: 'Venture killed - salvage assets for other ventures',
      metrics: {
        profit_cents,
        refund_rate,
        clicks,
        conversions,
        ai_cost_cents,
        budget_cap_cents,
        test_quota_clicks,
      },
    }
  }

  // EXPAND_VERTICALS: Profitable with low refund rate
  if (profit_cents > 0 && refund_rate <= 0.15) {
    return {
      decision: 'expand',
      reason: `Profitable (${profit_cents} cents) with low refund rate (${(refund_rate * 100).toFixed(1)}%) - expand to other verticals`,
      metrics: {
        profit_cents,
        refund_rate,
        clicks,
        conversions,
        ai_cost_cents,
        budget_cap_cents,
        test_quota_clicks,
      },
    }
  }

  // SCALE_OPPORTUNITY: Highly profitable with low refund rate
  if (profit_cents > 5000 && refund_rate <= 0.10) {
    return {
      decision: 'scale',
      reason: `Highly profitable (${profit_cents} cents = $${(profit_cents / 100).toFixed(2)}) with low refund rate (${(refund_rate * 100).toFixed(1)}%) - scale opportunity`,
      metrics: {
        profit_cents,
        refund_rate,
        clicks,
        conversions,
        ai_cost_cents,
        budget_cap_cents,
        test_quota_clicks,
      },
    }
  }

  // CONTINUE_TEST: Still gathering evidence
  return {
    decision: 'mutate', // Default to mutate for now
    reason: 'Continue testing - gathering evidence',
    metrics: {
      profit_cents,
      refund_rate,
      clicks,
      conversions,
      ai_cost_cents,
      budget_cap_cents,
      test_quota_clicks,
    },
  }
}

// ── Expand to other verticals ─────────────────────────────────

async function expandVerticals(
  db: D1Database,
  opportunityId: string,
  currentVertical: string,
  _sourceVentureId: string
) {
  const allVerticals: VentureVertical[] = ['digital', 'pod', 'content', 'affiliate', 'freelance', 'ecommerce']
  const existingVerticals = await db
    .prepare('SELECT DISTINCT vertical FROM ventures WHERE opportunity_id = ?')
    .bind(opportunityId)
    .all<{ vertical: string }>()

  const triedVerticals = new Set((existingVerticals.results ?? []).map((v) => v.vertical))
  const verticalsToTry = allVerticals.filter((v) => !triedVerticals.has(v) && v !== currentVertical)

  // Create stub ventures for up to 2 new verticals
  for (const vertical of verticalsToTry.slice(0, 2)) {
    try {
      const newVenture = await createVenture(db, {
        opportunity_id: opportunityId,
        vertical,
        strategy: `Expansion from ${currentVertical}`,
        signal_id: undefined,
      })
      console.log(`Created expansion venture: ${newVenture.id} for vertical: ${vertical}`)
    } catch (err) {
      console.error(`Failed to create expansion venture for ${vertical}:`, err)
    }
  }
}

// ── Scale opportunity ─────────────────────────────────────────

async function scaleOpportunity(db: D1Database, opportunityId: string) {
  // Update all testing/live ventures to scaling status
  await db.prepare(`
    UPDATE ventures 
    SET status = 'scaling', updated_at = datetime('now') 
    WHERE opportunity_id = ? AND status IN ('testing', 'live')
  `).bind(opportunityId).run()

  // Increase budget caps for profitable ventures
  await db.prepare(`
    UPDATE ventures 
    SET budget_cap_cents = budget_cap_cents * 2, updated_at = datetime('now')
    WHERE opportunity_id = ? AND profit_cents > 0
  `).bind(opportunityId).run()
}

// ── Recycle assets ─────────────────────────────────────────────

async function recycleAssets(db: D1Database, opportunityId: string) {
  // Find high-performing assets from killed ventures
  const assets = await db.prepare(`
    SELECT * FROM asset_library
    WHERE venture_id IN (SELECT id FROM ventures WHERE opportunity_id = ? AND status = 'killed')
    AND performance_score > 0.5
    ORDER BY performance_score DESC
  `).bind(opportunityId).all()

  // Tag them for reuse
  for (const asset of assets.results ?? []) {
    const currentTags = JSON.parse((asset as any).tags || '[]')
    if (!currentTags.includes('recycle_candidate')) {
      const newTags = [...currentTags, 'recycle_candidate']
      await db.prepare(`
        UPDATE asset_library SET tags = ?, updated_at = datetime('now') WHERE id = ?
      `).bind(JSON.stringify(newTags), (asset as any).id).run()
    }
  }
}

// ── Run allocator for opportunity ─────────────────────────────

export async function runAllocatorForOpportunity(
  db: D1Database,
  opportunityId: string
): Promise<void> {
  const ventures = await db
    .prepare("SELECT id FROM ventures WHERE opportunity_id = ? AND status != 'killed'")
    .bind(opportunityId)
    .all<{ id: string }>()

  for (const venture of ventures.results ?? []) {
    try {
      await allocateVenture(db, venture.id)
    } catch (err) {
      console.error(`Failed to allocate venture ${venture.id}:`, err)
    }
  }
}

// ── Run global allocator ───────────────────────────────────────

export async function runGlobalAllocator(db: D1Database): Promise<void> {
  const opportunities = await db
    .prepare("SELECT id FROM opportunities WHERE status IN ('testing', 'live')")
    .all<{ id: string }>()

  for (const opportunity of opportunities.results ?? []) {
    try {
      await runAllocatorForOpportunity(db, opportunity.id)
    } catch (err) {
      console.error(`Failed to run allocator for opportunity ${opportunity.id}:`, err)
    }
  }
}
