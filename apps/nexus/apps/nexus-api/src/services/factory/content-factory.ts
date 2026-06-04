import type { D1Database } from '@cloudflare/workers-types'

// ============================================================
// Content Venture Factory
// Purpose: Turn a venture draft into an SEO content cluster
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
  pillar_title: string
  target_keyword: string
  pillar_outline: string[]
  supporting_articles: Array<{ title: string; target_keyword: string }>
  lead_magnet_idea: string
  cta_text: string
  internal_link_structure: string
  search_volume: string
}

// ── Build content venture ───────────────────────────────────

export async function buildContentVenture(
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

  // Call AI to generate content strategy
  const aiPrompt = buildContentPrompt(opportunity)
  const aiResponse = await callAIGeneration(db, aiPrompt)

  // Parse AI response
  const contentData = parseAIResponse(aiResponse)

  // Create offer record (content is free, uses traffic)
  const offerId = crypto.randomUUID().replace(/-/g, '')
  await db.prepare(`
    INSERT INTO offers (
      id, venture_id, title, description, price_cents, currency,
      status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).bind(
    offerId,
    ventureId,
    contentData.pillar_title,
    `SEO pillar content: ${contentData.pillar_title}`,
    0, // Free content
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
    'seo_brief',
    `drafts/content/${ventureId}.json`,
    aiPrompt,
    'gpt-4',
    JSON.stringify(['content_page', 'seo_brief', 'ai_generated']),
    JSON.stringify({
      pillar_title: contentData.pillar_title,
      target_keyword: contentData.target_keyword,
      pillar_outline: contentData.pillar_outline,
      supporting_articles: contentData.supporting_articles,
      lead_magnet_idea: contentData.lead_magnet_idea,
      cta_text: contentData.cta_text,
      internal_link_structure: contentData.internal_link_structure,
      search_volume: contentData.search_volume,
      generated_for: ventureId,
    })
  ).run()

  // Log agent_run with cost
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
    'content_draft',
    'content_factory',
    'gpt-4',
    1000,
    500,
    estimatedCostCents,
    'completed',
    new Date().toISOString(),
    new Date().toISOString(),
    JSON.stringify({ search_volume: contentData.search_volume }),
  ).run()

  // Update venture AI cost
  await db.prepare(`
    UPDATE ventures SET ai_cost_cents = ai_cost_cents + ?, updated_at = datetime('now') WHERE id = ?
  `).bind(estimatedCostCents, ventureId).run()

  return { offerId, assetId }
}

// ── Build content prompt ─────────────────────────────────────

function buildContentPrompt(opportunity: OpportunityRow): string {
  return `Create an SEO content strategy for: ${opportunity.trend_name}
 Target audience: ${opportunity.target_buyer}
 Product idea: ${opportunity.product_idea}
 Why it sells: ${opportunity.why_it_sells}

 Generate:
1. Pillar article title and target keyword
2. Pillar article outline (H2 sections only, 6-8 sections)
3. Five supporting article titles with their target keywords
4. Lead magnet idea connected to the content
5. CTA text to promote a digital product or service
6. Suggested internal link structure between articles
7. Estimated monthly search volume category for pillar keyword: low (<500) | medium (500-5000) | high (5000+)

 Respond ONLY in JSON with keys: pillar_title, target_keyword, pillar_outline (array), supporting_articles (array of objects with title and target_keyword), lead_magnet_idea, cta_text, internal_link_structure, search_volume`
}

// ── Call AI generation ─────────────────────────────────────

async function callAIGeneration(_db: D1Database, _prompt: string): Promise<string> {
  // In a real implementation, this would call the AI worker
  // For now, return a mock response
  return JSON.stringify({
    pillar_title: 'The Ultimate Guide to Digital Product Creation',
    target_keyword: 'digital product creation',
    pillar_outline: [
      'Introduction: What are digital products',
      'Types of digital products you can create',
      'Choosing the right platform',
      'Creating your first product',
      'Marketing and selling your products',
      'Scaling your digital product business',
      'Tools and resources',
    ],
    supporting_articles: [
      { title: 'How to choose the right digital product for your audience', target_keyword: 'digital product selection' },
      { title: 'Best platforms for selling digital products in 2024', target_keyword: 'digital product platforms' },
      { title: 'Digital product pricing strategies that work', target_keyword: 'digital product pricing' },
      { title: 'Marketing tactics for digital products', target_keyword: 'digital product marketing' },
      { title: 'Mistakes to avoid when creating digital products', target_keyword: 'digital product mistakes' },
    ],
    lead_magnet_idea: 'Free digital product creation checklist PDF',
    cta_text: 'Download our free checklist to start creating your first digital product today',
    internal_link_structure: 'Pillar links to all supporting articles. Supporting articles link back to pillar and cross-link to related articles. All articles include CTA to lead magnet.',
    search_volume: 'medium',
  })
}

// ── Parse AI response ─────────────────────────────────────

function parseAIResponse(response: string): AIGenerationResponse {
  try {
    return JSON.parse(response)
  } catch {
    // Fallback to default if parsing fails
    return {
      pillar_title: 'Comprehensive Guide',
      target_keyword: 'guide',
      pillar_outline: ['Introduction', 'Main Content', 'Conclusion'],
      supporting_articles: [
        { title: 'Supporting Article 1', target_keyword: 'keyword1' },
        { title: 'Supporting Article 2', target_keyword: 'keyword2' },
        { title: 'Supporting Article 3', target_keyword: 'keyword3' },
        { title: 'Supporting Article 4', target_keyword: 'keyword4' },
        { title: 'Supporting Article 5', target_keyword: 'keyword5' },
      ],
      lead_magnet_idea: 'Free resource download',
      cta_text: 'Get your free resource',
      internal_link_structure: 'Link pillar to all articles',
      search_volume: 'medium',
    }
  }
}
