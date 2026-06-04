import type { D1Database } from '@cloudflare/workers-types'

// ============================================================
// Affiliate Venture Factory
// Purpose: Turn a venture draft into an affiliate content piece
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
  article_type: string
  article_title: string
  product_categories: string[]
  evaluation_criteria: string[]
  article_structure: string[]
  affiliate_disclosure: string
  affiliate_programs: string[]
}

// ── Build affiliate venture ─────────────────────────────────

export async function buildAffiliateVenture(
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

  // Call AI to generate affiliate content brief
  const aiPrompt = buildAffiliatePrompt(opportunity)
  const aiResponse = await callAIGeneration(db, aiPrompt)

  // Parse AI response
  const affiliateData = parseAIResponse(aiResponse)

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
    affiliateData.article_title,
    `Affiliate content: ${affiliateData.article_type}`,
    0, // Affiliate content is free to read
    'USD',
    'draft'
  ).run()

  // Create asset_library record with disclosure in metadata
  const assetId = crypto.randomUUID().replace(/-/g, '')
  await db.prepare(`
    INSERT INTO asset_library (
      id, venture_id, asset_type, file_path, prompt_used, ai_model_used,
      tags, metadata, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).bind(
    assetId,
    ventureId,
    'affiliate_review',
    `drafts/affiliate/${ventureId}.json`,
    aiPrompt,
    'gpt-4',
    JSON.stringify(['affiliate_page', 'review', 'ai_generated']),
    JSON.stringify({
      article_type: affiliateData.article_type,
      product_categories: affiliateData.product_categories,
      evaluation_criteria: affiliateData.evaluation_criteria,
      article_structure: affiliateData.article_structure,
      affiliate_disclosure: affiliateData.affiliate_disclosure,
      affiliate_programs: affiliateData.affiliate_programs,
      generated_for: ventureId,
    })
  ).run()

  // Log agent_run with cost
  const agentRunId = crypto.randomUUID().replace(/-/g, '')
  const estimatedCostCents = 180 // Estimated cost for AI generation
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
    'affiliate_draft',
    'affiliate_factory',
    'gpt-4',
    900,
    450,
    estimatedCostCents,
    'completed',
    new Date().toISOString(),
    new Date().toISOString(),
    JSON.stringify({ article_type: affiliateData.article_type }),
  ).run()

  // Update venture AI cost
  await db.prepare(`
    UPDATE ventures SET ai_cost_cents = ai_cost_cents + ?, updated_at = datetime('now') WHERE id = ?
  `).bind(estimatedCostCents, ventureId).run()

  return { offerId, assetId }
}

// ── Build affiliate prompt ─────────────────────────────────

function buildAffiliatePrompt(opportunity: OpportunityRow): string {
  return `Create an affiliate content brief for: ${opportunity.trend_name}
 Target audience: ${opportunity.target_buyer}
 Product idea: ${opportunity.product_idea}

 Generate:
1. Article type: buyer's guide | product comparison | best-of list | review | how-to-choose
2. Article title
3. 5-7 product/tool categories to review (do NOT name specific brands — use categories: 'meal planning apps', 'budget spreadsheet tools' etc.)
4. Evaluation criteria (5 criteria for ranking products)
5. Article structure outline (H2 sections)
6. Affiliate disclosure text (FTC compliant, 1-2 sentences)
7. Which affiliate programs to research: Amazon Associates | ShareASale | CJ Affiliate | Impact | direct programs

Respond ONLY in JSON with keys: article_type, article_title, product_categories (array), evaluation_criteria (array), article_structure (array), affiliate_disclosure, affiliate_programs (array)`
}

// ── Call AI generation ─────────────────────────────────────

async function callAIGeneration(_db: D1Database, _prompt: string): Promise<string> {
  // In a real implementation, this would call the AI worker
  // For now, return a mock response
  return JSON.stringify({
    article_type: 'buyer\'s guide',
    article_title: 'The Ultimate Buyer\'s Guide to Productivity Tools',
    product_categories: [
      'task management apps',
      'time tracking software',
      'note-taking tools',
      'calendar apps',
      'project management platforms',
      'automation tools',
    ],
    evaluation_criteria: [
      'Ease of use',
      'Value for money',
      'Integration capabilities',
      'Customer support',
      'Mobile app quality',
    ],
    article_structure: [
      'Introduction',
      'What to look for in productivity tools',
      'Top tools by category',
      'Comparison table',
      'Pros and cons',
      'Pricing comparison',
      'How to choose',
      'Final recommendation',
    ],
    affiliate_disclosure: 'This post contains affiliate links. If you make a purchase through these links, we may earn a commission at no additional cost to you.',
    affiliate_programs: ['Amazon Associates', 'ShareASale', 'CJ Affiliate'],
  })
}

// ── Parse AI response ─────────────────────────────────────

function parseAIResponse(response: string): AIGenerationResponse {
  try {
    return JSON.parse(response)
  } catch {
    // Fallback to default if parsing fails
    return {
      article_type: 'buyer\'s guide',
      article_title: 'Product Buyer\'s Guide',
      product_categories: ['Category 1', 'Category 2', 'Category 3'],
      evaluation_criteria: ['Criteria 1', 'Criteria 2', 'Criteria 3'],
      article_structure: ['Introduction', 'Content', 'Conclusion'],
      affiliate_disclosure: 'This post contains affiliate links. We may earn a commission if you make a purchase.',
      affiliate_programs: ['Amazon Associates'],
    }
  }
}
