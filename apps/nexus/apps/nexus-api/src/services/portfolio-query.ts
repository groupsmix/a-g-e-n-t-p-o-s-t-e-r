// ============================================================
// Portfolio Query API
// ============================================================
// Provides comprehensive analytics and reporting capabilities across
// the entire portfolio. Enables complex queries for insights and decision-making.

import type { Env } from '../env'
import type {
  Venture, Offer, EconomicEvent, Signal,
  VentureStatus, Vertical
} from '@nexus/types/portfolio'

// Local row shape for the opportunities table — the shared @nexus/types
// package does not yet export an Opportunity entity, so we describe the
// columns we read directly. Keep in sync with migrations/*opportunities*.
interface Opportunity {
  id: string
  trend_name: string
  target_buyer: string
  product_idea: string
  total_score: number
  status: string
}

export interface PortfolioQueryOptions {
  dateRange?: { start: string; end: string }
  verticals?: Vertical[]
  statuses?: VentureStatus[]
  includeArchived?: boolean
}

export interface PortfolioMetrics {
  totalVentures: number
  activeVentures: number
  totalInvested: number
  totalRevenue: number
  totalProfit: number
  averageRoi: number
  averageProfitMargin: number
  topPerformingVentures: Array<{ id: string; name: string; roi: number; profit: number }>
  underperformingVentures: Array<{ id: string; name: string; roi: number; loss: number }>
}

export interface VentureDetails extends Venture {
  opportunity?: {
    id: string
    trendName: string
    targetBuyer: string
  }
  offers: Offer[]
  economicEvents: EconomicEvent[]
  performance: {
    totalRevenue: number
    totalCost: number
    netProfit: number
    roi: number
    profitMargin: number
    conversionRate: number
    averageOrderValue: number
  }
}

export interface OpportunityPipeline {
  opportunities: Array<{
    id: string
    trendName: string
    totalScore: number
    venturesCount: number
    totalRevenue: number
    status: string
  }>
  totalRevenue: number
  topOpportunities: Array<{ id: string; trendName: string; revenue: number }>
}

export interface CrossVerticalInsights {
  byVertical: Record<Vertical, {
    ventureCount: number
    totalInvested: number
    totalRevenue: number
    totalProfit: number
    averageRoi: number
    topVentures: Array<{ id: string; roi: number }>
  }>
  bestPerformingVertical: { vertical: Vertical; roi: number }
  worstPerformingVertical: { vertical: Vertical; roi: number }
  recommendedVerticalShifts: Array<{ from: Vertical; to: Vertical; reason: string }>
}

export class PortfolioQueryAPI {
  constructor(private env: Env) {}

  // ============================================================
  // Portfolio-Level Queries
  // ============================================================

  /**
   * Get overall portfolio metrics
   */
  async getPortfolioMetrics(options?: PortfolioQueryOptions): Promise<PortfolioMetrics> {
    const ventures = await this.queryVentures(options)
    
    const metrics: PortfolioMetrics = {
      totalVentures: ventures.length,
      activeVentures: ventures.filter(v => ['testing', 'live', 'scaling'].includes(v.status)).length,
      totalInvested: ventures.reduce((sum, v) => sum + v.ai_cost_cents, 0),
      totalRevenue: ventures.reduce((sum, v) => sum + v.revenue_cents, 0),
      totalProfit: ventures.reduce((sum, v) => sum + v.profit_cents, 0),
      averageRoi: 0,
      averageProfitMargin: 0,
      topPerformingVentures: [],
      underperformingVentures: [],
    }

    // Calculate ROI for each venture
    const ventureRois = await Promise.all(
      ventures.map(async (v) => ({
        venture: v,
        roi: await this.calculateVentureRoi(v.id),
        profit: v.profit_cents,
      }))
    )

    const rois = ventureRois.map(vr => vr.roi)

    metrics.averageRoi = rois.length > 0 ? rois.reduce((a, b) => a + b, 0) / rois.length : 0
    metrics.averageProfitMargin = metrics.totalRevenue > 0 ? (metrics.totalProfit / metrics.totalRevenue) * 100 : 0

    // Top performers
    metrics.topPerformingVentures = ventureRois
      .filter(vr => vr.roi > 50)
      .sort((a, b) => b.roi - a.roi)
      .slice(0, 10)
      .map(vr => ({
        id: vr.venture.id,
        name: vr.venture.strategy,
        roi: vr.roi,
        profit: vr.profit,
      }))

    // Underperformers
    metrics.underperformingVentures = ventureRois
      .filter(vr => vr.roi < 0)
      .sort((a, b) => a.roi - b.roi)
      .slice(0, 10)
      .map(vr => ({
        id: vr.venture.id,
        name: vr.venture.strategy,
        roi: vr.roi,
        loss: vr.profit,
      }))

    return metrics
  }

  /**
   * Get detailed venture information with performance data
   */
  async getVentureDetails(ventureId: string): Promise<VentureDetails | null> {
    const venture = await this.env.DB.prepare('SELECT * FROM ventures WHERE id = ?')
      .bind(ventureId)
      .first<Venture>()

    if (!venture) return null

    // Get opportunity details
    const opportunity = await this.env.DB.prepare(`
      SELECT id, trend_name, target_buyer FROM opportunities WHERE id = ?
    `).bind(venture.opportunity_id).first<{ id: string; trend_name: string; target_buyer: string }>()

    // Get offers
    const offersResult = await this.env.DB.prepare(
      'SELECT * FROM offers WHERE venture_id = ?'
    ).bind(ventureId).all<Offer>()
    const offers = offersResult.results || []

    // Get economic events
    const offerIds = offers.map(o => o.id)
    let economicEvents: EconomicEvent[] = []
    
    if (offerIds.length > 0) {
      const placeholders = offerIds.map(() => '?').join(',')
      const eventsResult = await this.env.DB.prepare(`
        SELECT * FROM economic_events WHERE offer_id IN (${placeholders}) ORDER BY occurred_at DESC
      `).bind(...offerIds).all<EconomicEvent>()
      economicEvents = eventsResult.results || []
    }

    // Calculate performance
    const performance = await this.calculateVenturePerformance(ventureId, offerIds)

    return {
      ...venture,
      opportunity: opportunity ? {
        id: opportunity.id,
        trendName: opportunity.trend_name,
        targetBuyer: opportunity.target_buyer,
      } : undefined,
      offers,
      economicEvents,
      performance,
    }
  }

  /**
   * Get opportunity pipeline analysis
   */
  async getOpportunityPipeline(_options?: PortfolioQueryOptions): Promise<OpportunityPipeline> {
    const opportunities = await this.env.DB.prepare(`
      SELECT * FROM opportunities 
      WHERE status IN ('new', 'watchlist', 'approved', 'in_progress')
      ORDER BY total_score DESC
    `).all<Opportunity>()

    const opps = opportunities.results || []
    const pipelineOpportunities: Array<{
      id: string
      trendName: string
      totalScore: number
      venturesCount: number
      totalRevenue: number
      status: string
    }> = []
    let totalRevenue = 0

    for (const opp of opps) {
      const venturesResult = await this.env.DB.prepare(
        'SELECT * FROM ventures WHERE opportunity_id = ?'
      ).bind(opp.id).all<Venture>()
      const ventures = venturesResult.results || []

      const ventureRevenue = ventures.reduce((sum, v) => sum + v.revenue_cents, 0)
      totalRevenue += ventureRevenue

      pipelineOpportunities.push({
        id: opp.id,
        trendName: opp.trend_name,
        totalScore: opp.total_score,
        venturesCount: ventures.length,
        totalRevenue: ventureRevenue,
        status: opp.status,
      })
    }

    const topOpportunities = pipelineOpportunities
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, 10)
      .map(o => ({ id: o.id, trendName: o.trendName, revenue: o.totalRevenue }))

    return {
      opportunities: pipelineOpportunities,
      totalRevenue,
      topOpportunities,
    }
  }

  /**
   * Get cross-vertical insights
   */
  async getCrossVerticalInsights(options?: PortfolioQueryOptions): Promise<CrossVerticalInsights> {
    const ventures = await this.queryVentures(options)

    const byVertical: Record<Vertical, {
      ventureCount: number
      totalInvested: number
      totalRevenue: number
      totalProfit: number
      averageRoi: number
      topVentures: Array<{ id: string; roi: number }>
    }> = {
      digital: { ventureCount: 0, totalInvested: 0, totalRevenue: 0, totalProfit: 0, averageRoi: 0, topVentures: [] },
      pod: { ventureCount: 0, totalInvested: 0, totalRevenue: 0, totalProfit: 0, averageRoi: 0, topVentures: [] },
      content: { ventureCount: 0, totalInvested: 0, totalRevenue: 0, totalProfit: 0, averageRoi: 0, topVentures: [] },
      affiliate: { ventureCount: 0, totalInvested: 0, totalRevenue: 0, totalProfit: 0, averageRoi: 0, topVentures: [] },
      freelance: { ventureCount: 0, totalInvested: 0, totalRevenue: 0, totalProfit: 0, averageRoi: 0, topVentures: [] },
      ecommerce: { ventureCount: 0, totalInvested: 0, totalRevenue: 0, totalProfit: 0, averageRoi: 0, topVentures: [] },
    }

    for (const venture of ventures) {
      const vertical = venture.vertical as Vertical
      const roi = await this.calculateVentureRoi(venture.id)

      byVertical[vertical].ventureCount++
      byVertical[vertical].totalInvested += venture.ai_cost_cents
      byVertical[vertical].totalRevenue += venture.revenue_cents
      byVertical[vertical].totalProfit += venture.profit_cents
      byVertical[vertical].topVentures.push({ id: venture.id, roi })
    }

    // Calculate average ROI per vertical
    for (const vertical in byVertical) {
      const data = byVertical[vertical as Vertical]
      if (data.ventureCount > 0) {
        data.averageRoi = data.topVentures.reduce((sum, v) => sum + v.roi, 0) / data.ventureCount
        data.topVentures = data.topVentures.sort((a, b) => b.roi - a.roi).slice(0, 5)
      }
    }

    // Find best and worst performing verticals
    const verticalEntries = Object.entries(byVertical).filter(([_, data]) => data.ventureCount > 0)
    const bestPerforming = verticalEntries.sort((a, b) => b[1].averageRoi - a[1].averageRoi)[0]
    const worstPerforming = verticalEntries.sort((a, b) => a[1].averageRoi - b[1].averageRoi)[0]

    // Generate recommended shifts
    const recommendedShifts: Array<{ from: Vertical; to: Vertical; reason: string }> = []
    
    if (bestPerforming && worstPerforming) {
      const roiDiff = bestPerforming[1].averageRoi - worstPerforming[1].averageRoi
      if (roiDiff > 50) {
        recommendedShifts.push({
          from: worstPerforming[0] as Vertical,
          to: bestPerforming[0] as Vertical,
          reason: `${bestPerforming[0]} outperforms ${worstPerforming[0]} by ${roiDiff.toFixed(1)}% ROI`,
        })
      }
    }

    return {
      byVertical,
      bestPerformingVertical: bestPerforming ? { 
        vertical: bestPerforming[0] as Vertical, 
        roi: bestPerforming[1].averageRoi 
      } : { vertical: 'digital', roi: 0 },
      worstPerformingVertical: worstPerforming ? { 
        vertical: worstPerforming[0] as Vertical, 
        roi: worstPerforming[1].averageRoi 
      } : { vertical: 'digital', roi: 0 },
      recommendedVerticalShifts: recommendedShifts,
    }
  }

  // ============================================================
  // Time-Series Analysis
  // ============================================================

  /**
   * Get revenue trends over time
   */
  async getRevenueTrends(days: number = 30, _groupBy: 'day' | 'week' = 'day'): Promise<{
    periods: Array<{ period: string; revenue: number; cost: number; profit: number }>
    totalRevenue: number
    totalCost: number
    totalProfit: number
    averageDailyRevenue: number
    growthRate: number
  }> {
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    const result = await this.env.DB.prepare(`
      SELECT 
        DATE(occurred_at) as period,
        SUM(CASE WHEN event_type = 'revenue' THEN amount_cents ELSE 0 END) as revenue,
        SUM(CASE WHEN event_type IN ('cost', 'fee') THEN amount_cents ELSE 0 END) as cost
      FROM economic_events
      WHERE occurred_at >= ?
      GROUP BY DATE(occurred_at)
      ORDER BY period ASC
    `).bind(startDate.toISOString()).all<{ period: string; revenue: number; cost: number }>()

    const periods = (result.results || []).map(row => ({
      period: row.period,
      revenue: row.revenue,
      cost: row.cost,
      profit: row.revenue - row.cost,
    }))

    const totalRevenue = periods.reduce((sum, p) => sum + p.revenue, 0)
    const totalCost = periods.reduce((sum, p) => sum + p.cost, 0)
    const totalProfit = periods.reduce((sum, p) => sum + p.profit, 0)
    const averageDailyRevenue = periods.length > 0 ? totalRevenue / periods.length : 0

    // Calculate growth rate (comparing first half to second half)
    const midPoint = Math.floor(periods.length / 2)
    const firstHalfRevenue = periods.slice(0, midPoint).reduce((sum, p) => sum + p.revenue, 0)
    const secondHalfRevenue = periods.slice(midPoint).reduce((sum, p) => sum + p.revenue, 0)
    const growthRate = firstHalfRevenue > 0 ? ((secondHalfRevenue - firstHalfRevenue) / firstHalfRevenue) * 100 : 0

    return {
      periods,
      totalRevenue,
      totalCost,
      totalProfit,
      averageDailyRevenue,
      growthRate,
    }
  }

  /**
   * Get venture lifecycle analysis
   */
  async getVentureLifecycleAnalysis(): Promise<{
    byStatus: Record<VentureStatus, { count: number; avgTimeInStatus: number }>
    averageTimeToProfit: number
    averageTimeToKill: number
    statusTransitionRates: Array<{ from: VentureStatus; to: VentureStatus; rate: number }>
  }> {
    const ventures = await this.env.DB.prepare('SELECT * FROM ventures').all<Venture>()
    const ventureList = ventures.results || []

    const byStatus: Record<VentureStatus, { count: number; avgTimeInStatus: number }> = {
      draft: { count: 0, avgTimeInStatus: 0 },
      building: { count: 0, avgTimeInStatus: 0 },
      testing: { count: 0, avgTimeInStatus: 0 },
      live: { count: 0, avgTimeInStatus: 0 },
      scaling: { count: 0, avgTimeInStatus: 0 },
      mutating: { count: 0, avgTimeInStatus: 0 },
      killed: { count: 0, avgTimeInStatus: 0 },
      archived: { count: 0, avgTimeInStatus: 0 },
    }

    for (const venture of ventureList) {
      byStatus[venture.status].count++
      const timeInStatus = (Date.now() - new Date(venture.updated_at).getTime()) / (1000 * 60 * 60 * 24) // days
      byStatus[venture.status].avgTimeInStatus += timeInStatus
    }

    // Calculate averages
    for (const status in byStatus) {
      const data = byStatus[status as VentureStatus]
      if (data.count > 0) {
        data.avgTimeInStatus = data.avgTimeInStatus / data.count
      }
    }

    // Calculate time to profit (for profitable ventures)
    const profitableVentures = ventureList.filter(v => v.profit_cents > 0)
    const averageTimeToProfit = profitableVentures.length > 0
      ? profitableVentures.reduce((sum, v) => {
          const days = (Date.now() - new Date(v.created_at).getTime()) / (1000 * 60 * 60 * 24)
          return sum + days
        }, 0) / profitableVentures.length
      : 0

    // Calculate time to kill (for killed ventures)
    const killedVentures = ventureList.filter(v => v.status === 'killed')
    const averageTimeToKill = killedVentures.length > 0
      ? killedVentures.reduce((sum, v) => {
          const days = (Date.now() - new Date(v.created_at).getTime()) / (1000 * 60 * 60 * 24)
          return sum + days
        }, 0) / killedVentures.length
      : 0

    return {
      byStatus,
      averageTimeToProfit,
      averageTimeToKill,
      statusTransitionRates: [], // Would need more complex analysis of historical status changes
    }
  }

  // ============================================================
  // Signal Analysis
  // ============================================================

  /**
   * Get signal-to-venture conversion analysis
   */
  async getSignalConversionAnalysis(): Promise<{
    totalSignals: number
    linkedSignals: number
    conversionRate: number
    topPerformingSignals: Array<{ id: string; title: string; ventureRevenue: number }>
    unlinkedHighValueSignals: Array<{ id: string; title: string; demandScore: number }>
  }> {
    const signalsResult = await this.env.DB.prepare('SELECT * FROM signals').all<Signal>()
    const signals = signalsResult.results || []

    const linkedSignals = signals.filter(s => s.status === 'linked').length
    const conversionRate = signals.length > 0 ? (linkedSignals / signals.length) * 100 : 0

    // Get top performing signals (by revenue of linked ventures)
    const topPerformingSignals: Array<{ id: string; title: string; ventureRevenue: number }> = []
    
    for (const signal of signals) {
      const venturesResult = await this.env.DB.prepare(
        'SELECT * FROM ventures WHERE signal_id = ?'
      ).bind(signal.id).all<Venture>()
      const ventures = venturesResult.results || []

      const totalRevenue = ventures.reduce((sum, v) => sum + v.revenue_cents, 0)
      if (totalRevenue > 0) {
        topPerformingSignals.push({
          id: signal.id,
          title: signal.title,
          ventureRevenue: totalRevenue,
        })
      }
    }

    topPerformingSignals.sort((a, b) => b.ventureRevenue - a.ventureRevenue)

    // Get unlinked high-value signals
    const unlinkedHighValueSignals = signals
      .filter(s => s.status === 'raw' || s.status === 'scored')
      .filter(s => s.demand_score > 70)
      .slice(0, 10)
      .map(s => ({
        id: s.id,
        title: s.title,
        demandScore: s.demand_score,
      }))

    return {
      totalSignals: signals.length,
      linkedSignals,
      conversionRate,
      topPerformingSignals: topPerformingSignals.slice(0, 10),
      unlinkedHighValueSignals,
    }
  }

  // ============================================================
  // Complex Queries
  // ============================================================

  /**
   * Find similar performing ventures
   */
  async findSimilarVentures(ventureId: string, limit: number = 5): Promise<Venture[]> {
    const targetVenture = await this.env.DB.prepare('SELECT * FROM ventures WHERE id = ?')
      .bind(ventureId)
      .first<Venture>()

    if (!targetVenture) return []

    const targetRoi = await this.calculateVentureRoi(ventureId)

    // Find ventures with similar ROI (within 20%)
    const allVentures = await this.env.DB.prepare(`
      SELECT * FROM ventures 
      WHERE id != ? AND status IN ('live', 'scaling')
    `).bind(ventureId).all<Venture>()

    const similarVentures: Array<{ venture: Venture; roiDiff: number }> = []

    for (const venture of allVentures.results || []) {
      const roi = await this.calculateVentureRoi(venture.id)
      const roiDiff = Math.abs(roi - targetRoi)
      
      if (roiDiff < targetRoi * 0.2) {
        similarVentures.push({ venture, roiDiff })
      }
    }

    return similarVentures
      .sort((a, b) => a.roiDiff - b.roiDiff)
      .slice(0, limit)
      .map(sv => sv.venture)
  }

  /**
   * Get portfolio health score
   */
  async getPortfolioHealthScore(): Promise<{
    overallScore: number
    components: {
      diversityScore: number
      profitabilityScore: number
      growthScore: number
      efficiencyScore: number
    }
    recommendations: string[]
  }> {
    const metrics = await this.getPortfolioMetrics()
    const crossVertical = await this.getCrossVerticalInsights()
    const revenueTrends = await this.getRevenueTrends(30)

    // Diversity score (based on vertical distribution)
    const verticalCount = Object.keys(crossVertical.byVertical).filter(
      v => crossVertical.byVertical[v as Vertical].ventureCount > 0
    ).length
    const diversityScore = Math.min((verticalCount / 6) * 100, 100)

    // Profitability score
    const profitabilityScore = Math.min(Math.max(metrics.averageRoi, 0), 100)

    // Growth score
    const growthScore = Math.min(Math.max(revenueTrends.growthRate + 50, 0), 100)

    // Efficiency score (revenue per invested dollar)
    const efficiencyScore = metrics.totalInvested > 0 
      ? Math.min((metrics.totalRevenue / metrics.totalInvested) * 100, 100) 
      : 0

    const overallScore = (diversityScore + profitabilityScore + growthScore + efficiencyScore) / 4

    // Generate recommendations
    const recommendations: string[] = []

    if (diversityScore < 50) {
      recommendations.push('Increase vertical diversity to reduce risk')
    }
    if (profitabilityScore < 50) {
      recommendations.push('Review and optimize underperforming ventures')
    }
    if (growthScore < 50) {
      recommendations.push('Focus on scaling top-performing ventures')
    }
    if (efficiencyScore < 50) {
      recommendations.push('Improve capital allocation efficiency')
    }

    return {
      overallScore,
      components: {
        diversityScore,
        profitabilityScore,
        growthScore,
        efficiencyScore,
      },
      recommendations,
    }
  }

  // ============================================================
  // Helpers
  // ============================================================

  private async queryVentures(options?: PortfolioQueryOptions): Promise<Venture[]> {
    let sql = 'SELECT * FROM ventures WHERE 1=1'
    const params: any[] = []

    if (options?.verticals && options.verticals.length > 0) {
      const placeholders = options.verticals.map(() => '?').join(',')
      sql += ` AND vertical IN (${placeholders})`
      params.push(...options.verticals)
    }

    if (options?.statuses && options.statuses.length > 0) {
      const placeholders = options.statuses.map(() => '?').join(',')
      sql += ` AND status IN (${placeholders})`
      params.push(...options.statuses)
    }

    if (!options?.includeArchived) {
      sql += " AND status != 'archived'"
    }

    if (options?.dateRange) {
      sql += ' AND created_at >= ? AND created_at <= ?'
      params.push(options.dateRange.start, options.dateRange.end)
    }

    sql += ' ORDER BY created_at DESC'

    const result = await this.env.DB.prepare(sql).bind(...params).all<Venture>()
    return result.results || []
  }

  private async calculateVentureRoi(ventureId: string): Promise<number> {
    const venture = await this.env.DB.prepare('SELECT * FROM ventures WHERE id = ?')
      .bind(ventureId)
      .first<Venture>()

    if (!venture) return 0

    return venture.ai_cost_cents > 0 
      ? ((venture.profit_cents - venture.ai_cost_cents) / venture.ai_cost_cents) * 100 
      : 0
  }

  private async calculateVenturePerformance(ventureId: string, offerIds: string[]): Promise<{
    totalRevenue: number
    totalCost: number
    netProfit: number
    roi: number
    profitMargin: number
    conversionRate: number
    averageOrderValue: number
  }> {
    let totalRevenue = 0
    let totalCost = 0
    let conversionCount = 0

    if (offerIds.length > 0) {
      const placeholders = offerIds.map(() => '?').join(',')
      
      const revenueResult = await this.env.DB.prepare(`
        SELECT COALESCE(SUM(amount_cents), 0) as total, COUNT(*) as count 
        FROM economic_events 
        WHERE offer_id IN (${placeholders}) AND event_type = 'revenue'
      `).bind(...offerIds).first<{ total: number; count: number }>()
      
      const costResult = await this.env.DB.prepare(`
        SELECT COALESCE(SUM(amount_cents), 0) as total 
        FROM economic_events 
        WHERE offer_id IN (${placeholders}) AND event_type IN ('cost', 'fee')
      `).bind(...offerIds).first<{ total: number }>()

      totalRevenue = revenueResult?.total || 0
      totalCost = costResult?.total || 0
      conversionCount = revenueResult?.count || 0
    }

    const netProfit = totalRevenue - totalCost
    const venture = await this.env.DB.prepare('SELECT ai_cost_cents, revenue_cents FROM ventures WHERE id = ?')
      .bind(ventureId)
      .first<{ ai_cost_cents: number; revenue_cents: number }>()

    const roi = venture?.ai_cost_cents 
      ? ((netProfit - venture.ai_cost_cents) / venture.ai_cost_cents) * 100 
      : 0

    const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0
    const averageOrderValue = conversionCount > 0 ? totalRevenue / conversionCount : 0

    // Conversion rate would need click tracking data
    const conversionRate = 0 // Placeholder

    return {
      totalRevenue,
      totalCost,
      netProfit,
      roi,
      profitMargin,
      conversionRate,
      averageOrderValue,
    }
  }
}

// ============================================================
// Factory
// ============================================================

export function getPortfolioQueryAPI(env: Env): PortfolioQueryAPI {
  return new PortfolioQueryAPI(env)
}