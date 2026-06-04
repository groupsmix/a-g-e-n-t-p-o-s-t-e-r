// ============================================================
// Signal Ingestion Pipeline
// ============================================================
// Ingests signals from various sources: search trends, competitor gaps, 
// marketplace data, AI radar, buyer feedback. Normalizes, scores, and 
// links them to opportunities.

import type { Env } from '../env'
import type { Signal, CreateSignalInput, SignalSourceType } from '@nexus/types/portfolio'
import { SignalService } from './portfolio'

export interface SignalSource {
  type: SignalSourceType
  sourceRef?: string
  title: string
  extractedAudience?: string
  extractedProblem?: string
  evidence: Record<string, unknown>
  demandScore?: number
  freshnessScore?: number
}

export interface IngestionResult {
  signal: Signal
  matchedOpportunity?: {
    id: string
    trendName: string
    relevanceScore: number
  }
  isNew: boolean
}

export class SignalIngestionPipeline {
  private signalService: SignalService

  constructor(private env: Env) {
    this.signalService = new SignalService(env)
  }

  // ============================================================
  // Main Ingestion Method
  // ============================================================

  async ingest(source: SignalSource): Promise<IngestionResult> {
    // Normalize the signal
    const normalized = this.normalizeSignal(source)
    
    // Check for duplicate signals
    const existing = await this.findDuplicate(normalized)
    
    if (existing) {
      // Update existing signal with new data
      await this.signalService.updateScore(
        existing.id,
        normalized.demand_score || existing.demand_score,
        normalized.freshness_score || existing.freshness_score
      )
      
      const signal = await this.signalService.getById(existing.id)
      if (!signal) {
        throw new Error('Failed to retrieve updated signal')
      }

      return {
        signal,
        isNew: false,
      }
    }

    // Create new signal
    const signal = await this.signalService.create(normalized)
    
    // Try to match to existing opportunities
    const matchedOpportunity = await this.matchToOpportunities(signal)
    
    // Update signal status if matched
    if (matchedOpportunity) {
      await this.signalService.updateStatus(signal.id, 'linked')
      signal.status = 'linked'
    }

    return {
      signal,
      matchedOpportunity,
      isNew: true,
    }
  }

  // ============================================================
  // Batch Ingestion
  // ============================================================

  async ingestBatch(sources: SignalSource[]): Promise<IngestionResult[]> {
    const results: IngestionResult[] = []
    
    for (const source of sources) {
      try {
        const result = await this.ingest(source)
        results.push(result)
      } catch (error) {
        console.error(`Failed to ingest signal: ${source.title}`, error)
        // Continue with next signal even if one fails
      }
    }
    
    return results
  }

  // ============================================================
  // Source-Specific Ingestors
  // ============================================================

  async ingestSearchTrend(data: {
    keyword: string
    trendScore: number
    searchVolume?: number
    growthRate?: number
    relatedQueries?: string[]
  }): Promise<IngestionResult> {
    const evidence = {
      keyword: data.keyword,
      trendScore: data.trendScore,
      searchVolume: data.searchVolume,
      growthRate: data.growthRate,
      relatedQueries: data.relatedQueries,
    }

    return this.ingest({
      type: 'search_trend',
      sourceRef: data.keyword,
      title: `Rising search trend: ${data.keyword}`,
      extractedProblem: `Users are searching for "${data.keyword}" - indicates unmet need`,
      evidence,
      demandScore: Math.min(data.trendScore, 100),
      freshnessScore: 100, // Search trends are always fresh
    })
  }

  async ingestCompetitorGap(data: {
    competitorName: string
    gapDescription: string
    audience: string
    opportunityScore: number
    evidenceUrl?: string
  }): Promise<IngestionResult> {
    const evidence = {
      competitorName: data.competitorName,
      gapDescription: data.gapDescription,
      evidenceUrl: data.evidenceUrl,
    }

    return this.ingest({
      type: 'competitor_gap',
      sourceRef: data.competitorName,
      title: `Competitor gap at ${data.competitorName}: ${data.gapDescription}`,
      extractedAudience: data.audience,
      extractedProblem: data.gapDescription,
      evidence,
      demandScore: Math.min(data.opportunityScore, 100),
      freshnessScore: 80,
    })
  }

  async ingestMarketplaceData(data: {
    platform: string
    category: string
    demandSignal: string
    competitionLevel: 'low' | 'medium' | 'high'
    pricePoint: number
    volume: number
  }): Promise<IngestionResult> {
    const evidence = {
      platform: data.platform,
      category: data.category,
      demandSignal: data.demandSignal,
      competitionLevel: data.competitionLevel,
      pricePoint: data.pricePoint,
      volume: data.volume,
    }

    // Calculate demand score based on volume and competition
    const competitionMultiplier = data.competitionLevel === 'low' ? 1.5 : data.competitionLevel === 'medium' ? 1.0 : 0.5
    const demandScore = Math.min((data.volume / 1000) * 10 * competitionMultiplier, 100)

    return this.ingest({
      type: 'marketplace_data',
      sourceRef: data.platform,
      title: `Marketplace demand on ${data.platform}: ${data.demandSignal}`,
      extractedProblem: data.demandSignal,
      evidence,
      demandScore,
      freshnessScore: 70,
    })
  }

  async ingestAiRadar(data: {
    detectedPattern: string
    confidence: number
    context: string
    suggestedAudience?: string
    suggestedProblem?: string
  }): Promise<IngestionResult> {
    const evidence = {
      detectedPattern: data.detectedPattern,
      confidence: data.confidence,
      context: data.context,
    }

    return this.ingest({
      type: 'ai_radar',
      title: `AI-detected pattern: ${data.detectedPattern}`,
      extractedAudience: data.suggestedAudience,
      extractedProblem: data.suggestedProblem,
      evidence,
      demandScore: data.confidence * 100,
      freshnessScore: 90,
    })
  }

  async ingestBuyerFeedback(data: {
    source: string
    feedback: string
    sentiment: 'positive' | 'negative' | 'neutral'
    requestType: string
    audience: string
  }): Promise<IngestionResult> {
    const evidence = {
      source: data.source,
      feedback: data.feedback,
      sentiment: data.sentiment,
      requestType: data.requestType,
    }

    // Higher demand score for negative feedback (indicates unmet need)
    const sentimentMultiplier = data.sentiment === 'negative' ? 1.5 : data.sentiment === 'positive' ? 0.5 : 1.0
    const demandScore = Math.min(75 * sentimentMultiplier, 100)

    return this.ingest({
      type: 'buyer_feedback',
      sourceRef: data.source,
      title: `Buyer feedback from ${data.source}: ${data.requestType}`,
      extractedAudience: data.audience,
      extractedProblem: data.feedback,
      evidence,
      demandScore,
      freshnessScore: 95,
    })
  }

  // ============================================================
  // Normalization
  // ============================================================

  private normalizeSignal(source: SignalSource): CreateSignalInput {
    return {
      source_type: source.type,
      source_ref: source.sourceRef,
      title: source.title,
      extracted_audience: source.extractedAudience,
      extracted_problem: source.extractedProblem,
      evidence_json: source.evidence,
      demand_score: source.demandScore || 0,
      freshness_score: source.freshnessScore || 50,
    }
  }

  // ============================================================
  // Duplicate Detection
  // ============================================================

  private async findDuplicate(signal: CreateSignalInput): Promise<Signal | null> {
    // Look for signals with same title and source type
    const existing = await this.env.DB.prepare(`
      SELECT * FROM signals 
      WHERE title = ? AND source_type = ? 
      ORDER BY created_at DESC 
      LIMIT 1
    `).bind(signal.title, signal.source_type).first<Signal>()

    if (existing) {
      // If signal is less than 7 days old, consider it a duplicate
      const createdAt = new Date(existing.created_at)
      const now = new Date()
      const daysDiff = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24)
      
      if (daysDiff < 7) {
        return existing
      }
    }

    return null
  }

  // ============================================================
  // Opportunity Matching
  // ============================================================

  private async matchToOpportunities(signal: Signal): Promise<{
    id: string
    trendName: string
    relevanceScore: number
  } | undefined> {
    // Simple keyword matching for now - can be enhanced with ML
    const keywords = this.extractKeywords(signal.title + ' ' + (signal.extracted_problem || ''))
    
    if (keywords.length === 0) return undefined

    // Get opportunities with matching keywords
    const query = `
      SELECT id, trend_name, target_buyer, product_idea, why_it_sells 
      FROM opportunities 
      WHERE status IN ('new', 'watchlist', 'approved')
      AND (trend_name LIKE ${keywords.map(() => '?').join(' OR trend_name LIKE ')} 
           OR target_buyer LIKE ${keywords.map(() => '?').join(' OR target_buyer LIKE ')}
           OR product_idea LIKE ${keywords.map(() => '?').join(' OR product_idea LIKE ')})
      LIMIT 5
    `

    const keywordPatterns = keywords.flatMap(k => [`%${k}%`, `%${k}%`, `%${k}%`])
    const result = await this.env.DB.prepare(query).bind(...keywordPatterns).all<{
      id: string
      trend_name: string
      target_buyer: string
      product_idea: string
      why_it_sells: string
    }>()

    if (!result.results || result.results.length === 0) return undefined

    // Calculate relevance scores
    const matches = result.results.map(opp => {
      const relevanceScore = this.calculateRelevance(signal, opp)
      return {
        id: opp.id,
        trendName: opp.trend_name,
        relevanceScore,
      }
    })

    // Return the best match if score is above threshold
    const bestMatch = matches.sort((a, b) => b.relevanceScore - a.relevanceScore)[0]
    return bestMatch.relevanceScore > 0.3 ? bestMatch : undefined
  }

  private extractKeywords(text: string): string[] {
    // Simple keyword extraction - can be enhanced with NLP
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 3)
    
    // Remove common stop words
    const stopWords = ['this', 'that', 'with', 'from', 'have', 'been', 'were', 'they', 'their', 'what', 'when', 'where', 'which', 'will', 'about']
    return words.filter(word => !stopWords.includes(word))
  }

  private calculateRelevance(signal: Signal, opportunity: {
    trend_name: string
    target_buyer: string
    product_idea: string
    why_it_sells: string
  }): number {
    const signalText = (signal.title + ' ' + (signal.extracted_problem || '')).toLowerCase()
    const oppText = (
      opportunity.trend_name + ' ' + 
      opportunity.target_buyer + ' ' + 
      opportunity.product_idea + ' ' + 
      opportunity.why_it_sells
    ).toLowerCase()

    const signalKeywords = this.extractKeywords(signalText)
    const oppKeywords = this.extractKeywords(oppText)

    // Count matching keywords
    const matches = signalKeywords.filter(k => oppKeywords.includes(k)).length
    const total = signalKeywords.length

    return total > 0 ? matches / total : 0
  }

  // ============================================================
  // Signal Scoring
  // ============================================================

  async rescoreSignal(signalId: string): Promise<Signal | null> {
    const signal = await this.signalService.getById(signalId)
    if (!signal) return null

    // Calculate freshness decay
    const createdAt = new Date(signal.created_at)
    const now = new Date()
    const daysSinceCreation = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24)
    const freshnessDecay = Math.max(0, 100 - (daysSinceCreation * 5))

    // Update with new freshness score
    return this.signalService.updateScore(signalId, signal.demand_score, freshnessDecay)
  }

  async rescoreAllSignals(): Promise<{ updated: number; failed: number }> {
    const signals = await this.signalService.list({ limit: 1000 })
    let updated = 0
    let failed = 0

    for (const signal of signals.signals) {
      try {
        await this.rescoreSignal(signal.id)
        updated++
      } catch (error) {
        failed++
      }
    }

    return { updated, failed }
  }

  // ============================================================
  // Signal Archiving
  // ============================================================

  async archiveOldSignals(daysThreshold: number = 30): Promise<{ archived: number }> {
    const thresholdDate = new Date()
    thresholdDate.setDate(thresholdDate.getDate() - daysThreshold)

    const result = await this.env.DB.prepare(`
      UPDATE signals 
      SET status = 'archived', updated_at = ?
      WHERE status IN ('raw', 'scored') 
      AND created_at < ?
    `).bind(new Date().toISOString(), thresholdDate.toISOString()).run()

    return { archived: result.meta.changes || 0 }
  }
}

// ============================================================
// Pipeline Factory
// ============================================================

export function getSignalIngestionPipeline(env: Env): SignalIngestionPipeline {
  return new SignalIngestionPipeline(env)
}