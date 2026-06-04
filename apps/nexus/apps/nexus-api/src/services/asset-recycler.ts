import type { D1Database } from '@cloudflare/workers-types'
import type { VentureVertical } from '@nexus/types'

// ============================================================
// Asset Recycler
// Purpose: Generate derivative versions of winning assets for other verticals
// ============================================================

interface AssetRow {
  id: string
  venture_id: string
  offer_id: string | null
  asset_type: string
  title: string | null
  file_path: string | null
  cdn_url: string | null
  prompt_used: string | null
  ai_model_used: string | null
  tags: string
  performance_score: number
  usage_count: number
  metadata: string
}

interface OpportunityRow {
  id: string
  trend_name: string
}

interface RecycleResult {
  vertical: VentureVertical
  newAssetId: string
  reuseScore: number
  adaptationBrief: string
}

// ── Recycle asset for target verticals ───────────────────────────

export async function recycleAsset(
  db: D1Database,
  assetId: string,
  targetVerticals: VentureVertical[]
): Promise<RecycleResult[]> {
  // Fetch asset
  const asset = await db
    .prepare('SELECT * FROM asset_library WHERE id = ?')
    .bind(assetId)
    .first<AssetRow>()

  if (!asset) {
    throw new Error('Asset not found')
  }

  // Fetch opportunity from asset's venture
  const venture = await db
    .prepare('SELECT * FROM ventures WHERE id = ?')
    .bind(asset.venture_id)
    .first<{ opportunity_id: string }>()

  if (!venture) {
    throw new Error('Venture not found for asset')
  }

  const opportunity = await db
    .prepare('SELECT * FROM opportunities WHERE id = ?')
    .bind(venture.opportunity_id)
    .first<OpportunityRow>()

  if (!opportunity) {
    throw new Error('Opportunity not found')
  }

  const results: RecycleResult[] = []

  // For each target vertical, generate adaptation brief
  for (const vertical of targetVerticals) {
    try {
      const aiPrompt = buildRecyclePrompt(asset, opportunity, vertical)
      const aiResponse = await callAIRecycleEvaluation(db, aiPrompt)

      const evaluation = parseRecycleEvaluation(aiResponse)

      // If reuse score is high enough, create derivative asset
      if (evaluation.reuseScore >= 6) {
        const newAssetId = crypto.randomUUID().replace(/-/g, '')

        await db.prepare(`
          INSERT INTO asset_library (
            id, venture_id, asset_type, file_path, prompt_used, ai_model_used,
            tags, performance_score, usage_count, metadata, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `).bind(
          newAssetId,
          asset.venture_id,
          getVerticalAssetType(vertical),
          `recycled/${vertical}/${assetId}.json`,
          aiPrompt,
          'gpt-4',
          JSON.stringify([...JSON.parse(asset.tags), 'recycled', 'ai_generated']),
          asset.performance_score, // Inherit parent performance
          0, // Start with 0 usage
          JSON.stringify({
            parent_asset_id: assetId,
            adaptation_brief: evaluation.adaptationBrief,
            target_vertical: vertical,
            effort_hours: evaluation.effortHoursEstimate,
          })
        ).run()

        results.push({
          vertical,
          newAssetId,
          reuseScore: evaluation.reuseScore,
          adaptationBrief: evaluation.adaptationBrief,
        })
      }
    } catch (err) {
      console.error(`Failed to evaluate recycling for vertical ${vertical}:`, err)
    }
  }

  // Increment original asset usage count
  if (results.length > 0) {
    await db.prepare(`
      UPDATE asset_library SET usage_count = usage_count + ?, updated_at = datetime('now') WHERE id = ?
    `).bind(results.length, assetId).run()
  }

  return results
}

// ── Find recyclable assets ─────────────────────────────────────

export async function findRecyclableAssets(
  db: D1Database,
  opportunityId: string
): Promise<AssetRow[]> {
  // Find assets with good performance and low reuse count
  const assets = await db.prepare(`
    SELECT al.* FROM asset_library al
    JOIN ventures v ON al.venture_id = v.id
    WHERE v.opportunity_id = ?
      AND al.usage_count < 3
      AND al.performance_score >= 0.5
      AND al.asset_type NOT IN ('design_file', 'product_spec')
    ORDER BY al.performance_score DESC, al.usage_count ASC
    LIMIT 20
  `).bind(opportunityId).all<AssetRow>()

  return assets.results ?? []
}

// ── Auto recycle winners ─────────────────────────────────────

export async function autoRecycleWinners(db: D1Database): Promise<void> {
  // Find profitable offers
  const profitableOffers = await db.prepare(`
    SELECT DISTINCT o.venture_id, o.id as offer_id
    FROM offers o
    JOIN economic_events ee ON ee.offer_id = o.id AND ee.event_type = 'revenue'
    GROUP BY o.venture_id, o.id
    HAVING SUM(ee.amount_cents) > 5000
    LIMIT 10
  `).all<{ venture_id: string; offer_id: string }>()

  for (const offer of profitableOffers.results ?? []) {
    try {
      // Find assets for this offer
      const assets = await db.prepare(`
        SELECT * FROM asset_library
        WHERE offer_id = ? OR venture_id = ?
        AND usage_count < 3 AND performance_score >= 0.5
      `).bind(offer.offer_id, offer.venture_id).all<AssetRow>()

      // Get unused verticals for this venture's opportunity
      const venture = await db
        .prepare('SELECT * FROM ventures WHERE id = ?')
        .bind(offer.venture_id)
        .first<{ opportunity_id: string; vertical: string }>()

      if (venture) {
        const allVerticals: VentureVertical[] = ['digital', 'pod', 'content', 'affiliate', 'freelance', 'ecommerce']
        const usedVerticals = await db
          .prepare('SELECT DISTINCT vertical FROM ventures WHERE opportunity_id = ?')
          .bind(venture.opportunity_id)
          .all<{ vertical: string }>()

        const usedSet = new Set((usedVerticals.results ?? []).map((v) => v.vertical))
        const targetVerticals = allVerticals.filter((v) => !usedSet.has(v) && v !== venture.vertical)

        // Recycle top 2 assets to target verticals
        for (const asset of (assets.results ?? []).slice(0, 2)) {
          await recycleAsset(db, asset.id, targetVerticals.slice(0, 2))
        }
      }
    } catch (err) {
      console.error(`Failed to auto-recycle for offer ${offer.offer_id}:`, err)
    }
  }
}

// ── Build recycle prompt ───────────────────────────────────────

function buildRecyclePrompt(
  asset: AssetRow,
  opportunity: OpportunityRow,
  targetVertical: VentureVertical
): string {
  return `Adapt this existing asset for a new format.
Original asset: ${asset.title} (${asset.asset_type}) for ${opportunity.trend_name}
Target format: ${targetVertical} product

Describe in 150 words how this asset can be adapted/repurposed for the target format.
Be specific about what parts transfer directly vs what needs to change.
Respond ONLY in JSON with keys: adaptation_brief, reuse_score (0-10), effort_hours_estimate`
}

// ── Call AI recycle evaluation ───────────────────────────────

async function callAIRecycleEvaluation(_db: D1Database, _prompt: string): Promise<string> {
  // In a real implementation, this would call the AI worker
  // For now, return a mock response
  return JSON.stringify({
    adaptation_brief: 'The core content structure and messaging can be reused with minor adjustments to format-specific requirements. The underlying value proposition remains the same.',
    reuse_score: 8,
    effort_hours_estimate: 2,
  })
}

// ── Parse recycle evaluation ─────────────────────────────────

function parseRecycleEvaluation(response: string): {
  adaptationBrief: string
  reuseScore: number
  effortHoursEstimate: number
} {
  try {
    return JSON.parse(response)
  } catch {
    // Fallback to default
    return {
      adaptationBrief: 'Asset can be adapted with minimal changes',
      reuseScore: 5,
      effortHoursEstimate: 3,
    }
  }
}

// ── Get vertical asset type ───────────────────────────────────

function getVerticalAssetType(vertical: VentureVertical): string {
  const typeMap: Record<VentureVertical, string> = {
    digital: 'listing_copy',
    pod: 'design_file',
    content: 'seo_brief',
    affiliate: 'affiliate_review',
    freelance: 'service_package',
    ecommerce: 'product_spec',
  }
  return typeMap[vertical] || 'generic'
}
