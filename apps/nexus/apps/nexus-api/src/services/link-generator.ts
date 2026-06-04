// ============================================================
// Tracked Link Generation Service
// ============================================================
// Generates unique tracking links for offers across different channels.
// Enables attribution by creating trackable URLs before traffic is sent.

import type { Env } from '../env'
import type {
  TrackedLink, CreateTrackedLinkInput, Offer
} from '@nexus/types/portfolio'
import { nanoid } from 'nanoid'

export interface LinkGenerationConfig {
  baseUrl?: string
  defaultCampaign?: string
  enableUtmParameters?: boolean
}

export interface GeneratedLink {
  trackedLink: TrackedLink
  shortUrl: string
  fullUrl: string
}

export class TrackedLinkGenerator {
  constructor(private env: Env) {}

  // ============================================================
  // Main Link Generation Methods
  // ============================================================

  /**
   * Generate a tracked link for an offer on a specific channel
   */
  async generateLink(
    offerId: string,
    channel: string,
    config?: LinkGenerationConfig
  ): Promise<GeneratedLink> {
    const offer = await this.getOffer(offerId)
    if (!offer) {
      throw new Error(`Offer ${offerId} not found`)
    }

    if (offer.status !== 'active') {
      throw new Error(`Offer ${offerId} is not active (status: ${offer.status})`)
    }

    const slug = this.generateUniqueSlug(offerId, channel)
    const destinationUrl = this.buildDestinationUrl(offer, config)
    
    const trackedLink = await this.createTrackedLink({
      offer_id: offerId,
      channel,
      slug,
      destination_url: destinationUrl,
      utm_source: channel,
      utm_medium: this.getUtmMedium(channel),
      utm_campaign: config?.defaultCampaign || this.generateCampaignName(offer),
      utm_content: this.generateUtmContent(offer, channel),
    })

    const baseUrl = config?.baseUrl || this.getBaseUrl()
    const shortUrl = `${baseUrl}/l/${slug}`
    const fullUrl = this.buildFullUrl(destinationUrl, trackedLink)

    return {
      trackedLink,
      shortUrl,
      fullUrl,
    }
  }

  /**
   * Generate multiple links for an offer across different channels
   */
  async generateLinksForChannels(
    offerId: string,
    channels: string[],
    config?: LinkGenerationConfig
  ): Promise<GeneratedLink[]> {
    const results: GeneratedLink[] = []

    for (const channel of channels) {
      try {
        const link = await this.generateLink(offerId, channel, config)
        results.push(link)
      } catch (error) {
        console.error(`Failed to generate link for channel ${channel}:`, error)
      }
    }

    return results
  }

  /**
   * Generate A/B test links for an offer
   */
  async generateAbTestLinks(
    offerId: string,
    channel: string,
    variants: Array<{ name: string; destinationUrl?: string }>,
    config?: LinkGenerationConfig
  ): Promise<Array<{ variant: string; link: GeneratedLink }>> {
    const results: Array<{ variant: string; link: GeneratedLink }> = []

    for (const variant of variants) {
      const slug = this.generateUniqueSlug(offerId, `${channel}-${variant.name}`)
      const offer = await this.getOffer(offerId)
      if (!offer) continue

      const destinationUrl = variant.destinationUrl || this.buildDestinationUrl(offer, config)
      
      const trackedLink = await this.createTrackedLink({
        offer_id: offerId,
        channel,
        slug,
        destination_url: destinationUrl,
        utm_source: channel,
        utm_medium: this.getUtmMedium(channel),
        utm_campaign: config?.defaultCampaign || this.generateCampaignName(offer),
        utm_content: `variant:${variant.name}`,
      })

      const baseUrl = config?.baseUrl || this.getBaseUrl()
      const shortUrl = `${baseUrl}/l/${slug}`
      const fullUrl = this.buildFullUrl(destinationUrl, trackedLink)

      results.push({
        variant: variant.name,
        link: {
          trackedLink,
          shortUrl,
          fullUrl,
        },
      })
    }

    return results
  }

  // ============================================================
  // Link Creation
  // ============================================================

  private async createTrackedLink(input: CreateTrackedLinkInput): Promise<TrackedLink> {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()

    await this.env.DB.prepare(`
      INSERT INTO tracked_links (id, offer_id, channel, slug, destination_url, 
                                 utm_source, utm_medium, utm_campaign, utm_content, utm_term, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      input.offer_id,
      input.channel,
      input.slug,
      input.destination_url,
      input.utm_source || null,
      input.utm_medium || null,
      input.utm_campaign || null,
      input.utm_content || null,
      input.utm_term || null,
      now
    ).run()

    return this.getTrackedLink(id) as Promise<TrackedLink>
  }

  private async getTrackedLink(id: string): Promise<TrackedLink | null> {
    return this.env.DB.prepare('SELECT * FROM tracked_links WHERE id = ?')
      .bind(id)
      .first<TrackedLink>()
  }

  // ============================================================
  // Slug Generation
  // ============================================================

  private generateUniqueSlug(_offerId: string, channel: string): string {
    // Generate a short, unique slug
    const randomPart = nanoid(6)
    const channelPart = channel.substring(0, 3).toLowerCase()
    return `${channelPart}-${randomPart}`
  }

  async generateCustomSlug(
    offerId: string,
    channel: string,
    customSlug: string
  ): Promise<TrackedLink | null> {
    // Check if slug already exists
    const existing = await this.env.DB.prepare(
      'SELECT id FROM tracked_links WHERE slug = ?'
    ).bind(customSlug).first<{ id: string }>()

    if (existing) {
      throw new Error(`Slug ${customSlug} already exists`)
    }

    const offer = await this.getOffer(offerId)
    if (!offer) {
      throw new Error(`Offer ${offerId} not found`)
    }

    return this.createTrackedLink({
      offer_id: offerId,
      channel,
      slug: customSlug,
      destination_url: offer.external_url || '',
      utm_source: channel,
      utm_medium: this.getUtmMedium(channel),
    })
  }

  // ============================================================
  // URL Building
  // ============================================================

  private buildDestinationUrl(offer: Offer, _config?: LinkGenerationConfig): string {
    // If offer has external URL, use it
    if (offer.external_url) {
      return offer.external_url
    }

    // Otherwise, build a default URL based on platform
    const platformUrl = this.getPlatformDefaultUrl(offer.platform_id)
    return platformUrl || 'https://example.com'
  }

  private buildFullUrl(destinationUrl: string, link: TrackedLink): string {
    if (!destinationUrl) return ''

    const url = new URL(destinationUrl)
    
    if (link.utm_source) url.searchParams.set('utm_source', link.utm_source)
    if (link.utm_medium) url.searchParams.set('utm_medium', link.utm_medium)
    if (link.utm_campaign) url.searchParams.set('utm_campaign', link.utm_campaign)
    if (link.utm_content) url.searchParams.set('utm_content', link.utm_content)
    if (link.utm_term) url.searchParams.set('utm_term', link.utm_term)

    return url.toString()
  }

  private getBaseUrl(): string {
    // Get base URL from environment or use default
    return 'https://nexus.example.com'
  }

  private getPlatformDefaultUrl(platformId: string | null): string | null {
    const platformUrls: Record<string, string> = {
      'gumroad': 'https://gumroad.com',
      'etsy': 'https://etsy.com',
      'amazon': 'https://amazon.com',
      'shopify': 'https://shopify.com',
      'printful': 'https://printful.com',
    }

    return platformId ? platformUrls[platformId] || null : null
  }

  // ============================================================
  // UTM Parameter Helpers
  // ============================================================

  private getUtmMedium(channel: string): string {
    const mediumMap: Record<string, string> = {
      'email': 'email',
      'social': 'social',
      'twitter': 'social',
      'facebook': 'social',
      'instagram': 'social',
      'linkedin': 'social',
      'tiktok': 'social',
      'youtube': 'social',
      'newsletter': 'newsletter',
      'blog': 'blog',
      'paid': 'paid',
      'google': 'ppc',
      'facebook-ads': 'ppc',
      'tiktok-ads': 'ppc',
      'influencer': 'influencer',
      'affiliate': 'affiliate',
      'referral': 'referral',
      'direct': 'none',
    }

    return mediumMap[channel] || 'other'
  }

  private generateCampaignName(offer: Offer): string {
    const now = new Date()
    const month = now.toLocaleString('default', { month: 'short' }).toLowerCase()
    const year = now.getFullYear()
    
    const offerName = offer.title?.toLowerCase().replace(/\s+/g, '-').substring(0, 20) || 'offer'
    
    return `${offerName}-${month}-${year}`
  }

  private generateUtmContent(offer: Offer, channel: string): string {
    const offerId = offer.id.substring(0, 8)
    return `${channel}-${offerId}`
  }

  // ============================================================
  // Link Management
  // ============================================================

  async getLinksByOffer(offerId: string): Promise<TrackedLink[]> {
    const result = await this.env.DB.prepare(
      'SELECT * FROM tracked_links WHERE offer_id = ? ORDER BY created_at DESC'
    ).bind(offerId).all<TrackedLink>()

    return result.results || []
  }

  async getLinksByChannel(channel: string): Promise<TrackedLink[]> {
    const result = await this.env.DB.prepare(
      'SELECT * FROM tracked_links WHERE channel = ? ORDER BY created_at DESC'
    ).bind(channel).all<TrackedLink>()

    return result.results || []
  }

  async getLinkBySlug(slug: string): Promise<TrackedLink | null> {
    return this.env.DB.prepare('SELECT * FROM tracked_links WHERE slug = ?')
      .bind(slug)
      .first<TrackedLink>()
  }

  async deactivateLink(_linkId: string): Promise<boolean> {
    // In a real implementation, you might want to add an 'active' field to the schema
    // For now, we'll just return success
    return true
  }

  // ============================================================
  // Analytics
  // ============================================================

  async getLinkAnalytics(linkId: string): Promise<{
    link: TrackedLink | null
    clickCount: number
    conversionCount: number
    revenue: number
  }> {
    const link = await this.getTrackedLink(linkId)
    if (!link) {
      return {
        link: null,
        clickCount: 0,
        conversionCount: 0,
        revenue: 0,
      }
    }

    // Count clicks (tracked via tracked_links table - in reality you'd track clicks separately)
    // For now, we'll estimate based on economic events
    const eventsResult = await this.env.DB.prepare(`
      SELECT COUNT(*) as count, COALESCE(SUM(amount_cents), 0) as revenue 
      FROM economic_events 
      WHERE tracked_link_id = ? AND event_type = 'revenue'
    `).bind(linkId).first<{ count: number; revenue: number }>()

    return {
      link,
      clickCount: 0, // Would need separate click tracking table
      conversionCount: eventsResult?.count || 0,
      revenue: eventsResult?.revenue || 0,
    }
  }

  async getOfferLinkAnalytics(offerId: string): Promise<{
    totalLinks: number
    totalClicks: number
    totalConversions: number
    totalRevenue: number
    byChannel: Record<string, { links: number; conversions: number; revenue: number }>
  }> {
    const links = await this.getLinksByOffer(offerId)
    const byChannel: Record<string, { links: number; conversions: number; revenue: number }> = {}
    let totalConversions = 0
    let totalRevenue = 0

    for (const link of links) {
      const analytics = await this.getLinkAnalytics(link.id)
      
      if (!byChannel[link.channel]) {
        byChannel[link.channel] = { links: 0, conversions: 0, revenue: 0 }
      }
      
      byChannel[link.channel].links++
      byChannel[link.channel].conversions += analytics.conversionCount
      byChannel[link.channel].revenue += analytics.revenue
      
      totalConversions += analytics.conversionCount
      totalRevenue += analytics.revenue
    }

    return {
      totalLinks: links.length,
      totalClicks: 0, // Would need separate click tracking
      totalConversions,
      totalRevenue,
      byChannel,
    }
  }

  // ============================================================
  // Helpers
  // ============================================================

  private async getOffer(offerId: string): Promise<Offer | null> {
    return this.env.DB.prepare('SELECT * FROM offers WHERE id = ?')
      .bind(offerId)
      .first<Offer>()
  }
}

// ============================================================
// Factory
// ============================================================

export function getTrackedLinkGenerator(env: Env): TrackedLinkGenerator {
  return new TrackedLinkGenerator(env)
}