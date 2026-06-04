import type { D1Database } from '@cloudflare/workers-types'
import type { VentureVertical } from '@nexus/types'
import { buildDigitalVenture } from './digital-factory'
import { buildPODVenture } from './pod-factory'
import { buildContentVenture } from './content-factory'
import { buildAffiliateVenture } from './affiliate-factory'
import { buildFreelanceVenture } from './freelance-factory'
import { buildEcommerceVenture } from './ecommerce-factory'
import { allocateVenture } from '../capital-allocator'

// ============================================================
// Factory Dispatcher
// Purpose: Route a venture to the correct factory based on its vertical
// ============================================================

interface VentureRow {
  id: string
  vertical: string
  opportunity_id: string
}

// ── Dispatch venture to correct factory ───────────────────────

export async function dispatchVentureFactory(
  db: D1Database,
  ventureId: string
): Promise<{ success: boolean; offerId?: string; assetId?: string; error?: string }> {
  // Fetch venture
  const venture = await db
    .prepare('SELECT * FROM ventures WHERE id = ?')
    .bind(ventureId)
    .first<VentureRow>()

  if (!venture) {
    return { success: false, error: 'Venture not found' }
  }

  // Route to correct factory based on vertical
  try {
    let result: { offerId: string; assetId: string }

    switch (venture.vertical as VentureVertical) {
      case 'digital':
        result = await buildDigitalVenture(db, ventureId)
        break
      case 'pod':
        result = await buildPODVenture(db, ventureId)
        break
      case 'content':
        result = await buildContentVenture(db, ventureId)
        break
      case 'affiliate':
        result = await buildAffiliateVenture(db, ventureId)
        break
      case 'freelance':
        result = await buildFreelanceVenture(db, ventureId)
        break
      case 'ecommerce':
        result = await buildEcommerceVenture(db, ventureId)
        break
      default:
        throw new Error(`Unknown vertical: ${venture.vertical}`)
    }

    // Update venture status to 'building'
    await db.prepare(`
      UPDATE ventures SET status = 'building', updated_at = datetime('now') WHERE id = ?
    `).bind(ventureId).run()

    // Trigger capital allocator initial evaluation
    try {
      await allocateVenture(db, ventureId)
    } catch (err) {
      console.error(`Failed to run allocator after factory build for venture ${ventureId}:`, err)
    }

    return { success: true, offerId: result.offerId, assetId: result.assetId }
  } catch (err) {
    // Log failure to agent_runs
    const agentRunId = crypto.randomUUID().replace(/-/g, '')
    await db.prepare(`
      INSERT INTO agent_runs (
        id, opportunity_id, venture_id, workflow_type,
        agent_name, model, status, error_message, started_at, finished_at,
        metadata_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).bind(
      agentRunId,
      venture.opportunity_id,
      ventureId,
      'asset_generate',
      'factory_dispatcher',
      'system',
      'failed',
      String(err),
      new Date().toISOString(),
      new Date().toISOString(),
      JSON.stringify({ vertical: venture.vertical }),
    ).run()

    // Keep venture as 'draft' on factory error (don't kill)
    await db.prepare(`
      UPDATE ventures SET status = 'draft', updated_at = datetime('now') WHERE id = ?
    `).bind(ventureId).run()

    return { success: false, error: String(err) }
  }
}

// ── Build all ventures for opportunity ───────────────────────

export async function buildAllVenturesForOpportunity(
  db: D1Database,
  opportunityId: string
): Promise<{ total: number; successful: number; failed: number; results: any[] }> {
  // Fetch all draft ventures for opportunity
  const ventures = await db
    .prepare('SELECT * FROM ventures WHERE opportunity_id = ? AND status = ?')
    .bind(opportunityId, 'draft')
    .all<VentureRow>()

  if (!ventures.results || ventures.results.length === 0) {
    return { total: 0, successful: 0, failed: 0, results: [] }
  }

  // Dispatch each factory in parallel
  const promises = (ventures.results ?? []).map((venture) =>
    dispatchVentureFactory(db, venture.id)
  )

  const results = await Promise.all(promises)

  const successful = results.filter((r) => r.success).length
  const failed = results.filter((r) => !r.success).length

  return {
    total: results.length,
    successful,
    failed,
    results,
  }
}
