// ============================================================
// Venture Factory Service
// ============================================================
// Creates and manages ventures from opportunities across different verticals.
// One opportunity can spawn multiple ventures (digital, POD, content, affiliate, freelance, ecommerce).

import type { Env } from '../env'
import type { 
  Venture, Vertical, VentureStatus, VentureWithDetails 
} from '@nexus/types/portfolio'
import { VentureService } from './portfolio'

interface Opportunity {
  id: string
  trendName: string
  targetBuyer: string
}

export interface VentureTemplate {
  vertical: Vertical
  defaultStrategy: string
  defaultBudgetCapCents: number
  defaultTestQuotaClicks: number
  requiredPlatforms: string[]
  suggestedPriceRange: { minCents: number; maxCents: number }
}

export interface VentureFactoryConfig {
  enabledVerticals: Vertical[]
  budgetCaps: Record<Vertical, number>
  testQuotas: Record<Vertical, number>
}

export interface VentureCreationResult {
  venture: Venture
  status: 'created' | 'skipped' | 'failed'
  reason?: string
}

export class VentureFactoryService {
  private ventureService: VentureService
  
  // Default templates for each vertical
  private readonly templates: Record<Vertical, VentureTemplate> = {
    digital: {
      vertical: 'digital',
      defaultStrategy: 'Create and sell digital products (templates, guides, courses)',
      defaultBudgetCapCents: 50000, // $500
      defaultTestQuotaClicks: 200,
      requiredPlatforms: ['gumroad', 'etsy'],
      suggestedPriceRange: { minCents: 997, maxCents: 4997 }, // $9.97 - $49.97
    },
    pod: {
      vertical: 'pod',
      defaultStrategy: 'Design and sell print-on-demand products',
      defaultBudgetCapCents: 100000, // $1000
      defaultTestQuotaClicks: 500,
      requiredPlatforms: ['printful', 'printify', 'redbubble'],
      suggestedPriceRange: { minCents: 1999, maxCents: 3499 }, // $19.99 - $34.99
    },
    content: {
      vertical: 'content',
      defaultStrategy: 'Create and monetize content (blogs, newsletters, social)',
      defaultBudgetCapCents: 30000, // $300
      defaultTestQuotaClicks: 300,
      requiredPlatforms: ['substack', 'medium', 'youtube'],
      suggestedPriceRange: { minCents: 0, maxCents: 999 }, // Free - $9.99
    },
    affiliate: {
      vertical: 'affiliate',
      defaultStrategy: 'Promote existing products for commission',
      defaultBudgetCapCents: 20000, // $200
      defaultTestQuotaClicks: 400,
      requiredPlatforms: ['amazon', 'shareasale', 'impact'],
      suggestedPriceRange: { minCents: 0, maxCents: 0 }, // Commission-based
    },
    freelance: {
      vertical: 'freelance',
      defaultStrategy: 'Offer services on freelance platforms',
      defaultBudgetCapCents: 0, // No upfront cost
      defaultTestQuotaClicks: 50,
      requiredPlatforms: ['upwork', 'fiverr', 'freelancer'],
      suggestedPriceRange: { minCents: 5000, maxCents: 50000 }, // $50 - $500
    },
    ecommerce: {
      vertical: 'ecommerce',
      defaultStrategy: 'Build and sell physical products',
      defaultBudgetCapCents: 200000, // $2000
      defaultTestQuotaClicks: 300,
      requiredPlatforms: ['shopify', 'woocommerce', 'amazon'],
      suggestedPriceRange: { minCents: 1999, maxCents: 9999 }, // $19.99 - $99.99
    },
  }

  constructor(private env: Env) {
    this.ventureService = new VentureService(env)
  }

  // ============================================================
  // Main Factory Methods
  // ============================================================

  /**
   * Create ventures for an opportunity across all enabled verticals
   */
  async createVenturesForOpportunity(
    opportunityId: string,
    config?: Partial<VentureFactoryConfig>
  ): Promise<VentureCreationResult[]> {
    const opportunity = await this.getOpportunity(opportunityId)
    if (!opportunity) {
      throw new Error(`Opportunity ${opportunityId} not found`)
    }

    const enabledVerticals = config?.enabledVerticals || this.getDefaultVerticals(opportunity)
    const results: VentureCreationResult[] = []

    for (const vertical of enabledVerticals) {
      try {
        const result = await this.createVentureForVertical(opportunity, vertical, config)
        results.push(result)
      } catch (error) {
        results.push({
          venture: {} as Venture,
          status: 'failed',
          reason: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }

    return results
  }

  /**
   * Create a single venture for a specific vertical
   */
  async createVentureForVertical(
    opportunity: Opportunity,
    vertical: Vertical,
    config?: Partial<VentureFactoryConfig>
  ): Promise<VentureCreationResult> {
    // Check if venture already exists for this opportunity+vertical
    const existing = await this.ventureService.list({
      opportunity_id: opportunity.id,
      vertical,
      limit: 1,
    })

    if (existing.ventures.length > 0) {
      return {
        venture: existing.ventures[0],
        status: 'skipped',
        reason: 'Venture already exists for this vertical',
      }
    }

    const template = this.templates[vertical]
    const budgetCap = config?.budgetCaps?.[vertical] || template.defaultBudgetCapCents
    const testQuota = config?.testQuotas?.[vertical] || template.defaultTestQuotaClicks

    const venture = await this.ventureService.create({
      opportunity_id: opportunity.id,
      vertical,
      strategy: this.generateStrategy(opportunity, vertical),
      budget_cap_cents: budgetCap,
      test_quota_clicks: testQuota,
    })

    return {
      venture,
      status: 'created',
    }
  }

  // ============================================================
  // Strategy Generation
  // ============================================================

  private generateStrategy(opportunity: Opportunity, vertical: Vertical): string {
    const template = this.templates[vertical]
    const baseStrategy = template.defaultStrategy
    
    // Customize strategy based on opportunity data
    const customizations: string[] = []
    
    if (opportunity.target_buyer) {
      customizations.push(`Target audience: ${opportunity.target_buyer}`)
    }
    
    if (opportunity.product_idea) {
      customizations.push(`Product focus: ${opportunity.product_idea}`)
    }
    
    if (opportunity.why_it_sells) {
      customizations.push(`Value proposition: ${opportunity.why_it_sells}`)
    }

    if (opportunity.niche) {
      customizations.push(`Niche: ${opportunity.niche}`)
    }

    if (customizations.length > 0) {
      return `${baseStrategy}. ${customizations.join('. ')}`
    }

    return baseStrategy
  }

  // ============================================================
  // Vertical Selection Logic
  // ============================================================

  private getDefaultVerticals(opportunity: Opportunity): Vertical[] {
    // Use suggested_format from opportunity to determine verticals
    const formatMap: Record<string, Vertical[]> = {
      'freelance': ['freelance'],
      'digital_product': ['digital', 'affiliate'],
      'pod': ['pod'],
      'content': ['content', 'affiliate'],
    }

    const suggestedVerticals = formatMap[opportunity.suggested_format] || []
    
    // If no specific format suggested, try all verticals
    if (suggestedVerticals.length === 0) {
      return ['digital', 'content', 'affiliate'] // Start with lowest cost verticals
    }

    return suggestedVerticals
  }

  // ============================================================
  // Venture Lifecycle Management
  // ============================================================

  /**
   * Move venture from draft to building status
   */
  async startBuilding(ventureId: string): Promise<Venture | null> {
    return this.ventureService.updateStatus(ventureId, 'building')
  }

  /**
   * Move venture from building to testing status
   */
  async startTesting(ventureId: string): Promise<Venture | null> {
    return this.ventureService.updateStatus(ventureId, 'testing')
  }

  /**
   * Move venture from testing to live status
   */
  async goLive(ventureId: string): Promise<Venture | null> {
    return this.ventureService.updateStatus(ventureId, 'live')
  }

  /**
   * Move venture to scaling status
   */
  async startScaling(ventureId: string): Promise<Venture | null> {
    return this.ventureService.updateStatus(ventureId, 'scaling')
  }

  /**
   * Move venture to mutating status (pivot strategy)
   */
  async startMutation(ventureId: string): Promise<Venture | null> {
    return this.ventureService.updateStatus(ventureId, 'mutating')
  }

  /**
   * Kill a venture and record the reason
   */
  async killVenture(ventureId: string, reason: string): Promise<Venture | null> {
    return this.ventureService.killVenture(ventureId, reason)
  }

  /**
   * Archive a venture
   */
  async archiveVenture(ventureId: string): Promise<Venture | null> {
    return this.ventureService.updateStatus(ventureId, 'archived')
  }

  // ============================================================
  // Budget Management
  // ============================================================

  async updateBudget(ventureId: string, newBudgetCents: number): Promise<Venture | null> {
    const venture = await this.ventureService.getById(ventureId)
    if (!venture) return null

    const now = new Date().toISOString()
    await this.env.DB.prepare(`
      UPDATE ventures SET budget_cap_cents = ?, updated_at = ? WHERE id = ?
    `).bind(newBudgetCents, now, ventureId).run()

    return this.ventureService.getById(ventureId)
  }

  async checkBudgetUtilization(ventureId: string): Promise<{
    budgetCap: number
    aiCost: number
    remaining: number
    utilizationPercent: number
  }> {
    const venture = await this.ventureService.getById(ventureId)
    if (!venture) {
      throw new Error('Venture not found')
    }

    const remaining = venture.budget_cap_cents - venture.ai_cost_cents
    const utilizationPercent = venture.budget_cap_cents > 0 
      ? (venture.ai_cost_cents / venture.budget_cap_cents) * 100 
      : 0

    return {
      budgetCap: venture.budget_cap_cents,
      aiCost: venture.ai_cost_cents,
      remaining,
      utilizationPercent,
    }
  }

  // ============================================================
  // Test Quota Management
  // ============================================================

  async updateTestQuota(ventureId: string, newQuota: number): Promise<Venture | null> {
    const now = new Date().toISOString()
    await this.env.DB.prepare(`
      UPDATE ventures SET test_quota_clicks = ?, updated_at = ? WHERE id = ?
    `).bind(newQuota, now, ventureId).run()

    return this.ventureService.getById(ventureId)
  }

  async checkTestQuotaProgress(ventureId: string): Promise<{
    quota: number
    clicksTracked: number
    remaining: number
    progressPercent: number
  }> {
    const venture = await this.ventureService.getById(ventureId)
    if (!venture) {
      throw new Error('Venture not found')
    }

    // Count clicks from tracked links for this venture's offers
    const offers = await this.env.DB.prepare(
      'SELECT id FROM offers WHERE venture_id = ?'
    ).bind(ventureId).all<{ id: string }>()

    let clicksTracked = 0
    if (offers.results && offers.results.length > 0) {
      const offerIds = offers.results.map(o => o.id)
      const placeholders = offerIds.map(() => '?').join(',')
      const clickResult = await this.env.DB.prepare(`
        SELECT COUNT(*) as count FROM tracked_links 
        WHERE offer_id IN (${placeholders})
      `).bind(...offerIds).first<{ count: number }>()
      
      clicksTracked = clickResult?.count || 0
    }

    const remaining = venture.test_quota_clicks - clicksTracked
    const progressPercent = venture.test_quota_clicks > 0 
      ? (clicksTracked / venture.test_quota_clicks) * 100 
      : 0

    return {
      quota: venture.test_quota_clicks,
      clicksTracked,
      remaining,
      progressPercent,
    }
  }

  // ============================================================
  // Portfolio Queries
  // ============================================================

  async getVenturesByOpportunity(opportunityId: string): Promise<VentureWithDetails[]> {
    const ventures = await this.ventureService.list({ opportunity_id: opportunityId })
    const detailedVentures: VentureWithDetails[] = []

    for (const venture of ventures.ventures) {
      const detailed = await this.ventureService.getWithDetails(venture.id)
      if (detailed) {
        detailedVentures.push(detailed)
      }
    }

    return detailedVentures
  }

  async getActiveVentures(): Promise<Venture[]> {
    const result = await this.env.DB.prepare(`
      SELECT * FROM ventures 
      WHERE status IN ('building', 'testing', 'live', 'scaling', 'mutating')
      ORDER BY created_at DESC
    `).all<Venture>()

    return result.results || []
  }

  async getVenturesByStatus(status: VentureStatus): Promise<Venture[]> {
    const result = await this.env.DB.prepare(`
      SELECT * FROM ventures WHERE status = ? ORDER BY created_at DESC
    `).bind(status).all<Venture>()

    return result.results || []
  }

  async getVenturesByVertical(vertical: Vertical): Promise<Venture[]> {
    const result = await this.env.DB.prepare(`
      SELECT * FROM ventures WHERE vertical = ? ORDER BY created_at DESC
    `).bind(vertical).all<Venture>()

    return result.results || []
  }

  // ============================================================
  // Performance Analytics
  // ============================================================

  async getVenturePerformance(ventureId: string): Promise<{
    venture: VentureWithDetails | null
    budgetUtilization: Awaited<ReturnType<VentureFactoryService['checkBudgetUtilization']>>
    testProgress: Awaited<ReturnType<VentureFactoryService['checkTestQuotaProgress']>>
    offerCount: number
    totalRevenue: number
    totalProfit: number
    roi: number
  }> {
    const venture = await this.ventureService.getWithDetails(ventureId)
    const budgetUtilization = await this.checkBudgetUtilization(ventureId)
    const testProgress = await this.checkTestQuotaProgress(ventureId)

    const offerCount = venture?.offer_count || 0

    // Get economic events for this venture
    const offersResult = await this.env.DB.prepare(
      'SELECT id FROM offers WHERE venture_id = ?'
    ).bind(ventureId).all<{ id: string }>()

    let totalRevenue = 0
    let totalCost = 0

    if (offersResult.results && offersResult.results.length > 0) {
      const offerIds = offersResult.results.map(o => o.id)
      const placeholders = offerIds.map(() => '?').join(',')
      
      const revenueResult = await this.env.DB.prepare(`
        SELECT COALESCE(SUM(amount_cents), 0) as total FROM economic_events 
        WHERE offer_id IN (${placeholders}) AND event_type = 'revenue'
      `).bind(...offerIds).first<{ total: number }>()
      
      const costResult = await this.env.DB.prepare(`
        SELECT COALESCE(SUM(amount_cents), 0) as total FROM economic_events 
        WHERE offer_id IN (${placeholders}) AND event_type IN ('cost', 'fee')
      `).bind(...offerIds).first<{ total: number }>()

      totalRevenue = revenueResult?.total || 0
      totalCost = costResult?.total || 0
    }

    const totalProfit = totalRevenue - totalCost
    const roi = budgetUtilization.aiCost > 0 
      ? ((totalProfit - budgetUtilization.aiCost) / budgetUtilization.aiCost) * 100 
      : 0

    return {
      venture,
      budgetUtilization,
      testProgress,
      offerCount,
      totalRevenue,
      totalProfit,
      roi,
    }
  }

  // ============================================================
  // Helpers
  // ============================================================

  private async getOpportunity(opportunityId: string): Promise<Opportunity | null> {
    return this.env.DB.prepare(`
      SELECT * FROM opportunities WHERE id = ?
    `).bind(opportunityId).first<Opportunity>()
  }

  getTemplate(vertical: Vertical): VentureTemplate {
    return this.templates[vertical]
  }

  getAllTemplates(): Record<Vertical, VentureTemplate> {
    return this.templates
  }
}

// ============================================================
// Types for Opportunity (temporary until shared types are complete)
// ============================================================

interface Opportunity {
  id: string
  trend_name: string
  target_buyer: string
  product_idea: string
  why_it_sells: string
  suggested_format: string
  niche: string | null
}

// ============================================================
// Factory
// ============================================================

export function getVentureFactoryService(env: Env): VentureFactoryService {
  return new VentureFactoryService(env)
}