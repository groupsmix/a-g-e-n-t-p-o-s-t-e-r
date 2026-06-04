import type { D1Database } from '@cloudflare/workers-types'

// ============================================================
// Digital Product Venture Factory
// Purpose: Turn a venture draft into a complete digital product
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
  title: string
  product_type: string
  includes: string[]
  price_usd: number
  description: string
  thumbnail_headline: string
}

// ── Build digital venture ─────────────────────────────────────

export async function buildDigitalVenture(
  db: D1Database,
  ventureId: string
): Promise<{ offerId: string; assetId: string }> {
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

  // Call AI to generate product details
  const aiPrompt = buildDigitalProductPrompt(opportunity)
  const aiResponse = await callAIGeneration(db, aiPrompt)

  // Parse AI response
  const productData = parseAIResponse(aiResponse)

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
    productData.title,
    productData.description,
    productData.price_usd * 100, // Convert to cents
    'USD',
    'draft'
  ).run()

  // Create asset_library record
  const assetId = crypto.randomUUID().replace(/-/g, '')
  await db.prepare(`
    INSERT INTO asset_library (
      id, venture_id, asset_type, file_path, prompt_used, ai_model_used,
      tags, metadata, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).bind(
    assetId,
    ventureId,
    'listing_copy',
    `drafts/digital/${ventureId}.json`,
    aiPrompt,
    'gpt-4',
    JSON.stringify(['digital_product', 'listing', 'ai_generated']),
    JSON.stringify({
      product_type: productData.product_type,
      includes: productData.includes,
      thumbnail_headline: productData.thumbnail_headline,
      generated_for: ventureId,
    })
  ).run()

  // Log agent_run with cost (estimate)
  const agentRunId = crypto.randomUUID().replace(/-/g, '')
  const estimatedCostCents = 200 // Estimated cost for AI generation
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
    'digital_factory',
    'gpt-4',
    1000, // Estimated input tokens
    500, // Estimated output tokens
    estimatedCostCents,
    'completed',
    new Date().toISOString(),
    new Date().toISOString(),
    JSON.stringify({ product_type: productData.product_type }),
  ).run()

  // Update venture AI cost
  await db.prepare(`
    UPDATE ventures SET ai_cost_cents = ai_cost_cents + ?, updated_at = datetime('now') WHERE id = ?
  `).bind(estimatedCostCents, ventureId).run()

  return { offerId, assetId }
}

// ── Build digital product prompt ───────────────────────────────

function buildDigitalProductPrompt(opportunity: OpportunityRow): string {
  return `You are creating a digital product for: ${opportunity.trend_name}
Target audience: ${opportunity.target_buyer}
Product idea: ${opportunity.product_idea}
Why it sells: ${opportunity.why_it_sells}

Generate:
1. Product title (compelling, specific)
2. Product type (PDF guide | template pack | swipe file | checklist bundle | workbook)
3. What it includes (5-8 bullet points)
4. Suggested price (in USD, between $7 and $47)
5. Gumroad listing description (150 words max, benefit-focused)
6. Thumbnail headline (10 words max)

Respond ONLY in JSON with keys: title, product_type, includes, price_usd, description, thumbnail_headline`
}

// ── Call AI generation ───────────────────────────────────────

async function callAIGeneration(_db: D1Database, _prompt: string): Promise<string> {
  // In a real implementation, this would call the AI worker
  // For now, return a mock response
  return JSON.stringify({
    title: 'Ultimate Guide to Digital Product Creation',
    product_type: 'PDF guide',
    includes: [
      'Step-by-step implementation guide',
      'Checklists and templates',
      'Case studies and examples',
      'Bonus resource library',
      'Troubleshooting guide',
    ],
    price_usd: 27,
    description: 'Transform your digital product creation process with this comprehensive guide. Learn proven strategies, access ready-to-use templates, and implement systems that actually work. Perfect for entrepreneurs who want to scale their digital product business efficiently.',
    thumbnail_headline: 'Master Digital Products',
  })
}

// ── Parse AI response ─────────────────────────────────────────

function parseAIResponse(response: string): AIGenerationResponse {
  try {
    return JSON.parse(response)
  } catch {
    // Fallback to default if parsing fails
    return {
      title: 'Digital Product Guide',
      product_type: 'PDF guide',
      includes: ['Step-by-step guide', 'Templates', 'Examples'],
      price_usd: 17,
      description: 'Comprehensive guide to help you succeed with digital products.',
      thumbnail_headline: 'Digital Success Guide',
    }
  }
}
