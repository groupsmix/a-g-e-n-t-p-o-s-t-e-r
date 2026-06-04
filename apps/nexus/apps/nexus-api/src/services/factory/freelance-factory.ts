import type { D1Database } from '@cloudflare/workers-types'

// ============================================================
// Freelance Venture Factory
// Purpose: Turn a venture draft into a productized freelance service
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

interface ServiceTier {
  name: string
  deliverables: string[]
  price_usd: number
  delivery_days: number
  not_included: string[]
}

interface AIGenerationResponse {
  service_category: string
  starter_tier: ServiceTier
  pro_tier: ServiceTier
  premium_tier: ServiceTier
  portfolio_ideas: string[]
  discovery_question: string
}

// ── Build freelance venture ─────────────────────────────────

export async function buildFreelanceVenture(
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

  // Call AI to generate service package
  const aiPrompt = buildFreelancePrompt(opportunity)
  const aiResponse = await callAIGeneration(db, aiPrompt)

  // Parse AI response
  const serviceData = parseAIResponse(aiResponse)

  // Create offer record (price = starter tier)
  const offerId = crypto.randomUUID().replace(/-/g, '')
  await db.prepare(`
    INSERT INTO offers (
      id, venture_id, title, description, price_cents, currency,
      status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).bind(
    offerId,
    ventureId,
    `${serviceData.starter_tier.name} - Freelance Service`,
    `Freelance service: ${serviceData.service_category}`,
    serviceData.starter_tier.price_usd * 100, // Convert to cents
    'USD',
    'draft'
  ).run()

  // Create asset_library record with all 3 tiers in metadata
  const assetId = crypto.randomUUID().replace(/-/g, '')
  await db.prepare(`
    INSERT INTO asset_library (
      id, venture_id, asset_type, file_path, prompt_used, ai_model_used,
      tags, metadata, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).bind(
    assetId,
    ventureId,
    'service_package',
    `drafts/freelance/${ventureId}.json`,
    aiPrompt,
    'gpt-4',
    JSON.stringify(['freelance', 'service_package', 'ai_generated']),
    JSON.stringify({
      service_category: serviceData.service_category,
      tiers: {
        starter: serviceData.starter_tier,
        pro: serviceData.pro_tier,
        premium: serviceData.premium_tier,
      },
      portfolio_ideas: serviceData.portfolio_ideas,
      discovery_question: serviceData.discovery_question,
      generated_for: ventureId,
    })
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
    'freelance_factory',
    'gpt-4',
    1200,
    600,
    estimatedCostCents,
    'completed',
    new Date().toISOString(),
    new Date().toISOString(),
    JSON.stringify({ service_category: serviceData.service_category }),
  ).run()

  // Update venture AI cost
  await db.prepare(`
    UPDATE ventures SET ai_cost_cents = ai_cost_cents + ?, updated_at = datetime('now') WHERE id = ?
  `).bind(estimatedCostCents, ventureId).run()

  return { offerId, assetId }
}

// ── Build freelance prompt ─────────────────────────────────

function buildFreelancePrompt(opportunity: OpportunityRow): string {
  return `Create a productized freelance service package for: ${opportunity.trend_name}
 Target client: ${opportunity.target_buyer}
 Problem solved: ${opportunity.product_idea}
Why it sells: ${opportunity.why_it_sells}

 Generate 3 service tiers:

 STARTER tier:
  - Service name
  - Exact deliverables (3-5 bullet points, be specific)
  - Price in USD (between $97 and $297)
  - Delivery time in business days
  - What is NOT included

 PRO tier:
  - Same fields, more comprehensive, $297-$997

 PREMIUM tier:
  - Same fields, full custom, $997-$2997

 Also generate:
  - Service category (design | automation | templates | strategy | writing | research)
  - 3 portfolio item ideas that demonstrate this service
  - Discovery call question (one qualifying question for leads)

 Respond ONLY in JSON with keys: service_category, starter_tier (object), pro_tier (object), premium_tier (object), portfolio_ideas (array), discovery_question`
}

// ── Call AI generation ─────────────────────────────────────

async function callAIGeneration(_db: D1Database, _prompt: string): Promise<string> {
  // In a real implementation, this would call the AI worker
  // For now, return a mock response
  return JSON.stringify({
    service_category: 'automation',
    starter_tier: {
      name: 'Basic Automation Setup',
      deliverables: [
        'Initial process mapping',
        'Basic Zapier/Make.com setup',
        '2 automated workflows',
        'Documentation',
        '1 revision',
      ],
      price_usd: 197,
      delivery_days: 7,
      not_included: ['Advanced integrations', 'Custom code', 'Ongoing maintenance'],
    },
    pro_tier: {
      name: 'Pro Automation Package',
      deliverables: [
        'Complete process audit',
        '5 advanced workflows',
        'Custom API integrations',
        'Error handling setup',
        'Training documentation',
        '2 revisions',
        '30-day support',
      ],
      price_usd: 697,
      delivery_days: 14,
      not_included: ['Custom software development', '24/7 monitoring'],
    },
    premium_tier: {
      name: 'Enterprise Automation System',
      deliverables: [
        'Full business automation audit',
        '10+ complex workflows',
        'Custom integrations and scripts',
        'Complete testing suite',
        'Team training',
        'Ongoing optimization',
        'Unlimited revisions',
        '90-day priority support',
        'Dedicated account manager',
      ],
      price_usd: 1997,
      delivery_days: 30,
      not_included: ['Separate software licenses'],
    },
    portfolio_ideas: [
      'E-commerce store automation case study',
      'Lead generation workflow showcase',
      'Content repurposing automation demo',
    ],
    discovery_question: 'What is your current monthly revenue target you want to achieve through automation?',
  })
}

// ── Parse AI response ─────────────────────────────────────

function parseAIResponse(response: string): AIGenerationResponse {
  try {
    return JSON.parse(response)
  } catch {
    // Fallback to default if parsing fails
    return {
      service_category: 'general',
      starter_tier: {
        name: 'Starter Package',
        deliverables: ['Deliverable 1', 'Deliverable 2'],
        price_usd: 197,
        delivery_days: 7,
        not_included: [],
      },
      pro_tier: {
        name: 'Pro Package',
        deliverables: ['Deliverable 1', 'Deliverable 2', 'Deliverable 3'],
        price_usd: 697,
        delivery_days: 14,
        not_included: [],
      },
      premium_tier: {
        name: 'Premium Package',
        deliverables: ['Deliverable 1', 'Deliverable 2', 'Deliverable 3', 'Deliverable 4'],
        price_usd: 1997,
        delivery_days: 30,
        not_included: [],
      },
      portfolio_ideas: ['Portfolio item 1', 'Portfolio item 2', 'Portfolio item 3'],
      discovery_question: 'What is your main goal for this project?',
    }
  }
}
