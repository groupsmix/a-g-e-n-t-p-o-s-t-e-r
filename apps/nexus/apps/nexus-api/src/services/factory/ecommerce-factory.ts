import type { D1Database } from '@cloudflare/workers-types'

// ============================================================
// E-commerce Venture Factory
// Purpose: Turn a venture draft into an e-commerce product or bundle
// ============================================================

interface VentureRow {
  id: string
  opportunity_id: string
  vertical: string
  strategy: string
}

interface OpportunityRow {
  id: string
  trend_name: string
  target_buyer: string
  product_idea: string
  why_it_sells: string
}

interface BundleItem {
  item: string
  unit_cost_usd: number
}

interface AIGenerationResponse {
  product_title: string
  product_type: string
  bundle_includes: BundleItem[]
  total_retail_price_usd: number
  variants: Array<{ name: string; price_modifier: string }>
  product_description: string
  fulfillment_type: string
  feasible: string
  feasibility_explanation?: string
}

// ── Build e-commerce venture ─────────────────────────────────

export async function buildEcommerceVenture(
  db: D1Database,
  ventureId: string
): Promise<{ offerId: string; assetId: string; flagged: boolean }> {
  // Fetch venture + opportunity data
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

  // Call AI to generate e-commerce product spec
  const aiPrompt = buildEcommercePrompt(opportunity)
  const aiResponse = await callAIGeneration(db, aiPrompt)

  // Parse AI response
  const productData = parseAIResponse(aiResponse)

  // Check feasibility
  const flagged = productData.feasible === 'NO'
  const status = flagged ? 'flagged' : 'draft'

  // Create offer record
  const offerId = crypto.randomUUID().replace(/-/g, '')
  await db.prepare(`
    INSERT INTO offers (
      id, venture_id, title, description, price_cents, currency,
      status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).bind(
    offerId,
    ventureId,
    productData.product_title,
    productData.product_description,
    productData.total_retail_price_usd * 100, // Convert to cents
    'USD',
    status
  ).run()

  // Create asset_library record
  const assetId = crypto.randomUUID().replace(/-/g, '')
  const metadata: Record<string, unknown> = {
    product_type: productData.product_type,
    bundle_includes: productData.bundle_includes,
    variants: productData.variants,
    fulfillment_type: productData.fulfillment_type,
    generated_for: ventureId,
  }

  if (flagged) {
    metadata.feasibility_check = false
    metadata.feasibility_explanation = productData.feasibility_explanation
  }

  await db.prepare(`
    INSERT INTO asset_library (
      id, venture_id, asset_type, file_path, prompt_used, ai_model_used,
      tags, metadata, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).bind(
    assetId,
    ventureId,
    'product_spec',
    `drafts/ecommerce/${ventureId}.json`,
    aiPrompt,
    'gpt-4',
    JSON.stringify(['ecommerce', 'bundle', 'ai_generated']),
    JSON.stringify(metadata)
  ).run()

  // Log agent_run with cost
  const agentRunId = crypto.randomUUID().replace(/-/g, '')
  const estimatedCostCents = 220 // Estimated cost for AI generation
  await db.prepare(`
    INSERT INTO agent_runs (
      id, opportunity_id, venture_id, offer_id, workflow_type,
      agent_name, model, input_tokens, output_tokens, cost_cents,
      status, started_at, finished_at, metadata_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).bind(
    agentRunId,
    venture.opportunity_id,
    ventureId,
    offerId,
    'asset_generate',
    'ecommerce_factory',
    'gpt-4',
    1100,
    550,
    estimatedCostCents,
    'completed',
    new Date().toISOString(),
    new Date().toISOString(),
    JSON.stringify({ product_type: productData.product_type, feasible: !flagged }),
  ).run()

  // Update venture AI cost
  await db.prepare(`
    UPDATE ventures SET ai_cost_cents = ai_cost_cents + ?, updated_at = datetime('now') WHERE id = ?
  `).bind(estimatedCostCents, ventureId).run()

  return { offerId, assetId, flagged }
}

// ── Build e-commerce prompt ─────────────────────────────────

function buildEcommercePrompt(opportunity: OpportunityRow): string {
  return `Create an e-commerce product specification for: ${opportunity.trend_name}
 Target buyer: ${opportunity.target_buyer}
 Product idea: ${opportunity.product_idea}
Why it sells: ${opportunity.why_it_sells}

 Generate:
1. Product title (SEO-friendly)
2. Product type: digital+physical bundle | subscription box | kit | curated collection
3. What the bundle includes (list each item with unit cost estimate in USD)
4. Total suggested retail price in USD
5. Shopify product variants (e.g. size options, color options, or digital vs physical tiers)
6. Product description for Shopify (200 words)
7. Fulfillment type: dropship | print-on-demand | self-fulfill | digital delivery
8. Is this product feasible as a solo operator? YES or NO and why

Respond ONLY in JSON with keys: product_title, product_type, bundle_includes (array of objects with item and unit_cost_usd), total_retail_price_usd, variants (array), product_description, fulfillment_type, feasible, feasibility_explanation`
}

// ── Call AI generation ─────────────────────────────────────

async function callAIGeneration(_db: D1Database, _prompt: string): Promise<string> {
  // In a real implementation, this would call the AI worker
  // For now, return a mock response
  return JSON.stringify({
    product_title: 'Complete Digital Entrepreneurship Starter Bundle',
    product_type: 'digital+physical bundle',
    bundle_includes: [
      { item: 'Digital entrepreneurship course', unit_cost_usd: 0 },
      { item: 'Printed business plan template', unit_cost_usd: 2 },
      { item: 'Physical planner/journal', unit_cost_usd: 8 },
      { item: 'Checklist card deck', unit_cost_usd: 3 },
      { item: 'Access to private community', unit_cost_usd: 0 },
    ],
    total_retail_price_usd: 97,
    variants: [
      { name: 'Digital Only', price_modifier: '-50%' },
      { name: 'Standard Bundle', price_modifier: '0%' },
      { name: 'Premium Bundle with coaching call', price_modifier: '+100%' },
    ],
    product_description: 'Everything you need to start your digital entrepreneurship journey in one comprehensive bundle. Includes video course, physical planning tools, and ongoing community support. Perfect for aspiring entrepreneurs who want a structured path to success.',
    fulfillment_type: 'self-fulfill',
    feasible: 'YES',
  })
}

// ── Parse AI response ─────────────────────────────────────

function parseAIResponse(response: string): AIGenerationResponse {
  try {
    return JSON.parse(response)
  } catch {
    // Fallback to default if parsing fails
    return {
      product_title: 'E-commerce Bundle',
      product_type: 'bundle',
      bundle_includes: [
        { item: 'Product 1', unit_cost_usd: 5 },
        { item: 'Product 2', unit_cost_usd: 10 },
      ],
      total_retail_price_usd: 47,
      variants: [
        { name: 'Standard', price_modifier: '0%' },
      ],
      product_description: 'Complete e-commerce product bundle',
      fulfillment_type: 'self-fulfill',
      feasible: 'YES',
    }
  }
}
