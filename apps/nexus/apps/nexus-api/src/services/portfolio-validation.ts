// ============================================================
// Portfolio Validation Rules
// ============================================================
// Enforces business rules and data integrity across the portfolio system.
// Validates operations before execution and ensures data consistency.

import type { Env } from '../env'
import type {
  Venture, Offer,
  VentureStatus, OfferStatus
} from '@nexus/types/portfolio'

export interface ValidationResult {
  valid: boolean
  errors: Array<{ field: string; message: string; code: string }>
  warnings: Array<{ field: string; message: string; code: string }>
}

export interface ValidationRule {
  name: string
  description: string
  severity: 'error' | 'warning'
  validate: (data: any, context: ValidationContext) => boolean | Promise<boolean>
  errorMessage: string
}

export interface ValidationContext {
  env: Env
  entityType: string
  operation: 'create' | 'update' | 'delete'
  existingData?: any
}

export class PortfolioValidationService {
  private rules: Map<string, ValidationRule[]> = new Map()

  constructor(private env: Env) {
    this.registerRules()
  }

  // ============================================================
  // Rule Registration
  // ============================================================

  private registerRules(): void {
    // Signal validation rules
    this.rules.set('signal', [
      {
        name: 'signal_title_required',
        description: 'Signal title must not be empty',
        severity: 'error',
        validate: (data) => !!data.title && data.title.trim().length > 0,
        errorMessage: 'Signal title is required',
      },
      {
        name: 'signal_source_type_valid',
        description: 'Signal source type must be valid',
        severity: 'error',
        validate: (data) => ['search_trend', 'competitor_gap', 'marketplace_data', 'ai_radar', 'buyer_feedback'].includes(data.source_type),
        errorMessage: 'Invalid signal source type',
      },
      {
        name: 'signal_demand_score_range',
        description: 'Signal demand score must be between 0 and 100',
        severity: 'warning',
        validate: (data) => data.demand_score >= 0 && data.demand_score <= 100,
        errorMessage: 'Demand score should be between 0 and 100',
      },
    ])

    // Venture validation rules
    this.rules.set('venture', [
      {
        name: 'venture_opportunity_exists',
        description: 'Opportunity must exist when creating venture',
        severity: 'error',
        validate: async (data, context) => {
          const opp = await context.env.DB.prepare('SELECT id FROM opportunities WHERE id = ?')
            .bind(data.opportunity_id)
            .first()
          return !!opp
        },
        errorMessage: 'Referenced opportunity does not exist',
      },
      {
        name: 'venture_vertical_valid',
        description: 'Venture vertical must be valid',
        severity: 'error',
        validate: (data) => ['digital', 'pod', 'content', 'affiliate', 'freelance', 'ecommerce'].includes(data.vertical),
        errorMessage: 'Invalid venture vertical',
      },
      {
        name: 'venture_budget_positive',
        description: 'Budget cap must be positive',
        severity: 'error',
        validate: (data) => data.budget_cap_cents >= 0,
        errorMessage: 'Budget cap cannot be negative',
      },
      {
        name: 'venture_single_per_opportunity_vertical',
        description: 'Only one venture per opportunity+vertical combination',
        severity: 'error',
        validate: async (data, context) => {
          if (context.operation === 'create') {
            const existing = await context.env.DB.prepare(
              'SELECT id FROM ventures WHERE opportunity_id = ? AND vertical = ?'
            ).bind(data.opportunity_id, data.vertical).first()
            return !existing
          }
          return true
        },
        errorMessage: 'Venture already exists for this opportunity+vertical combination',
      },
      {
        name: 'venture_strategy_required',
        description: 'Venture strategy must not be empty',
        severity: 'error',
        validate: (data) => !!data.strategy && data.strategy.trim().length > 0,
        errorMessage: 'Venture strategy is required',
      },
    ])

    // Offer validation rules
    this.rules.set('offer', [
      {
        name: 'offer_venture_exists',
        description: 'Venture must exist when creating offer',
        severity: 'error',
        validate: async (data, context) => {
          const venture = await context.env.DB.prepare('SELECT id FROM ventures WHERE id = ?')
            .bind(data.venture_id)
            .first()
          return !!venture
        },
        errorMessage: 'Referenced venture does not exist',
      },
      {
        name: 'offer_price_non_negative',
        description: 'Offer price cannot be negative',
        severity: 'error',
        validate: (data) => data.price_cents >= 0,
        errorMessage: 'Offer price cannot be negative',
      },
      {
        name: 'offer_platform_exists',
        description: 'Platform must exist if specified',
        severity: 'warning',
        validate: async (data, context) => {
          if (!data.platform_id) return true
          const platform = await context.env.DB.prepare('SELECT id FROM platforms WHERE id = ?')
            .bind(data.platform_id)
            .first()
          return !!platform
        },
        errorMessage: 'Referenced platform does not exist',
      },
      {
        name: 'offer_title_length',
        description: 'Offer title should not be excessively long',
        severity: 'warning',
        validate: (data) => !data.title || data.title.length <= 200,
        errorMessage: 'Offer title is too long (max 200 characters)',
      },
    ])

    // Tracked link validation rules
    this.rules.set('tracked_link', [
      {
        name: 'tracked_link_offer_exists',
        description: 'Offer must exist when creating tracked link',
        severity: 'error',
        validate: async (data, context) => {
          const offer = await context.env.DB.prepare('SELECT id, status FROM offers WHERE id = ?')
            .bind(data.offer_id)
            .first()
          return !!offer
        },
        errorMessage: 'Referenced offer does not exist',
      },
      {
        name: 'tracked_link_slug_unique',
        description: 'Tracked link slug must be unique',
        severity: 'error',
        validate: async (data, context) => {
          if (context.operation === 'create') {
            const existing = await context.env.DB.prepare(
              'SELECT id FROM tracked_links WHERE slug = ?'
            ).bind(data.slug).first()
            return !existing
          }
          return true
        },
        errorMessage: 'Tracked link slug already exists',
      },
      {
        name: 'tracked_link_destination_url_valid',
        description: 'Destination URL must be valid',
        severity: 'error',
        validate: (data) => {
          try {
            new URL(data.destination_url)
            return true
          } catch {
            return false
          }
        },
        errorMessage: 'Invalid destination URL',
      },
      {
        name: 'tracked_link_channel_required',
        description: 'Channel must be specified',
        severity: 'error',
        validate: (data) => !!data.channel && data.channel.trim().length > 0,
        errorMessage: 'Channel is required',
      },
    ])

    // Economic event validation rules
    this.rules.set('economic_event', [
      {
        name: 'economic_event_offer_exists',
        description: 'Offer must exist when creating economic event',
        severity: 'error',
        validate: async (data, context) => {
          const offer = await context.env.DB.prepare('SELECT id FROM offers WHERE id = ?')
            .bind(data.offer_id)
            .first()
          return !!offer
        },
        errorMessage: 'Referenced offer does not exist',
      },
      {
        name: 'economic_event_type_valid',
        description: 'Economic event type must be valid',
        severity: 'error',
        validate: (data) => ['revenue', 'cost', 'fee', 'refund', 'commission'].includes(data.event_type),
        errorMessage: 'Invalid economic event type',
      },
      {
        name: 'economic_event_amount_not_zero',
        description: 'Economic event amount cannot be zero',
        severity: 'error',
        validate: (data) => data.amount_cents !== 0,
        errorMessage: 'Economic event amount cannot be zero',
      },
      {
        name: 'economic_event_refund_negative',
        description: 'Refund amounts must be negative',
        severity: 'error',
        validate: (data) => data.event_type !== 'refund' || data.amount_cents < 0,
        errorMessage: 'Refund amounts must be negative',
      },
      {
        name: 'economic_event_tracked_link_exists',
        description: 'Tracked link must exist if specified',
        severity: 'warning',
        validate: async (data, context) => {
          if (!data.tracked_link_id) return true
          const link = await context.env.DB.prepare('SELECT id FROM tracked_links WHERE id = ?')
            .bind(data.tracked_link_id)
            .first()
          return !!link
        },
        errorMessage: 'Referenced tracked link does not exist',
      },
    ])

    // Asset library validation rules
    this.rules.set('asset_library', [
      {
        name: 'asset_type_valid',
        description: 'Asset type must be valid',
        severity: 'error',
        validate: (data) => ['image', 'copy', 'video', 'audio', 'document', 'template'].includes(data.asset_type),
        errorMessage: 'Invalid asset type',
      },
      {
        name: 'asset_venture_or_offer_required',
        description: 'Asset must be associated with venture or offer',
        severity: 'warning',
        validate: (data) => !!data.venture_id || !!data.offer_id,
        errorMessage: 'Asset should be associated with a venture or offer',
      },
      {
        name: 'asset_file_path_or_cdn',
        description: 'Asset must have either file path or CDN URL',
        severity: 'error',
        validate: (data) => !!data.file_path || !!data.cdn_url,
        errorMessage: 'Asset must have either file path or CDN URL',
      },
    ])
  }

  // ============================================================
  // Validation Methods
  // ============================================================

  /**
   * Validate data before creating an entity
   */
  async validateCreate(entityType: string, data: any): Promise<ValidationResult> {
    const context: ValidationContext = {
      env: this.env,
      entityType,
      operation: 'create',
    }

    return this.runValidation(entityType, data, context)
  }

  /**
   * Validate data before updating an entity
   */
  async validateUpdate(entityType: string, id: string, data: any): Promise<ValidationResult> {
    const existingData = await this.getExistingData(entityType, id)
    
    const context: ValidationContext = {
      env: this.env,
      entityType,
      operation: 'update',
      existingData,
    }

    return this.runValidation(entityType, { ...existingData, ...data }, context)
  }

  /**
   * Validate data before deleting an entity
   */
  async validateDelete(entityType: string, id: string): Promise<ValidationResult> {
    const existingData = await this.getExistingData(entityType, id)
    
    const context: ValidationContext = {
      env: this.env,
      entityType,
      operation: 'delete',
      existingData,
    }

    // Additional delete-specific validations
    const deleteErrors = await this.validateDeleteConstraints(entityType, id, existingData)

    if (deleteErrors.length > 0) {
      return {
        valid: false,
        errors: deleteErrors,
        warnings: [],
      }
    }

    return this.runValidation(entityType, existingData, context)
  }

  // ============================================================
  // Cross-Entity Validations
  // ============================================================

  /**
   * Validate venture status transitions
   */
  async validateVentureStatusTransition(
    ventureId: string,
    newStatus: VentureStatus
  ): Promise<ValidationResult> {
    const venture = await this.env.DB.prepare('SELECT * FROM ventures WHERE id = ?')
      .bind(ventureId)
      .first<Venture>()

    if (!venture) {
      return {
        valid: false,
        errors: [{ field: 'id', message: 'Venture not found', code: 'NOT_FOUND' }],
        warnings: [],
      }
    }

    const currentStatus = venture.status
    const errors: Array<{ field: string; message: string; code: string }> = []

    // Define valid status transitions
    const validTransitions: Record<VentureStatus, VentureStatus[]> = {
      draft: ['building', 'killed', 'archived'],
      building: ['testing', 'killed', 'archived'],
      testing: ['live', 'mutating', 'killed', 'archived'],
      live: ['scaling', 'mutating', 'killed', 'archived'],
      scaling: ['live', 'mutating', 'killed', 'archived'],
      mutating: ['testing', 'live', 'killed', 'archived'],
      killed: ['archived'],
      archived: [],
    }

    if (!validTransitions[currentStatus].includes(newStatus)) {
      errors.push({
        field: 'status',
        message: `Invalid status transition from ${currentStatus} to ${newStatus}`,
        code: 'INVALID_TRANSITION',
      })
    }

    // Additional business rules
    if (newStatus === 'live' || newStatus === 'scaling') {
      const offers = await this.env.DB.prepare(
        'SELECT COUNT(*) as count FROM offers WHERE venture_id = ? AND status = "active"'
      ).bind(ventureId).first<{ count: number }>()

      if (!offers || offers.count === 0) {
        errors.push({
          field: 'status',
          message: 'Cannot go live without active offers',
          code: 'NO_ACTIVE_OFFERS',
        })
      }
    }

    if (newStatus === 'scaling') {
      const performance = await this.getVenturePerformance(ventureId)
      if (performance.profitMargin < 30) {
        errors.push({
          field: 'status',
          message: 'Cannot scale ventures with less than 30% profit margin',
          code: 'INSUFFICIENT_PROFIT',
        })
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings: [],
    }
  }

  /**
   * Validate offer status transitions
   */
  async validateOfferStatusTransition(
    offerId: string,
    newStatus: OfferStatus
  ): Promise<ValidationResult> {
    const offer = await this.env.DB.prepare('SELECT * FROM offers WHERE id = ?')
      .bind(offerId)
      .first<Offer>()

    if (!offer) {
      return {
        valid: false,
        errors: [{ field: 'id', message: 'Offer not found', code: 'NOT_FOUND' }],
        warnings: [],
      }
    }

    const currentStatus = offer.status
    const errors: Array<{ field: string; message: string; code: string }> = []

    // Define valid status transitions
    const validTransitions: Record<OfferStatus, OfferStatus[]> = {
      draft: ['active', 'paused', 'closed'],
      active: ['paused', 'closed'],
      paused: ['active', 'closed'],
      closed: [],
    }

    if (!validTransitions[currentStatus].includes(newStatus)) {
      errors.push({
        field: 'status',
        message: `Invalid status transition from ${currentStatus} to ${newStatus}`,
        code: 'INVALID_TRANSITION',
      })
    }

    // Additional business rules
    if (newStatus === 'active') {
      if (!offer.title || !offer.description) {
        errors.push({
          field: 'status',
          message: 'Offer must have title and description before activation',
          code: 'INCOMPLETE_OFFER',
        })
      }

      if (offer.price_cents <= 0) {
        errors.push({
          field: 'status',
          message: 'Offer must have positive price before activation',
          code: 'INVALID_PRICE',
        })
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings: [],
    }
  }

  /**
   * Validate budget constraints before spending
   */
  async validateBudgetConstraint(
    ventureId: string,
    additionalCostCents: number
  ): Promise<ValidationResult> {
    const venture = await this.env.DB.prepare('SELECT * FROM ventures WHERE id = ?')
      .bind(ventureId)
      .first<Venture>()

    if (!venture) {
      return {
        valid: false,
        errors: [{ field: 'id', message: 'Venture not found', code: 'NOT_FOUND' }],
        warnings: [],
      }
    }

    const errors: Array<{ field: string; message: string; code: string }> = []
    const warnings: Array<{ field: string; message: string; code: string }> = []

    const projectedCost = venture.ai_cost_cents + additionalCostCents
    const utilizationPercent = (projectedCost / venture.budget_cap_cents) * 100

    if (projectedCost > venture.budget_cap_cents) {
      errors.push({
        field: 'budget',
        message: `Budget exceeded: projected cost $${(projectedCost / 100).toFixed(2)} exceeds cap $${(venture.budget_cap_cents / 100).toFixed(2)}`,
        code: 'BUDGET_EXCEEDED',
      })
    } else if (utilizationPercent > 90) {
      warnings.push({
        field: 'budget',
        message: `Budget nearly exhausted: ${utilizationPercent.toFixed(1)}% used`,
        code: 'BUDGET_WARNING',
      })
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    }
  }

  // ============================================================
  // Data Integrity Checks
  // ============================================================

  /**
   * Run comprehensive data integrity checks
   */
  async runDataIntegrityChecks(): Promise<{
    passed: boolean
    checks: Array<{ name: string; passed: boolean; message: string; severity: string }>
  }> {
    const checks: Array<{ name: string; passed: boolean; message: string; severity: string }> = []

    // Check 1: Ventures without opportunities
    const orphanVentures = await this.env.DB.prepare(`
      SELECT COUNT(*) as count FROM ventures v
      LEFT JOIN opportunities o ON v.opportunity_id = o.id
      WHERE o.id IS NULL
    `).first<{ count: number }>()

    checks.push({
      name: 'orphan_ventures',
      passed: (orphanVentures?.count || 0) === 0,
      message: orphanVentures?.count 
        ? `Found ${orphanVentures.count} ventures without valid opportunities`
        : 'All ventures have valid opportunities',
      severity: 'error',
    })

    // Check 2: Offers without ventures
    const orphanOffers = await this.env.DB.prepare(`
      SELECT COUNT(*) as count FROM offers o
      LEFT JOIN ventures v ON o.venture_id = v.id
      WHERE v.id IS NULL
    `).first<{ count: number }>()

    checks.push({
      name: 'orphan_offers',
      passed: (orphanOffers?.count || 0) === 0,
      message: orphanOffers?.count
        ? `Found ${orphanOffers.count} offers without valid ventures`
        : 'All offers have valid ventures',
      severity: 'error',
    })

    // Check 3: Economic events without offers
    const orphanEvents = await this.env.DB.prepare(`
      SELECT COUNT(*) as count FROM economic_events e
      LEFT JOIN offers o ON e.offer_id = o.id
      WHERE o.id IS NULL
    `).first<{ count: number }>()

    checks.push({
      name: 'orphan_economic_events',
      passed: (orphanEvents?.count || 0) === 0,
      message: orphanEvents?.count
        ? `Found ${orphanEvents.count} economic events without valid offers`
        : 'All economic events have valid offers',
      severity: 'error',
    })

    // Check 4: Tracked links without offers
    const orphanLinks = await this.env.DB.prepare(`
      SELECT COUNT(*) as count FROM tracked_links t
      LEFT JOIN offers o ON t.offer_id = o.id
      WHERE o.id IS NULL
    `).first<{ count: number }>()

    checks.push({
      name: 'orphan_tracked_links',
      passed: (orphanLinks?.count || 0) === 0,
      message: orphanLinks?.count
        ? `Found ${orphanLinks.count} tracked links without valid offers`
        : 'All tracked links have valid offers',
      severity: 'error',
    })

    // Check 5: Negative profit margins on live ventures
    const negativeProfitVentures = await this.env.DB.prepare(`
      SELECT COUNT(*) as count FROM ventures
      WHERE status IN ('live', 'scaling') AND profit_cents < 0
    `).first<{ count: number }>()

    checks.push({
      name: 'negative_profit_live_ventures',
      passed: (negativeProfitVentures?.count || 0) === 0,
      message: negativeProfitVentures?.count
        ? `Found ${negativeProfitVentures.count} live/scaling ventures with negative profit`
        : 'All live/scaling ventures are profitable',
      severity: 'warning',
    })

    return {
      passed: checks.every(c => c.passed || c.severity === 'warning'),
      checks,
    }
  }

  // ============================================================
  // Helper Methods
  // ============================================================

  private async runValidation(
    entityType: string,
    data: any,
    context: ValidationContext
  ): Promise<ValidationResult> {
    const entityRules = this.rules.get(entityType) || []
    const errors: Array<{ field: string; message: string; code: string }> = []
    const warnings: Array<{ field: string; message: string; code: string }> = []

    for (const rule of entityRules) {
      try {
        const isValid = await rule.validate(data, context)
        
        if (!isValid) {
          const result = {
            field: rule.name,
            message: rule.errorMessage,
            code: rule.name.toUpperCase().replace(/-/g, '_'),
          }

          if (rule.severity === 'error') {
            errors.push(result)
          } else {
            warnings.push(result)
          }
        }
      } catch (error) {
        console.error(`Validation rule ${rule.name} failed:`, error)
        errors.push({
          field: rule.name,
          message: `Validation rule failed: ${error}`,
          code: 'VALIDATION_ERROR',
        })
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    }
  }

  private async getExistingData(entityType: string, id: string): Promise<any> {
    const tables: Record<string, string> = {
      signal: 'signals',
      venture: 'ventures',
      offer: 'offers',
      tracked_link: 'tracked_links',
      economic_event: 'economic_events',
      asset_library: 'asset_library',
    }

    const table = tables[entityType]
    if (!table) return {}

    const result = await this.env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`)
      .bind(id)
      .first()

    return result || {}
  }

  private async validateDeleteConstraints(
    entityType: string,
    id: string,
    _existingData: any
  ): Promise<Array<{ field: string; message: string; code: string }>> {
    const errors: Array<{ field: string; message: string; code: string }> = []

    // Prevent deletion if entity has dependencies
    switch (entityType) {
      case 'venture':
        const offerCount = await this.env.DB.prepare(
          'SELECT COUNT(*) as count FROM offers WHERE venture_id = ?'
        ).bind(id).first<{ count: number }>()
        
        if (offerCount && offerCount.count > 0) {
          errors.push({
            field: 'id',
            message: `Cannot delete venture with ${offerCount.count} existing offers`,
            code: 'HAS_DEPENDENTS',
          })
        }
        break

      case 'offer':
        const eventCount = await this.env.DB.prepare(
          'SELECT COUNT(*) as count FROM economic_events WHERE offer_id = ?'
        ).bind(id).first<{ count: number }>()
        
        const linkCount = await this.env.DB.prepare(
          'SELECT COUNT(*) as count FROM tracked_links WHERE offer_id = ?'
        ).bind(id).first<{ count: number }>()

        if (eventCount && eventCount.count > 0 || linkCount && linkCount.count > 0) {
          errors.push({
            field: 'id',
            message: 'Cannot delete offer with existing economic events or tracked links',
            code: 'HAS_DEPENDENTS',
          })
        }
        break

      case 'opportunity':
        const ventureCount = await this.env.DB.prepare(
          'SELECT COUNT(*) as count FROM ventures WHERE opportunity_id = ?'
        ).bind(id).first<{ count: number }>()

        if (ventureCount && ventureCount.count > 0) {
          errors.push({
            field: 'id',
            message: `Cannot delete opportunity with ${ventureCount.count} existing ventures`,
            code: 'HAS_DEPENDENTS',
          })
        }
        break
    }

    return errors
  }

  private async getVenturePerformance(ventureId: string): Promise<{
    profitMargin: number
    revenue: number
    cost: number
  }> {
    const venture = await this.env.DB.prepare('SELECT * FROM ventures WHERE id = ?')
      .bind(ventureId)
      .first<Venture>()

    if (!venture) {
      return { profitMargin: 0, revenue: 0, cost: 0 }
    }

    const profitMargin = venture.revenue_cents > 0 
      ? (venture.profit_cents / venture.revenue_cents) * 100 
      : 0

    return {
      profitMargin,
      revenue: venture.revenue_cents,
      cost: venture.ai_cost_cents,
    }
  }
}

// ============================================================
// Factory
// ============================================================

export function getPortfolioValidationService(env: Env): PortfolioValidationService {
  return new PortfolioValidationService(env)
}