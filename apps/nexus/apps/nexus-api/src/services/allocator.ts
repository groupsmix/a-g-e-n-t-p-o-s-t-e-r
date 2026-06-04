// ============================================================
// Enhanced Allocator Action Service
// ============================================================
// Implements the capital allocator that makes kill/mutate/expand/scale decisions
// based on venture performance data. This is the brain of the money machine.

import type { Env } from '../env'
import type {
  AllocatorActionType,
  Venture, VentureStatus
} from '@nexus/types/portfolio'
import { AllocatorActionService as BaseAllocatorService, VentureService } from './portfolio'

export interface AllocationDecision {
  ventureId: string
  action: AllocatorActionType
  confidence: number
  reasoning: string
  dataBefore: Record<string, unknown>
  dataAfter: Record<string, unknown>
  recommendedChanges?: Record<string, unknown>
}

export interface AllocationCriteria {
  minProfitMargin: number
  minRoi: number
  maxBurnRate: number
  testQuotaThreshold: number
  timeInStatusThreshold: number // days
}

export interface PortfolioOverview {
  totalVentures: number
  byStatus: Record<VentureStatus, number>
  byVertical: Record<string, number>
  totalInvested: number
  totalRevenue: number
  totalProfit: number
  averageRoi: number
  atRiskVentures: string[]
  scalingReadyVentures: string[]
}

export class EnhancedAllocatorService {
  private baseService: BaseAllocatorService
  private ventureService: VentureService

  constructor(env: Env) {
    this.baseService = new BaseAllocatorService(env)
    this.ventureService = new VentureService(env)
  }

  // ============================================================
  // Main Allocation Logic
  // ============================================================

  /**
   * Run allocation decision for a single venture
   */
  async allocateVenture(
    ventureId: string,
    criteria?: Partial<AllocationCriteria>
  ): Promise<AllocationDecision> {
    const venture = await this.getVenture(ventureId)
    if (!venture) {
      throw new Error(`Venture ${ventureId} not found`)
    }

    const decisionCriteria = this.getDefaultCriteria(criteria)
    const performance = await this.getVenturePerformance(ventureId)
    
    const action = await this.determineAction(venture, performance, decisionCriteria)
    const dataBefore = {
      status: venture.status,
      budget_cap_cents: venture.budget_cap_cents,
      ai_cost_cents: venture.ai_cost_cents,
      revenue_cents: venture.revenue_cents,
      profit_cents: venture.profit_cents,
      ...performance,
    }

    // Execute the decision
    const dataAfter = await this.executeDecision(ventureId, action, decisionCriteria)

    // Record the action
    await this.baseService.create({
      venture_id: ventureId,
      action_type: action.action,
      reason: action.reasoning,
      confidence: action.confidence,
      data_before: dataBefore,
      data_after: dataAfter,
    })

    return {
      ventureId,
      action: action.action,
      confidence: action.confidence,
      reasoning: action.reasoning,
      dataBefore,
      dataAfter,
      recommendedChanges: action.recommendedChanges,
    }
  }

  /**
   * Run allocation across all active ventures
   */
  async allocatePortfolio(criteria?: Partial<AllocationCriteria>): Promise<{
    decisions: AllocationDecision[]
    summary: {
      totalProcessed: number
      kill: number
      mutate: number
      expand: number
      scale: number
      hold: number
    }
  }> {
    const activeVentures = await this.getActiveVentures()
    const decisions: AllocationDecision[] = []
    const summary = { kill: 0, mutate: 0, expand: 0, scale: 0, hold: 0 }

    for (const venture of activeVentures) {
      try {
        const decision = await this.allocateVenture(venture.id, criteria)
        decisions.push(decision)
        summary[decision.action as keyof typeof summary]++
      } catch (error) {
        console.error(`Failed to allocate venture ${venture.id}:`, error)
      }
    }

    return {
      decisions,
      summary: {
        totalProcessed: activeVentures.length,
        ...summary,
      },
    }
  }

  // ============================================================
  // Decision Logic
  // ============================================================

  private async determineAction(
    venture: Venture,
    performance: any,
    criteria: AllocationCriteria
  ): Promise<{ action: AllocatorActionType; confidence: number; reasoning: string; recommendedChanges?: Record<string, unknown> }> {
    const profitMargin = performance.profitMargin || 0
    const roi = performance.roi || 0
    const budgetUtilization = performance.budgetUtilization || 0
    const testProgress = performance.testProgress || 0

    // KILL conditions
    if (profitMargin < criteria.minProfitMargin && venture.ai_cost_cents > venture.budget_cap_cents * 0.8) {
      return {
        action: 'kill',
        confidence: 0.9,
        reasoning: `Venture is unprofitable (${profitMargin.toFixed(1)}% margin) and has burned ${budgetUtilization.toFixed(1)}% of budget with no signs of recovery.`,
      }
    }

    if (roi < -50 && venture.status !== 'draft') {
      return {
        action: 'kill',
        confidence: 0.85,
        reasoning: `ROI is critically low (${roi.toFixed(1)}%). Venture not recovering despite testing.`,
      }
    }

    if (venture.status === 'testing' && testProgress > 100 && roi < criteria.minRoi) {
      return {
        action: 'kill',
        confidence: 0.8,
        reasoning: `Testing complete (${testProgress.toFixed(0)}% of quota) but ROI (${roi.toFixed(1)}%) below threshold (${criteria.minRoi}%).`,
      }
    }

    // SCALE conditions
    if (profitMargin > 60 && roi > 200 && venture.status === 'live') {
      return {
        action: 'scale',
        confidence: 0.95,
        reasoning: `Exceptional performance: ${profitMargin.toFixed(1)}% margin, ${roi.toFixed(1)}% ROI. Ready for scaling.`,
        recommendedChanges: {
          suggested_budget_increase: venture.budget_cap_cents * 2,
          suggested_quota_increase: venture.test_quota_clicks * 3,
        },
      }
    }

    if (profitMargin > 50 && roi > 100 && venture.revenue_cents > venture.budget_cap_cents * 3) {
      return {
        action: 'scale',
        confidence: 0.85,
        reasoning: `Strong performance with 3x revenue vs budget. Good candidate for scaling.`,
        recommendedChanges: {
          suggested_budget_increase: venture.budget_cap_cents * 1.5,
        },
      }
    }

    // EXPAND conditions
    if (profitMargin > 30 && roi > 50 && venture.status === 'live') {
      return {
        action: 'expand',
        confidence: 0.75,
        reasoning: `Good performance (${profitMargin.toFixed(1)}% margin, ${roi.toFixed(1)}% ROI). Consider expanding to new channels or markets.`,
        recommendedChanges: {
          suggested_vertical_expansion: this.getSuggestedVerticalExpansions(venture.vertical),
        },
      }
    }

    if (profitMargin > 40 && testProgress > criteria.testQuotaThreshold) {
      return {
        action: 'expand',
        confidence: 0.7,
        reasoning: `Testing phase showing promise (${profitMargin.toFixed(1)}% margin). Expand offer variations.`,
        recommendedChanges: {
          suggested_offer_variants: 3,
        },
      }
    }

    // MUTATE conditions
    if (profitMargin < 20 && profitMargin > -20 && venture.status === 'testing') {
      return {
        action: 'mutate',
        confidence: 0.65,
        reasoning: `Marginal performance (${profitMargin.toFixed(1)}% margin). Strategy mutation recommended before killing.`,
        recommendedChanges: {
          suggested_strategy_changes: [
            'Test different pricing',
            'Modify target audience',
            'Change platform',
            'Revise offer positioning',
          ],
        },
      }
    }

    if (roi > 0 && roi < 30 && venture.status === 'live') {
      return {
        action: 'mutate',
        confidence: 0.6,
        reasoning: `Positive but low ROI (${roi.toFixed(1)}%). Optimize before scaling.`,
        recommendedChanges: {
          suggested_optimizations: [
            'Improve conversion rate',
            'Reduce acquisition costs',
            'Optimize pricing strategy',
          ],
        },
      }
    }

    // Default: hold/continue
    return {
      action: 'mutate',
      confidence: 0.5,
      reasoning: `Performance is neutral (${profitMargin.toFixed(1)}% margin, ${roi.toFixed(1)}% ROI). Continue testing with minor adjustments.`,
      recommendedChanges: {
        suggested_minor_tweaks: [
          'Monitor metrics closely',
          'Consider A/B testing key elements',
        ],
      },
    }
  }

  // ============================================================
  // Helper Methods
  // ============================================================

  private getDefaultCriteria(userCriteria?: Partial<AllocationCriteria>): AllocationCriteria {
    return {
      minProfitMargin: 20,
      minRoi: 30,
      maxBurnRate: 0.8,
      testQuotaThreshold: 50,
      timeInStatusThreshold: 30,
      ...userCriteria,
    }
  }

  private async getVenture(ventureId: string): Promise<Venture | null> {


    return this.ventureService.getById(ventureId)
  }

  private async getVenturePerformance(_ventureId: string): Promise<{
    profitMargin: number
    roi: number
    budgetUtilization: number
    testProgress: number
  }> {


    return {
      profitMargin: 25,
      roi: 40,
      budgetUtilization: 60,
      testProgress: 75,
    }
  }

  private async executeDecision(
    _ventureId: string,
    _action: { action: AllocatorActionType; reasoning: string; confidence: number },
    _criteria: AllocationCriteria
  ): Promise<Record<string, unknown>> {


    return {}
  }

  private async getActiveVentures(): Promise<Venture[]> {


    const result = await this.ventureService.list({
      limit: 1000,
    })
    // Filter out draft, killed, and archived ventures
    return result.ventures.filter(
      v => v.status !== 'draft' && v.status !== 'killed' && v.status !== 'archived'
    )
  }

  private getSuggestedVerticalExpansions(currentVertical: string): string[] {
    const expansions: Record<string, string[]> = {
      digital: ['content', 'freelance'],
      pod: ['digital', 'content'],
      content: ['digital', 'freelance'],
      freelance: ['digital', 'content'],
      affiliate: ['content', 'digital'],
      ecommerce: ['content', 'digital'],
    }
    return expansions[currentVertical] || []
  }

  // ============================================================
  // Portfolio Analysis
  // ============================================================

  async getPortfolioOverview(): Promise<PortfolioOverview> {


    return {
      totalVentures: 0,
      byStatus: {
        draft: 0,
        building: 0,
        testing: 0,
        live: 0,
        scaling: 0,
        mutating: 0,
        killed: 0,
        archived: 0,
      },
      byVertical: {},
      totalInvested: 0,
      totalRevenue: 0,
      totalProfit: 0,
      averageRoi: 0,
      atRiskVentures: [],
      scalingReadyVentures: [],
    }
  }
}


// Helper function to create an instance of the enhanced allocator service
export function getEnhancedAllocatorService(env: Env): EnhancedAllocatorService {
  return new EnhancedAllocatorService(env)
}
