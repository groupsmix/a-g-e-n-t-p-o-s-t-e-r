// ============================================================
// Offer Creation Service
// ============================================================
// Creates and manages offers for ventures. Each venture can have multiple
// offers across different platforms with different variants and pricing.

import type { Env } from '../env'
import type {
  Offer, Venture
} from '@nexus/types/portfolio'
import { OfferService } from './portfolio'

export interface OfferTemplate {
  platformId: string
  platformName: string
  defaultTitle: string
  defaultDescription: string
  suggestedPriceCents: number
  variantType: string
  variantData: Record<string, unknown>
}

export interface OfferCreationConfig {
  platforms: string[]
  priceStrategy: 'low' | 'medium' | 'high'
  enableAvariants: boolean
}

export interface OfferCreationResult {
  offer: Offer
  status: 'created' | 'skipped' | 'failed'
  reason?: string
}

export class OfferCreationService {
  private offerService: OfferService
  
  constructor(private env: Env) {
    this.offerService = new OfferService(env)
  }

  // ============================================================
  // Main Factory Methods
  // ============================================================

  /**
   * Create offers for a venture across multiple platforms
   */
  async createOffersForVenture(
    ventureId: string,
    config?: Partial<OfferCreationConfig>
  ): Promise<OfferCreationResult[]> {
    const venture = await this.getVenture(ventureId)
    if (!venture) {
      throw new Error(`Venture ${ventureId} not found`)
    }

    const opportunity = await this.getOpportunity(venture.opportunity_id)
    if (!opportunity) {
      throw new Error(`Opportunity ${venture.opportunity_id} not found`)
    }

    const platforms = config?.platforms || await this.getDefaultPlatforms(venture.vertical)
    const results: OfferCreationResult[] = []

    for (const platformId of platforms) {
      try {
        const result = await this.createOfferForPlatform(venture, opportunity, platformId, config)
        results.push(result)
      } catch (error) {
        results.push({
          offer: {} as Offer,
          status: 'failed',
          reason: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }

    return results
  }

  /**
   * Create a single offer for a specific platform
   */
  async createOfferForPlatform(
    venture: Venture,
    opportunity: any,
    platformId: string,
    config?: Partial<OfferCreationConfig>
  ): Promise<OfferCreationResult> {
    // Check if offer already exists for this venture+platform
    const existing = await this.offerService.list({
      venture_id: venture.id,
      platform_id: platformId,
      limit: 1,
    })

    if (existing.offers.length > 0) {
      return {
        offer: existing.offers[0],
        status: 'skipped',
        reason: 'Offer already exists for this platform',
      }
    }

    const platform = await this.getPlatform(platformId)
    if (!platform) {
      return {
        offer: {} as Offer,
        status: 'failed',
        reason: `Platform ${platformId} not found`,
      }
    }

    const template = this.generateOfferTemplate(venture, opportunity, platform, config)
    
    const offer = await this.offerService.create({
      venture_id: venture.id,
      platform_id: platformId,
      title: template.defaultTitle,
      description: template.defaultDescription,
      price_cents: template.suggestedPriceCents,
      variant_type: template.variantType,
      variant_data: template.variantData,
    })

    return {
      offer,
      status: 'created',
    }
  }

  // ============================================================
  // Template Generation
  // ============================================================

  private generateOfferTemplate(
    venture: Venture,
    opportunity: any,
    platform: Platform,
    config?: Partial<OfferCreationConfig>
  ): OfferTemplate {
    const priceStrategy = config?.priceStrategy || 'medium'
    const basePrice = this.calculateBasePrice(venture.vertical, priceStrategy)
    
    return {
      platformId: platform.id,
      platformName: platform.name,
      defaultTitle: this.generateTitle(venture, opportunity, platform),
      defaultDescription: this.generateDescription(venture, opportunity, platform),
      suggestedPriceCents: basePrice,
      variantType: this.getVariantType(venture.vertical),
      variantData: this.generateVariantData(venture, opportunity),
    }
  }

  private generateTitle(venture: Venture, opportunity: any, platform: Platform): string {
    const maxLength = platform.title_max_chars || 100
    const baseTitle = opportunity.product_idea || opportunity.trend_name
    
    // Add vertical-specific prefix
    const prefixes: Record<string, string> = {
      'digital': 'Digital',
      'pod': 'Print-on-Demand',
      'content': 'Premium',
      'affiliate': 'Recommended',
      'freelance': 'Professional',
      'ecommerce': 'Premium',
    }

    const prefix = prefixes[venture.vertical] || ''
    const fullTitle = prefix ? `${prefix} ${baseTitle}` : baseTitle

    // Truncate if necessary
    return fullTitle.length > maxLength 
      ? fullTitle.substring(0, maxLength - 3) + '...'
      : fullTitle
  }

  private generateDescription(venture: Venture, opportunity: any, platform: Platform): string {
    const maxLength = platform.description_max || 2000
    
    const sections: string[] = []
    
    // Problem statement
    if (opportunity.target_buyer) {
      sections.push(`Perfect for ${opportunity.target_buyer}`)
    }
    
    // Value proposition
    if (opportunity.why_it_sells) {
      sections.push(opportunity.why_it_sells)
    }
    
    // Vertical-specific benefits
    const benefits: Record<string, string> = {
      'digital': 'Instant download, lifetime access, includes all updates',
      'pod': 'High-quality print, comfortable fit, satisfaction guaranteed',
      'content': 'Expertly crafted, actionable insights, exclusive content',
      'affiliate': 'Curated selection, best-in-class quality, trusted recommendation',
      'freelance': 'Professional quality, timely delivery, satisfaction guaranteed',
      'ecommerce': 'Premium quality, fast shipping, excellent customer service',
    }
    
    sections.push(benefits[venture.vertical] || 'High quality, great value')

    const description = sections.join('. ')
    
    // Truncate if necessary
    return description.length > maxLength 
      ? description.substring(0, maxLength - 3) + '...'
      : description
  }

  private calculateBasePrice(vertical: string, strategy: string): number {
    const basePrices: Record<string, { low: number; medium: number; high: number }> = {
      'digital': { low: 997, medium: 1997, high: 4997 },
      'pod': { low: 1999, medium: 2499, high: 3499 },
      'content': { low: 0, medium: 499, high: 999 },
      'affiliate': { low: 0, medium: 0, high: 0 },
      'freelance': { low: 5000, medium: 25000, high: 50000 },
      'ecommerce': { low: 1999, medium: 4999, high: 9999 },
    }

    return basePrices[vertical]?.[strategy as keyof typeof basePrices.digital] || 1997
  }

  private getVariantType(vertical: string): string {
    const variantTypes: Record<string, string> = {
      'digital': 'license',
      'pod': 'size_color',
      'content': 'subscription_tier',
      'affiliate': 'commission_tier',
      'freelance': 'service_package',
      'ecommerce': 'variant',
    }

    return variantTypes[vertical] || 'standard'
  }

  private generateVariantData(venture: Venture, _opportunity: any): Record<string, unknown> {
    const variantData: Record<string, unknown> = {
      vertical: venture.vertical,
      opportunity_id: venture.opportunity_id,
    }

    // Add vertical-specific variant data
    switch (venture.vertical) {
      case 'digital':
        variantData.license_type = 'personal'
        variantData.includes_source = false
        break
      case 'pod':
        variantData.available_sizes = ['S', 'M', 'L', 'XL']
        variantData.available_colors = ['Black', 'White', 'Navy']
        break
      case 'content':
        variantData.subscription_tier = 'basic'
        variantData.update_frequency = 'weekly'
        break
      case 'affiliate':
        variantData.commission_rate = 0.10
        variantData.cookie_duration = 30
        break
      case 'freelance':
        variantData.delivery_time = '7 days'
        variantData.revisions = 2
        break
      case 'ecommerce':
        variantData.shipping = 'standard'
        variantData.inventory = 'unlimited'
        break
    }

    return variantData
  }

  // ============================================================
  // Platform Selection
  // ============================================================

  private async getDefaultPlatforms(vertical: string): Promise<string[]> {
    const platformMap: Record<string, string[]> = {
      'digital': ['gumroad', 'etsy', 'teachers-pay-teachers'],
      'pod': ['printful', 'printify', 'redbubble', 'teepublic'],
      'content': ['substack', 'medium', 'youtube', 'tiktok'],
      'affiliate': ['amazon', 'shareasale', 'impact', 'clickbank'],
      'freelance': ['upwork', 'fiverr', 'freelancer', 'toptal'],
      'ecommerce': ['shopify', 'woocommerce', 'amazon', 'ebay'],
    }

    // Verify platforms exist in database
    const allPlatforms = await this.env.DB.prepare(
      'SELECT id FROM platforms WHERE is_active = 1'
    ).all<{ id: string }>()

    const availablePlatformIds = new Set(allPlatforms.results?.map(p => p.id) || [])
    const suggestedPlatforms = platformMap[vertical] || []

    return suggestedPlatforms.filter(id => availablePlatformIds.has(id))
  }

  // ============================================================
  // Offer Lifecycle Management
  // ============================================================

  async activateOffer(offerId: string, externalListingId?: string, externalUrl?: string): Promise<Offer | null> {
    return this.offerService.activate(offerId, externalListingId, externalUrl)
  }

  async pauseOffer(offerId: string): Promise<Offer | null> {
    return this.offerService.pause(offerId)
  }

  async closeOffer(offerId: string): Promise<Offer | null> {
    const now = new Date().toISOString()
    await this.env.DB.prepare(`
      UPDATE offers SET status = 'closed', updated_at = ? WHERE id = ?
    `).bind(now, offerId).run()

    return this.offerService.getById(offerId)
  }

  // ============================================================
  // Pricing Management
  // ============================================================

  async updatePrice(offerId: string, newPriceCents: number): Promise<Offer | null> {
    const now = new Date().toISOString()
    await this.env.DB.prepare(`
      UPDATE offers SET price_cents = ?, updated_at = ? WHERE id = ?
    `).bind(newPriceCents, now, offerId).run()

    return this.offerService.getById(offerId)
  }

  async updateTitleAndDescription(
    offerId: string,
    title?: string,
    description?: string
  ): Promise<Offer | null> {
    const now = new Date().toISOString()
    const updates: string[] = ['updated_at = ?']
    const params: any[] = [now]

    if (title !== undefined) {
      updates.push('title = ?')
      params.push(title)
    }
    if (description !== undefined) {
      updates.push('description = ?')
      params.push(description)
    }

    params.push(offerId)

    await this.env.DB.prepare(`UPDATE offers SET ${updates.join(', ')} WHERE id = ?`)
      .bind(...params)
      .run()

    return this.offerService.getById(offerId)
  }

  // ============================================================
  // A/B Testing Support
  // ============================================================

  async createVariantOffers(
    baseOfferId: string,
    variations: Array<{
      priceCents?: number
      title?: string
      description?: string
      variantData?: Record<string, unknown>
    }>
  ): Promise<Offer[]> {
    const baseOffer = await this.offerService.getById(baseOfferId)
    if (!baseOffer) {
      throw new Error(`Base offer ${baseOfferId} not found`)
    }

    const createdOffers: Offer[] = []

    for (const variation of variations) {
      const offer = await this.offerService.create({
        venture_id: baseOffer.venture_id,
        platform_id: baseOffer.platform_id ?? undefined,
        title: variation.title ?? baseOffer.title ?? undefined,
        description: variation.description ?? baseOffer.description ?? undefined,
        price_cents: variation.priceCents || baseOffer.price_cents,
        variant_type: baseOffer.variant_type ?? undefined,
        variant_data: variation.variantData || JSON.parse(baseOffer.variant_data || '{}'),
      })
      createdOffers.push(offer)
    }

    return createdOffers
  }

  // ============================================================
  // Portfolio Queries
  // ============================================================

  async getOffersByVenture(ventureId: string): Promise<Offer[]> {
    const result = await this.offerService.list({ venture_id: ventureId })
    return result.offers
  }

  async getActiveOffers(): Promise<Offer[]> {
    const result = await this.env.DB.prepare(`
      SELECT * FROM offers WHERE status = 'active' ORDER BY created_at DESC
    `).all<Offer>()

    return result.results || []
  }

  async getOffersByPlatform(platformId: string): Promise<Offer[]> {
    const result = await this.env.DB.prepare(`
      SELECT * FROM offers WHERE platform_id = ? ORDER BY created_at DESC
    `).bind(platformId).all<Offer>()

    return result.results || []
  }

  // ============================================================
  // Performance Analytics
  // ============================================================

  async getOfferPerformance(offerId: string): Promise<{
    offer: Offer | null
    clickCount: number
    conversionCount: number
    totalRevenue: number
    conversionRate: number
    averageOrderValue: number
  }> {
    const offer = await this.offerService.getById(offerId)

    // Get tracked links for this offer
    const linksResult = await this.env.DB.prepare(
      'SELECT id FROM tracked_links WHERE offer_id = ?'
    ).bind(offerId).all<{ id: string }>()

    let clickCount = 0
    const linkIds: string[] = []

    if (linksResult.results && linksResult.results.length > 0) {
      linkIds.push(...linksResult.results.map(l => l.id))
      clickCount = linksResult.results.length
    }

    // Get economic events for this offer
    let conversionCount = 0
    let totalRevenue = 0

    if (linkIds.length > 0) {
      const placeholders = linkIds.map(() => '?').join(',')
      const revenueResult = await this.env.DB.prepare(`
        SELECT COUNT(*) as count, COALESCE(SUM(amount_cents), 0) as total 
        FROM economic_events 
        WHERE tracked_link_id IN (${placeholders}) AND event_type = 'revenue'
      `).bind(...linkIds).first<{ count: number; total: number }>()

      conversionCount = revenueResult?.count || 0
      totalRevenue = revenueResult?.total || 0
    }

    const conversionRate = clickCount > 0 ? (conversionCount / clickCount) * 100 : 0
    const averageOrderValue = conversionCount > 0 ? totalRevenue / conversionCount : 0

    return {
      offer,
      clickCount,
      conversionCount,
      totalRevenue,
      conversionRate,
      averageOrderValue,
    }
  }

  // ============================================================
  // Helpers
  // ============================================================

  private async getVenture(ventureId: string): Promise<Venture | null> {
    return this.env.DB.prepare('SELECT * FROM ventures WHERE id = ?')
      .bind(ventureId)
      .first<Venture>()
  }

  private async getOpportunity(opportunityId: string): Promise<any> {
    return this.env.DB.prepare('SELECT * FROM opportunities WHERE id = ?')
      .bind(opportunityId)
      .first()
  }

  private async getPlatform(platformId: string): Promise<Platform | null> {
    return this.env.DB.prepare('SELECT * FROM platforms WHERE id = ?')
      .bind(platformId)
      .first<Platform>()
  }
}

// ============================================================
// Temporary Platform Interface
// ============================================================

interface Platform {
  id: string
  name: string
  title_max_chars?: number
  description_max?: number
}

// ============================================================
// Factory
// ============================================================

export function getOfferCreationService(env: Env): OfferCreationService {
  return new OfferCreationService(env)
}