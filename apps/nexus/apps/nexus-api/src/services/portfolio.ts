// ============================================================
// Portfolio Services Layer
// ============================================================
// Business logic services for portfolio entity operations

import type { Env } from '../env'
import type {
  Signal, Venture, Offer, TrackedLink, EconomicEvent,
  AssetLibraryItem, AllocatorAction, AssetLibraryType,
  CreateSignalInput, CreateVentureInput, CreateOfferInput,
  CreateTrackedLinkInput, CreateEconomicEventInput,
  CreateAllocatorActionInput, CreateAssetLibraryItemInput,
  SignalFilters, VentureFilters, OfferFilters, EconomicEventFilters,
  AssetLibraryFilters, VentureWithDetails
} from '@nexus/types/portfolio'

// ============================================================
// Signal Service
// ============================================================

export class SignalService {
  constructor(private env: Env) {}

  async create(input: CreateSignalInput): Promise<Signal> {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()

    await this.env.DB.prepare(`
      INSERT INTO signals (id, source_type, source_ref, title, extracted_audience, extracted_problem, 
                          evidence_json, demand_score, freshness_score, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      input.source_type,
      input.source_ref || null,
      input.title,
      input.extracted_audience || null,
      input.extracted_problem || null,
      JSON.stringify(input.evidence_json || {}),
      input.demand_score || 0,
      input.freshness_score || 0,
      'raw',
      now,
      now
    ).run()

    return this.getById(id) as Promise<Signal>
  }

  async getById(id: string): Promise<Signal | null> {
    return this.env.DB.prepare('SELECT * FROM signals WHERE id = ?')
      .bind(id)
      .first<Signal>()
  }

  async list(filters: SignalFilters = {}): Promise<{ signals: Signal[]; total: number }> {
    let sql = 'SELECT * FROM signals WHERE 1=1'
    const params: any[] = []

    if (filters.status) {
      sql += ' AND status = ?'
      params.push(filters.status)
    }
    if (filters.source_type) {
      sql += ' AND source_type = ?'
      params.push(filters.source_type)
    }
    if (filters.min_demand_score) {
      sql += ' AND demand_score >= ?'
      params.push(filters.min_demand_score)
    }

    sql += ' ORDER BY demand_score DESC, created_at DESC LIMIT ? OFFSET ?'
    params.push(filters.limit || 50, filters.offset || 0)

    const result = await this.env.DB.prepare(sql).bind(...params).all<Signal>()
    
    const countResult = await this.env.DB.prepare(
      'SELECT COUNT(*) as total FROM signals WHERE 1=1' +
      (filters.status ? ' AND status = ?' : '') +
      (filters.source_type ? ' AND source_type = ?' : '') +
      (filters.min_demand_score ? ' AND demand_score >= ?' : '')
    ).bind(...params.slice(0, -2)).first<{ total: number }>()

    return {
      signals: result.results || [],
      total: countResult?.total || 0,
    }
  }

  async updateStatus(id: string, status: string): Promise<Signal | null> {
    const now = new Date().toISOString()
    await this.env.DB.prepare('UPDATE signals SET status = ?, updated_at = ? WHERE id = ?')
      .bind(status, now, id)
      .run()

    return this.getById(id)
  }

  async updateScore(id: string, demandScore: number, freshnessScore: number): Promise<Signal | null> {
    const now = new Date().toISOString()
    await this.env.DB.prepare('UPDATE signals SET demand_score = ?, freshness_score = ?, updated_at = ? WHERE id = ?')
      .bind(demandScore, freshnessScore, now, id)
      .run()

    return this.getById(id)
  }
}

// ============================================================
// Venture Service
// ============================================================

export class VentureService {
  constructor(private env: Env) {}

  async create(input: CreateVentureInput): Promise<Venture> {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()

    await this.env.DB.prepare(`
      INSERT INTO ventures (id, opportunity_id, vertical, strategy, status, 
                           budget_cap_cents, test_quota_clicks, signal_id, 
                           ai_cost_cents, revenue_cents, profit_cents, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      input.opportunity_id,
      input.vertical,
      input.strategy,
      'draft',
      input.budget_cap_cents || 0,
      input.test_quota_clicks || 100,
      input.signal_id || null,
      0,
      0,
      0,
      now,
      now
    ).run()

    return this.getById(id) as Promise<Venture>
  }

  async getById(id: string): Promise<Venture | null> {
    return this.env.DB.prepare('SELECT * FROM ventures WHERE id = ?')
      .bind(id)
      .first<Venture>()
  }

  async getWithDetails(id: string): Promise<VentureWithDetails | null> {
    const venture = await this.getById(id)
    if (!venture) return null

    const opportunity = await this.env.DB.prepare(
      'SELECT id, trend_name, target_buyer, product_idea, total_score FROM opportunities WHERE id = ?'
    ).bind(venture.opportunity_id).first<{
      id: string
      trend_name: string
      target_buyer: string
      product_idea: string
      total_score: number
    }>()

    const signal = venture.signal_id ? await this.env.DB.prepare(
      'SELECT * FROM signals WHERE id = ?'
    ).bind(venture.signal_id).first<Signal>() : null

    const offerCount = await this.env.DB.prepare(
      'SELECT COUNT(*) as count FROM offers WHERE venture_id = ?'
    ).bind(id).first<{ count: number }>()

    return {
      ...venture,
      opportunity: opportunity ? {
        id: opportunity.id,
        trend_name: opportunity.trend_name,
        target_buyer: opportunity.target_buyer,
        product_idea: opportunity.product_idea,
        total_score: opportunity.total_score,
      } : undefined,
      signal: signal || undefined,
      offer_count: offerCount?.count || 0,
    }
  }

  async list(filters: VentureFilters = {}): Promise<{ ventures: Venture[] }> {
    let sql = 'SELECT * FROM ventures WHERE 1=1'
    const params: any[] = []

    if (filters.opportunity_id) {
      sql += ' AND opportunity_id = ?'
      params.push(filters.opportunity_id)
    }
    if (filters.vertical) {
      sql += ' AND vertical = ?'
      params.push(filters.vertical)
    }
    if (filters.status) {
      sql += ' AND status = ?'
      params.push(filters.status)
    }
    if (filters.signal_id) {
      sql += ' AND signal_id = ?'
      params.push(filters.signal_id)
    }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?'
    params.push(filters.limit || 50, filters.offset || 0)

    const result = await this.env.DB.prepare(sql).bind(...params).all<Venture>()
    
    return { ventures: result.results || [] }
  }

  async updateStatus(id: string, status: string): Promise<Venture | null> {
    const now = new Date().toISOString()
    await this.env.DB.prepare('UPDATE ventures SET status = ?, updated_at = ? WHERE id = ?')
      .bind(status, now, id)
      .run()

    return this.getById(id)
  }

  async updateFinancials(id: string, aiCostCents: number, revenueCents: number, profitCents: number): Promise<Venture | null> {
    const now = new Date().toISOString()
    await this.env.DB.prepare(`
      UPDATE ventures SET ai_cost_cents = ?, revenue_cents = ?, profit_cents = ?, updated_at = ? 
      WHERE id = ?
    `).bind(aiCostCents, revenueCents, profitCents, now, id).run()

    return this.getById(id)
  }

  async killVenture(id: string, reason: string): Promise<Venture | null> {
    const now = new Date().toISOString()
    
    // Update venture status
    await this.env.DB.prepare('UPDATE ventures SET status = ?, updated_at = ? WHERE id = ?')
      .bind('killed', now, id)
      .run()

    // Record allocator action
    const actionId = crypto.randomUUID()
    await this.env.DB.prepare(`
      INSERT INTO allocator_actions (id, venture_id, action_type, reason, confidence, data_before, data_after, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      actionId,
      id,
      'kill',
      reason,
      0.9,
      '{}',
      '{}',
      now
    ).run()

    return this.getById(id)
  }
}

// ============================================================
// Offer Service
// ============================================================

export class OfferService {
  constructor(private env: Env) {}

  async create(input: CreateOfferInput): Promise<Offer> {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()

    await this.env.DB.prepare(`
      INSERT INTO offers (id, venture_id, platform_id, title, description, 
                       price_cents, currency, variant_type, variant_data, 
                       status, published_at, external_listing_id, external_url, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      input.venture_id,
      input.platform_id || null,
      input.title || null,
      input.description || null,
      input.price_cents,
      input.currency || 'USD',
      input.variant_type || null,
      JSON.stringify(input.variant_data || {}),
      'draft',
      null,
      null,
      null,
      now,
      now
    ).run()

    return this.getById(id) as Promise<Offer>
  }

  async getById(id: string): Promise<Offer | null> {
    return this.env.DB.prepare('SELECT * FROM offers WHERE id = ?')
      .bind(id)
      .first<Offer>()
  }

  async list(filters: OfferFilters = {}): Promise<{ offers: Offer[] }> {
    let sql = 'SELECT * FROM offers WHERE 1=1'
    const params: any[] = []

    if (filters.venture_id) {
      sql += ' AND venture_id = ?'
      params.push(filters.venture_id)
    }
    if (filters.platform_id) {
      sql += ' AND platform_id = ?'
      params.push(filters.platform_id)
    }
    if (filters.status) {
      sql += ' AND status = ?'
      params.push(filters.status)
    }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?'
    params.push(filters.limit || 50, filters.offset || 0)

    const result = await this.env.DB.prepare(sql).bind(...params).all<Offer>()
    
    return { offers: result.results || [] }
  }

  async updateStatus(id: string, status: string): Promise<Offer | null> {
    const now = new Date().toISOString()
    await this.env.DB.prepare('UPDATE offers SET status = ?, updated_at = ? WHERE id = ?')
      .bind(status, now, id)
      .run()

    return this.getById(id)
  }

  /**
   * Mark an offer as active. Optionally records the external listing identifier
   * and public URL returned by the publishing platform, and stamps published_at.
   */
  async activate(
    id: string,
    externalListingId?: string,
    externalUrl?: string
  ): Promise<Offer | null> {
    const now = new Date().toISOString()
    await this.env.DB.prepare(`
      UPDATE offers
      SET status = 'active',
          published_at = COALESCE(published_at, ?),
          external_listing_id = COALESCE(?, external_listing_id),
          external_url = COALESCE(?, external_url),
          updated_at = ?
      WHERE id = ?
    `).bind(now, externalListingId ?? null, externalUrl ?? null, now, id).run()

    return this.getById(id)
  }

  /**
   * Pause an active offer without losing its publishing metadata.
   */
  async pause(id: string): Promise<Offer | null> {
    const now = new Date().toISOString()
    await this.env.DB.prepare(`
      UPDATE offers SET status = 'paused', updated_at = ? WHERE id = ?
    `).bind(now, id).run()

    return this.getById(id)
  }
}

// ============================================================
// Tracked Link Service
// ============================================================

export class TrackedLinkService {
  constructor(private env: Env) {}

  async create(input: CreateTrackedLinkInput): Promise<TrackedLink> {
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

    return this.getById(id) as Promise<TrackedLink>
  }

  async getById(id: string): Promise<TrackedLink | null> {
    return this.env.DB.prepare('SELECT * FROM tracked_links WHERE id = ?')
      .bind(id)
      .first<TrackedLink>()
  }

  async list(offerId: string): Promise<TrackedLink[]> {
    const result = await this.env.DB.prepare(
      'SELECT * FROM tracked_links WHERE offer_id = ? ORDER BY created_at DESC'
    ).bind(offerId).all<TrackedLink>()

    return result.results || []
  }

  async click(id: string): Promise<TrackedLink | null> {
    // In a real implementation, this would track click events
    return this.getById(id)
  }
}

// ============================================================
// Economic Event Service
// ============================================================

export class EconomicEventService {
  constructor(private env: Env) {}

  async create(input: CreateEconomicEventInput): Promise<EconomicEvent> {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const occurredAt = input.occurred_at || now

    await this.env.DB.prepare(`
      INSERT INTO economic_events (id, offer_id, tracked_link_id, event_type, amount_cents, 
                                   currency, description, category, external_event_id, external_provider, 
                                   metadata, occurred_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      input.offer_id,
      input.tracked_link_id || null,
      input.event_type,
      input.amount_cents,
      input.currency || 'USD',
      input.description || null,
      input.category || null,
      input.external_event_id || null,
      input.external_provider || null,
      JSON.stringify(input.metadata || {}),
      occurredAt,
      now
    ).run()

    return this.getById(id) as Promise<EconomicEvent>
  }

  async getById(id: string): Promise<EconomicEvent | null> {
    return this.env.DB.prepare('SELECT * FROM economic_events WHERE id = ?')
      .bind(id)
      .first<EconomicEvent>()
  }

  async list(filters: EconomicEventFilters = {}): Promise<{ economic_events: EconomicEvent[] }> {
    let sql = 'SELECT * FROM economic_events WHERE 1=1'
    const params: any[] = []

    if (filters.offer_id) {
      sql += ' AND offer_id = ?'
      params.push(filters.offer_id)
    }
    if (filters.tracked_link_id) {
      sql += ' AND tracked_link_id = ?'
      params.push(filters.tracked_link_id)
    }
    if (filters.event_type) {
      sql += ' AND event_type = ?'
      params.push(filters.event_type)
    }
    if (filters.category) {
      sql += ' AND category = ?'
      params.push(filters.category)
    }
    if (filters.occurred_after) {
      sql += ' AND occurred_at >= ?'
      params.push(filters.occurred_after)
    }
    if (filters.occurred_before) {
      sql += ' AND occurred_at <= ?'
      params.push(filters.occurred_before)
    }

    sql += ' ORDER BY occurred_at DESC LIMIT ? OFFSET ?'
    params.push(filters.limit || 50, filters.offset || 0)

    const result = await this.env.DB.prepare(sql).bind(...params).all<EconomicEvent>()
    
    return { economic_events: result.results || [] }
  }
}

// ============================================================
// Asset Library Service
// ============================================================

export class AssetLibraryService {
  constructor(private env: Env) {}

  async create(input: CreateAssetLibraryItemInput): Promise<AssetLibraryItem> {










    const id = crypto.randomUUID()
    const now = new Date().toISOString()

    await this.env.DB.prepare(`
      INSERT INTO asset_library (id, venture_id, offer_id, asset_type, file_path, 
                              cdn_url, prompt_used, ai_model_used, tags, 
                              performance_score, usage_count, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      input.venture_id || null,
      input.offer_id || null,
      input.asset_type,
      input.file_path || null,
      input.cdn_url || null,
      input.prompt_used || null,
      input.ai_model_used || null,
      JSON.stringify(input.tags || []),
      0,
      0,
      JSON.stringify(input.metadata || {}),
      now,
      now
    ).run()

    return this.getById(id) as Promise<AssetLibraryItem>
  }

  async getById(id: string): Promise<AssetLibraryItem | null> {
    return this.env.DB.prepare('SELECT * FROM asset_library WHERE id = ?')
      .bind(id)
      .first<AssetLibraryItem>()
  }

  async list(filters: AssetLibraryFilters = {}): Promise<{ assets: AssetLibraryItem[] }> {
    let sql = 'SELECT * FROM asset_library WHERE 1=1'
    const params: any[] = []

    if (filters.venture_id) {
      sql += ' AND venture_id = ?'
      params.push(filters.venture_id)
    }
    if (filters.offer_id) {
      sql += ' AND offer_id = ?'
      params.push(filters.offer_id)
    }
    if (filters.asset_type) {
      sql += ' AND asset_type = ?'
      params.push(filters.asset_type)
    }
    if (filters.min_performance_score) {
      sql += ' AND performance_score >= ?'
      params.push(filters.min_performance_score)
    }

    sql += ' ORDER BY performance_score DESC, usage_count DESC LIMIT ? OFFSET ?'
    params.push(filters.limit || 50, filters.offset || 0)

    const result = await this.env.DB.prepare(sql).bind(...params).all<AssetLibraryItem>()
    
    return { assets: result.results || [] }
  }

  async findReusableAssets(
    ventureId: string,
    assetType: AssetLibraryType,
    minScore: number = 50
  ): Promise<AssetLibraryItem[]> {
    const result = await this.env.DB.prepare(`
      SELECT * FROM asset_library 
      WHERE venture_id != ? 
      AND asset_type = ? 
      AND performance_score >= ?
      ORDER BY performance_score DESC, usage_count DESC
      LIMIT 10
    `).bind(ventureId, assetType, minScore).all<AssetLibraryItem>()

    return result.results || []
  }

  async updatePerformance(id: string, newScore: number): Promise<void> {
    await this.env.DB.prepare(`
      UPDATE asset_library 
      SET performance_score = ?, updated_at = ? 
      WHERE id = ?
    `).bind(newScore, new Date().toISOString(), id).run()
  }
}

// ============================================================
// Allocator Action Service
// ============================================================

export class AllocatorActionService {
  constructor(private env: Env) {}

  async create(input: CreateAllocatorActionInput): Promise<AllocatorAction> {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()

    await this.env.DB.prepare(`
      INSERT INTO allocator_actions (id, venture_id, action_type, reason, confidence, data_before, data_after, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      input.venture_id,
      input.action_type,
      input.reason,
      input.confidence || 0,
      JSON.stringify(input.data_before || {}),
      JSON.stringify(input.data_after || {}),
      now
    ).run()

    return this.getById(id) as Promise<AllocatorAction>
  }

  async getById(id: string): Promise<AllocatorAction | null> {
    return this.env.DB.prepare('SELECT * FROM allocator_actions WHERE id = ?')
      .bind(id)
      .first<AllocatorAction>()
  }

  async list(ventureId: string): Promise<AllocatorAction[]> {
    const result = await this.env.DB.prepare(
      'SELECT * FROM allocator_actions WHERE venture_id = ? ORDER BY created_at DESC'
    ).bind(ventureId).all<AllocatorAction>()

    return result.results || []
  }
}