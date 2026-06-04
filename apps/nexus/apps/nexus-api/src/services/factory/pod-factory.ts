import type { D1Database } from '@cloudflare/workers-types'

// ============================================================
// POD Venture Factory
// Purpose: Turn a venture draft into a Print-on-Demand product
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

interface AIGenerationResponse {
  product_type: string
  design_concept: string
  text_elements: string[]
  niche_keywords: string[]
  product_title: string
  product_description: string
  price_range: string
  trademark_risk: string
  trademark_explanation?: string
}

// ── Build POD venture ─────────────────────────────────────────

export async function buildPODVenture(
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

  // Call AI to generate POD product details
  const aiPrompt = buildPODPrompt(opportunity)
  const aiResponse = await callAIGeneration(db, aiPrompt)

  // Parse AI response
  const productData = parseAIResponse(aiResponse)

  // Check trademark risk
  const flagged = productData.trademark_risk === 'YES'
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
    parsePriceRange(productData.price_range),
    'USD',
    status
  ).run()

  // Create asset_library record
  const assetId = crypto.randomUUID().replace(/-/g, '')
  const metadata: Record<string, unknown> = {
    product_type: productData.product_type,
    design_concept: productData.design_concept,
    text_elements: productData.text_elements,
    niche_keywords: productData.niche_keywords,
    generated_for: ventureId,
  }

  if (flagged) {
    metadata.trademark_risk = true
    metadata.trademark_explanation = productData.trademark_explanation
  }

  await db.prepare(`
    INSERT INTO asset_library (
      id, venture_id, asset_type, file_path, prompt_used, ai_model_used,
      tags, metadata, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).bind(
    assetId,
    ventureId,
    'design_file',
    `drafts/pod/${ventureId}.json`,
    aiPrompt,
    'gpt-4',
    JSON.stringify(['pod_product', 'design_brief', 'ai_generated']),
    JSON.stringify(metadata)
  ).run()

  // Log agent_run with cost
  const agentRunId = crypto.randomUUID().replace(/-/g, '')
  const estimatedCostCents = 250 // Estimated cost for AI generation
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
    'pod_factory',
    'gpt-4',
    1200,
    600,
    estimatedCostCents,
    'completed',
    new Date().toISOString(),
    new Date().toISOString(),
    JSON.stringify({ product_type: productData.product_type, flagged }),
  ).run()

  // Update venture AI cost
  await db.prepare(`
    UPDATE ventures SET ai_cost_cents = ai_cost_cents + ?, updated_at = datetime('now') WHERE id = ?
  `).bind(estimatedCostCents, ventureId).run()

  return { offerId, assetId, flagged }
}

// ── Build POD prompt ───────────────────────────────────────────

function buildPODPrompt(opportunity: OpportunityRow): string {
  return `Create a print-on-demand product brief for: ${opportunity.trend_name}
Audience: ${opportunity.target_buyer}
Product idea: ${opportunity.product_idea}

Generate:
1. Product type (poster | notebook | mug | tote | journal | wall art | sticker sheet | desk pad)
2. Design concept (describe the visual in 3-4 sentences — colors, layout, typography style, mood)
3. Text elements to appear on the design (if any)
4. Niche keywords for listing (6-8 keywords)
5. Product title for Etsy/Shopify listing
6. Product description (100 words)
7. Suggested price range in USD
8. Trademark risk check: Does this concept use any recognizable brand names, cartoon characters, sports teams, musicians, celebrities, or movie/TV references? Answer YES or NO and if YES list what and why.

Respond ONLY in JSON with keys: product_type, design_concept, text_elements, niche_keywords, product_title, product_description, price_range, trademark_risk, trademark_explanation`
}

// ── Call AI generation ───────────────────────────────────────

async function callAIGeneration(_db: D1Database, _prompt: string): Promise<string> {
  // In a real implementation, this would call the AI worker
  // For now, return a mock response
  return JSON.stringify({
    product_type: 'poster',
    design_concept: 'Clean, modern design with a bold typography style. The color palette should be calming blues and greens with a pop of accent color. Layout should be minimalist with ample white space.',
    text_elements: [' motivational quote', 'small tagline'],
    niche_keywords: ['wall art', 'motivational poster', 'home decor', 'inspirational', 'minimalist', 'office decor'],
    product_title: 'Minimalist Motivational Wall Art',
    product_description: 'Transform your space with this beautifully designed motivational poster. Perfect for home offices, living rooms, or any space that needs a touch of inspiration. The clean design and powerful message create a focal point that uplifts and motivates.',
    price_range: '15-25',
    trademark_risk: 'NO',
  })
}

// ── Parse AI response ─────────────────────────────────────────

function parseAIResponse(response: string): AIGenerationResponse {
  try {
    return JSON.parse(response)
  } catch {
    // Fallback to default if parsing fails
    return {
      product_type: 'poster',
      design_concept: 'Minimalist design with bold typography',
      text_elements: ['Quote'],
      niche_keywords: ['wall art', 'poster'],
      product_title: 'Inspirational Poster',
      product_description: 'Beautiful wall art for your home',
      price_range: '15-25',
      trademark_risk: 'NO',
    }
  }
}

// ── Parse price range ───────────────────────────────────────

function parsePriceRange(range: string): number {
  // Parse "15-25" format to cents (use mid-point)
  const parts = range.split('-')
  if (parts.length === 2) {
    const min = parseInt(parts[0], 10)
    const max = parseInt(parts[1], 10)
    return ((min + max) / 2) * 100
  }
  return 2000 // Default $20
}
