// ============================================================
// Economic Events Ingestion Service
// ============================================================
// Ingests economic events (revenue, cost, fee, refund, commission) from 
// various sources and ensures proper attribution to offers and tracked links.

import type { Env } from '../env'
import type {
  EconomicEvent, EconomicEventType,
  Offer
} from '@nexus/types/portfolio'
import { EconomicEventService } from './portfolio'

export interface EconomicEventData {
  eventType: EconomicEventType
  amountCents: number
  currency?: string
  description?: string
  category?: string
  externalEventId?: string
  externalProvider?: string
  metadata?: Record<string, unknown>
  occurredAt?: string
}

export interface IngestionSource {
  provider: string
  eventType: EconomicEventType
  rawData: Record<string, unknown>
  offerId?: string
  trackedLinkSlug?: string
}

export interface IngestionResult {
  event: EconomicEvent
  attributed: boolean
  ventureId?: string
  ventureFinancialsUpdated: boolean
}

export class EconomicEventsIngestion {
  private eventService: EconomicEventService

  constructor(private env: Env) {
    this.eventService = new EconomicEventService(env)
  }

  // ============================================================
  // Main Ingestion Methods
  // ============================================================

  /**
   * Ingest an economic event with automatic attribution
   */
  async ingest(
    offerId: string,
    data: EconomicEventData,
    trackedLinkId?: string
  ): Promise<IngestionResult> {
    // Create the economic event
    const event = await this.eventService.create({
      offer_id: offerId,
      tracked_link_id: trackedLinkId,
      event_type: data.eventType,
      amount_cents: data.amountCents,
      currency: data.currency || 'USD',
      description: data.description,
      category: data.category,
      external_event_id: data.externalEventId,
      external_provider: data.externalProvider,
      metadata: data.metadata || {},
      occurred_at: data.occurredAt,
    })

    // Get venture information
    const offer = await this.getOffer(offerId)
    const ventureId = offer?.venture_id

    // Check if venture financials were updated
    // (this happens automatically in EconomicEventService for revenue/cost events)
    const ventureFinancialsUpdated = 
      data.eventType === 'revenue' || 
      data.eventType === 'cost' || 
      data.eventType === 'fee'

    return {
      event,
      attributed: !!ventureId,
      ventureId,
      ventureFinancialsUpdated,
    }
  }

  /**
   * Ingest from external provider (Gumroad, Stripe, etc.)
   */
  async ingestFromProvider(source: IngestionSource): Promise<IngestionResult> {
    const offerId = await this.resolveOfferId(source)
    if (!offerId) {
      throw new Error('Could not resolve offer ID for ingestion')
    }

    const trackedLinkId = source.trackedLinkSlug 
      ? await this.resolveTrackedLinkId(source.trackedLinkSlug)
      : undefined

    const data = this.normalizeProviderData(source)

    return this.ingest(offerId, data, trackedLinkId)
  }

  /**
   * Batch ingestion from a provider
   */
  async ingestBatchFromProvider(sources: IngestionSource[]): Promise<{
    successful: IngestionResult[]
    failed: Array<{ source: IngestionSource; error: string }>
  }> {
    const successful: IngestionResult[] = []
    const failed: Array<{ source: IngestionSource; error: string }> = []

    for (const source of sources) {
      try {
        const result = await this.ingestFromProvider(source)
        successful.push(result)
      } catch (error) {
        failed.push({
          source,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }

    return { successful, failed }
  }

  // ============================================================
  // Provider-Specific Ingestors
  // ============================================================

  async ingestGumroadSale(data: {
    saleId: string
    productId: string
    email: string
    amountCents: number
    currency: string
    feeCents: number
    affiliateShareCents?: number
    createdAt: string
    trackedLinkSlug?: string
  }): Promise<IngestionResult> {
    // Find offer by Gumroad product ID
    const offer = await this.findOfferByExternalId(data.productId, 'gumroad')
    if (!offer) {
      throw new Error(`No offer found for Gumroad product ${data.productId}`)
    }

    const trackedLinkId = data.trackedLinkSlug 
      ? await this.resolveTrackedLinkId(data.trackedLinkSlug)
      : undefined

    // Ingest revenue event
    const revenueResult = await this.ingest(offer.id, {
      eventType: 'revenue',
      amountCents: data.amountCents,
      currency: data.currency,
      description: `Gumroad sale by ${data.email}`,
      category: 'sale',
      externalEventId: data.saleId,
      externalProvider: 'gumroad',
      occurredAt: data.createdAt,
      metadata: {
        email: data.email,
        product_id: data.productId,
      },
    }, trackedLinkId)

    // Ingest fee event if applicable
    if (data.feeCents > 0) {
      await this.ingest(offer.id, {
        eventType: 'fee',
        amountCents: data.feeCents,
        currency: data.currency,
        description: 'Gumroad processing fee',
        category: 'platform_fee',
        externalProvider: 'gumroad',
        occurredAt: data.createdAt,
      })
    }

    // Ingest commission event if applicable
    if (data.affiliateShareCents && data.affiliateShareCents > 0) {
      await this.ingest(offer.id, {
        eventType: 'commission',
        amountCents: data.affiliateShareCents,
        currency: data.currency,
        description: 'Affiliate commission',
        category: 'affiliate_commission',
        externalProvider: 'gumroad',
        occurredAt: data.createdAt,
      })
    }

    return revenueResult
  }

  async ingestStripePayment(data: {
    paymentIntentId: string
    amountCents: number
    currency: string
    feeCents: number
    customerId?: string
    createdAt: string
    metadata?: Record<string, unknown>
  }): Promise<IngestionResult> {
    // Try to find offer by metadata
    const offerId = data.metadata?.offer_id as string
    if (!offerId) {
      throw new Error('Stripe payment missing offer_id in metadata')
    }

    const trackedLinkId = data.metadata?.tracked_link_id as string

    // Ingest revenue event
    const revenueResult = await this.ingest(offerId, {
      eventType: 'revenue',
      amountCents: data.amountCents,
      currency: data.currency,
      description: 'Stripe payment',
      category: 'sale',
      externalEventId: data.paymentIntentId,
      externalProvider: 'stripe',
      occurredAt: data.createdAt,
      metadata: {
        customer_id: data.customerId,
        payment_intent_id: data.paymentIntentId,
      },
    }, trackedLinkId)

    // Ingest fee event if applicable
    if (data.feeCents > 0) {
      await this.ingest(offerId, {
        eventType: 'fee',
        amountCents: data.feeCents,
        currency: data.currency,
        description: 'Stripe processing fee',
        category: 'payment_fee',
        externalProvider: 'stripe',
        occurredAt: data.createdAt,
      })
    }

    return revenueResult
  }

  async ingestRefund(data: {
    originalEventId: string
    amountCents: number
    currency: string
    reason?: string
    provider: string
    refundedAt: string
  }): Promise<IngestionResult> {
    // Find original event
    const originalEvent = await this.env.DB.prepare(`
      SELECT * FROM economic_events 
      WHERE external_event_id = ? AND external_provider = ? AND event_type = 'revenue'
    `).bind(data.originalEventId, data.provider).first<EconomicEvent>()

    if (!originalEvent) {
      throw new Error(`Original revenue event ${data.originalEventId} not found`)
    }

    // Ingest refund event
    return await this.ingest(originalEvent.offer_id, {
      eventType: 'refund',
      amountCents: -Math.abs(data.amountCents), // Refunds are negative
      currency: data.currency,
      description: data.reason || 'Refund',
      category: 'refund',
      externalProvider: data.provider,
      occurredAt: data.refundedAt,
      metadata: {
        original_event_id: data.originalEventId,
      },
    })
  }

  async ingestAdSpend(data: {
    campaignId: string
    platform: string
    amountCents: number
    currency: string
    date: string
    offerId?: string
    trackedLinkSlug?: string
  }): Promise<IngestionResult> {
    const offerId = data.offerId || await this.resolveOfferByCampaign(data.campaignId, data.platform)
    if (!offerId) {
      throw new Error(`Could not resolve offer for campaign ${data.campaignId}`)
    }

    const trackedLinkId = data.trackedLinkSlug 
      ? await this.resolveTrackedLinkId(data.trackedLinkSlug)
      : undefined

    return await this.ingest(offerId, {
      eventType: 'cost',
      amountCents: data.amountCents,
      currency: data.currency,
      description: `${data.platform} ad spend`,
      category: 'advertising',
      externalEventId: data.campaignId,
      externalProvider: data.platform,
      occurredAt: data.date,
      metadata: {
        campaign_id: data.campaignId,
        platform: data.platform,
      },
    }, trackedLinkId)
  }

  // ============================================================
  // Resolution & Normalization
  // ============================================================

  private async resolveOfferId(source: IngestionSource): Promise<string | null> {
    // If offerId is provided, use it
    if (source.offerId) {
      return source.offerId
    }

    // Try to resolve by tracked link
    if (source.trackedLinkSlug) {
      const link = await this.env.DB.prepare(
        'SELECT offer_id FROM tracked_links WHERE slug = ?'
      ).bind(source.trackedLinkSlug).first<{ offer_id: string }>()
      return link?.offer_id || null
    }

    // Provider-specific resolution
    return this.resolveOfferByProviderData(source)
  }

  private async resolveTrackedLinkId(slug: string): Promise<string | undefined> {
    const link = await this.env.DB.prepare(
      'SELECT id FROM tracked_links WHERE slug = ?'
    ).bind(slug).first<{ id: string }>()
    return link?.id ?? undefined
  }

  private async resolveOfferByProviderData(source: IngestionSource): Promise<string | null> {
    const provider = source.provider
    const rawData = source.rawData

    switch (provider) {
      case 'gumroad':
        const productId = rawData.product_id as string
        if (productId) {
          const offer = await this.findOfferByExternalId(productId, 'gumroad')
          return offer?.id || null
        }
        break
      case 'stripe':
        const metadata = rawData.metadata as Record<string, unknown>
        return (metadata?.offer_id as string) || null
      default:
        return null
    }

    return null
  }

  private async resolveOfferByCampaign(campaignId: string, platform: string): Promise<string | null> {
    // Try to find offer linked to this campaign
    const result = await this.env.DB.prepare(`
      SELECT o.id FROM offers o
      JOIN tracked_links tl ON o.id = tl.offer_id
      WHERE tl.utm_campaign = ? AND tl.utm_source = ?
      LIMIT 1
    `).bind(campaignId, platform).first<{ id: string }>()

    return result?.id || null
  }

  private normalizeProviderData(source: IngestionSource): EconomicEventData {
    const rawData = source.rawData
    const eventType = source.eventType

    // Provider-specific normalization
    switch (source.provider) {
      case 'gumroad':
        return {
          eventType,
          amountCents: rawData.amount_cents as number || 0,
          currency: rawData.currency as string || 'USD',
          description: rawData.description as string,
          category: rawData.category as string,
          externalEventId: rawData.sale_id as string,
          externalProvider: 'gumroad',
          metadata: rawData,
        }
      case 'stripe':
        return {
          eventType,
          amountCents: rawData.amount_cents as number || 0,
          currency: rawData.currency as string || 'USD',
          description: 'Stripe transaction',
          category: rawData.category as string,
          externalEventId: rawData.payment_intent_id as string,
          externalProvider: 'stripe',
          metadata: rawData,
        }
      default:
        return {
          eventType,
          amountCents: rawData.amount_cents as number || 0,
          currency: rawData.currency as string || 'USD',
          description: rawData.description as string,
          category: rawData.category as string,
          externalProvider: source.provider,
          metadata: rawData,
        }
    }
  }

  // ============================================================
  // Analytics & Reporting
  // ============================================================

  async getVentureFinancialSummary(ventureId: string, dateRange?: {
    start: string
    end: string
  }): Promise<{
    totalRevenue: number
    totalCost: number
    totalFees: number
    totalRefunds: number
    totalCommissions: number
    netProfit: number
    profitMargin: number
    eventCount: number
    byCategory: Record<string, { amount: number; count: number }>
    byProvider: Record<string, { amount: number; count: number }>
  }> {
    let sql = 'SELECT * FROM economic_events WHERE offer_id IN (SELECT id FROM offers WHERE venture_id = ?)'
    const params: any[] = [ventureId]

    if (dateRange) {
      sql += ' AND occurred_at >= ? AND occurred_at <= ?'
      params.push(dateRange.start, dateRange.end)
    }

    const result = await this.env.DB.prepare(sql).bind(...params).all<EconomicEvent>()
    const events = result.results || []

    const summary = {
      totalRevenue: 0,
      totalCost: 0,
      totalFees: 0,
      totalRefunds: 0,
      totalCommissions: 0,
      netProfit: 0,
      profitMargin: 0,
      eventCount: events.length,
      byCategory: {} as Record<string, { amount: number; count: number }>,
      byProvider: {} as Record<string, { amount: number; count: number }>,
    }

    for (const event of events) {
      const amount = event.amount_cents

      switch (event.event_type) {
        case 'revenue':
          summary.totalRevenue += amount
          break
        case 'cost':
          summary.totalCost += amount
          break
        case 'fee':
          summary.totalFees += amount
          break
        case 'refund':
          summary.totalRefunds += amount
          break
        case 'commission':
          summary.totalCommissions += amount
          break
      }

      // By category
      const category = event.category || 'uncategorized'
      if (!summary.byCategory[category]) {
        summary.byCategory[category] = { amount: 0, count: 0 }
      }
      summary.byCategory[category].amount += amount
      summary.byCategory[category].count++

      // By provider
      const provider = event.external_provider || 'direct'
      if (!summary.byProvider[provider]) {
        summary.byProvider[provider] = { amount: 0, count: 0 }
      }
      summary.byProvider[provider].amount += amount
      summary.byProvider[provider].count++
    }

    summary.netProfit = summary.totalRevenue - summary.totalCost - summary.totalFees - Math.abs(summary.totalRefunds) - summary.totalCommissions
    summary.profitMargin = summary.totalRevenue > 0 ? (summary.netProfit / summary.totalRevenue) * 100 : 0

    return summary
  }

  async getOfferFinancialSummary(offerId: string): Promise<{
    totalRevenue: number
    totalCost: number
    netProfit: number
    conversionCount: number
    averageOrderValue: number
  }> {
    const revenueResult = await this.env.DB.prepare(`
      SELECT COALESCE(SUM(amount_cents), 0) as total, COUNT(*) as count 
      FROM economic_events 
      WHERE offer_id = ? AND event_type = 'revenue'
    `).bind(offerId).first<{ total: number; count: number }>()

    const costResult = await this.env.DB.prepare(`
      SELECT COALESCE(SUM(amount_cents), 0) as total 
      FROM economic_events 
      WHERE offer_id = ? AND event_type IN ('cost', 'fee')
    `).bind(offerId).first<{ total: number }>()

    const totalRevenue = revenueResult?.total || 0
    const totalCost = costResult?.total || 0
    const conversionCount = revenueResult?.count || 0
    const netProfit = totalRevenue - totalCost
    const averageOrderValue = conversionCount > 0 ? totalRevenue / conversionCount : 0

    return {
      totalRevenue,
      totalCost,
      netProfit,
      conversionCount,
      averageOrderValue,
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

  private async findOfferByExternalId(externalId: string, provider: string): Promise<Offer | null> {
    return this.env.DB.prepare(`
      SELECT * FROM offers 
      WHERE external_listing_id = ? AND (
        external_url LIKE ? OR 
        platform_id = (SELECT id FROM platforms WHERE name = ? OR slug = ? LIMIT 1)
      )
      LIMIT 1
    `).bind(externalId, `%${externalId}%`, provider, provider).first<Offer>()
  }
}

// ============================================================
// Factory
// ============================================================

export function getEconomicEventsIngestion(env: Env): EconomicEventsIngestion {
  return new EconomicEventsIngestion(env)
}