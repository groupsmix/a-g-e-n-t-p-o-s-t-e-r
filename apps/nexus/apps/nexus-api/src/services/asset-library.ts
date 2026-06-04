// ============================================================
// Enhanced Asset Library Service
// ============================================================
// Advanced asset management for the portfolio. Manages AI-generated and
// manually created assets with performance tracking, reuse optimization,
// and lifecycle management.

import type { Env } from '../env'
import type { 
  AssetLibraryItem, AssetLibraryType
} from '@nexus/types/portfolio'
import { AssetLibraryService as BaseAssetLibraryService } from './portfolio'

export interface AssetGenerationConfig {
  ventureId: string
  assetType: AssetLibraryType
  prompt: string
  aiModel?: string
  tags?: string[]
  metadata?: Record<string, unknown>
}

export interface AssetOptimizationResult {
  assetId: string
  originalPerformanceScore: number
  newPerformanceScore: number
  improvementActions: string[]
}

export interface AssetSearchResult {
  assets: AssetLibraryItem[]
  total: number
  queryTime: number
}

export class EnhancedAssetLibraryService {
  private baseService: BaseAssetLibraryService

  constructor(private env: Env) {
    this.baseService = new BaseAssetLibraryService(env)
  }

  // ============================================================
  // Asset Generation Integration
  // ============================================================

  /**
   * Generate asset using AI and store in library
   */
  async generateAsset(config: AssetGenerationConfig): Promise<AssetLibraryItem> {
    // In a real implementation, this would call the AI service
    // For now, we'll create a placeholder asset
    const generatedAsset = await this.mockAssetGeneration(config)

    const asset = await this.baseService.create({
      venture_id: config.ventureId,
      asset_type: config.assetType,
      file_path: generatedAsset.filePath,
      cdn_url: generatedAsset.cdnUrl,
      prompt_used: config.prompt,
      ai_model_used: config.aiModel || 'default',
      tags: config.tags || [],
      metadata: {
        ...config.metadata,
        generated: true,
        generation_time: new Date().toISOString(),
      },
    })

    return asset
  }

  /**
   * Generate multiple asset variants for A/B testing
   */
  async generateAssetVariants(
    config: AssetGenerationConfig,
    variantCount: number = 3
  ): Promise<AssetLibraryItem[]> {
    const variants: AssetLibraryItem[] = []

    for (let i = 0; i < variantCount; i++) {
      const variantConfig = {
        ...config,
        prompt: `${config.prompt} (variant ${i + 1})`,
        metadata: {
          ...config.metadata,
          variant_index: i,
          variant_count: variantCount,
        },
      }

      const asset = await this.generateAsset(variantConfig)
      variants.push(asset)
    }

    return variants
  }

  // ============================================================
  // Asset Reuse & Optimization
  // ============================================================

  /**
   * Find best performing reusable assets for a venture
   */
  async findBestAssets(
    ventureId: string,
    assetType: AssetLibraryType,
    minPerformanceScore: number = 50
  ): Promise<AssetLibraryItem[]> {
    const reusable = await this.baseService.findReusableAssets(
      ventureId,
      assetType,
      minPerformanceScore
    )

    // Sort by performance score and usage count
    return reusable.sort((a, b) => {
      if (b.performance_score !== a.performance_score) {
        return b.performance_score - a.performance_score
      }
      return b.usage_count - a.usage_count
    })
  }

  /**
   * Suggest asset improvements based on performance data
   */
  async suggestAssetImprovements(assetId: string): Promise<AssetOptimizationResult> {
    const asset = await this.baseService.getById(assetId)
    if (!asset) {
      throw new Error(`Asset ${assetId} not found`)
    }

    const originalScore = asset.performance_score
    const improvementActions: string[] = []

    // Analyze performance and suggest improvements
    if (originalScore < 30) {
      improvementActions.push('Regenerate with different prompt')
      improvementActions.push('Consider alternative AI model')
      improvementActions.push('Review asset type suitability')
    } else if (originalScore < 50) {
      improvementActions.push('Test with different target audience')
      improvementActions.push('A/B test with variants')
      improvementActions.push('Optimize for platform requirements')
    } else if (originalScore < 70) {
      improvementActions.push('Increase usage in more offers')
      improvementActions.push('Fine-tune based on feedback')
    }

    // If usage count is low but performance is good
    if (asset.usage_count < 5 && originalScore > 50) {
      improvementActions.push('Increase asset distribution across offers')
    }

    // Calculate potential new score (optimistic estimate)
    const newPerformanceScore = Math.min(originalScore + (improvementActions.length * 10), 100)

    return {
      assetId,
      originalPerformanceScore: originalScore,
      newPerformanceScore,
      improvementActions,
    }
  }

  /**
   * Optimize asset portfolio by removing low-performing assets
   */
  async optimizeAssetPortfolio(ventureId: string): Promise<{
    removed: number
    kept: number
    improved: number
  }> {
    const allAssets = await this.baseService.list({
      venture_id: ventureId,
      limit: 1000,
    })

    let removed = 0
    let kept = 0
    let improved = 0

    for (const asset of allAssets.assets) {
      if (asset.performance_score < 20 && asset.usage_count < 3) {
        // Mark as archived (soft delete)
        await this.env.DB.prepare(`
          UPDATE asset_library 
          SET metadata = json_set(metadata, '$.archived', 'true'), updated_at = ?
          WHERE id = ?
        `).bind(new Date().toISOString(), asset.id).run()
        removed++
      } else if (asset.performance_score < 40) {
        // Try to improve
        await this.baseService.updatePerformance(asset.id, asset.performance_score + 10)
        improved++
      } else {
        kept++
      }
    }

    return { removed, kept, improved }
  }

  // ============================================================
  // Advanced Search & Discovery
  // ============================================================

  /**
   * Search assets by content similarity
   */
  async searchByContent(
    ventureId: string,
    query: string,
    assetType?: AssetLibraryType
  ): Promise<AssetSearchResult> {
    const startTime = Date.now()

    let sql = `
      SELECT * FROM asset_library 
      WHERE venture_id = ? 
      AND (prompt_used LIKE ? OR tags LIKE ? OR metadata LIKE ?)
    `
    const params: any[] = [
      ventureId,
      `%${query}%`,
      `%${query}%`,
      `%${query}%`,
    ]

    if (assetType) {
      sql += ' AND asset_type = ?'
      params.push(assetType)
    }

    sql += ' ORDER BY performance_score DESC, usage_count DESC LIMIT 50'

    const result = await this.env.DB.prepare(sql).bind(...params).all<AssetLibraryItem>()
    const queryTime = Date.now() - startTime

    return {
      assets: result.results || [],
      total: result.results?.length || 0,
      queryTime,
    }
  }

  /**
   * Find similar assets based on tags and metadata
   */
  async findSimilarAssets(assetId: string, limit: number = 10): Promise<AssetLibraryItem[]> {
    const referenceAsset = await this.baseService.getById(assetId)
    if (!referenceAsset) {
      return []
    }

    const tags = JSON.parse(referenceAsset.tags || '[]') as string[]
    if (tags.length === 0) {
      return []
    }

    // Build query to find assets with similar tags
    const tagConditions = tags.map(() => 'tags LIKE ?').join(' OR ')
    const tagParams = tags.map(t => `%"${t}"%`)

    const result = await this.env.DB.prepare(`
      SELECT * FROM asset_library 
      WHERE id != ? 
      AND (${tagConditions})
      ORDER BY performance_score DESC, usage_count DESC
      LIMIT ?
    `).bind(assetId, ...tagParams, limit).all<AssetLibraryItem>()

    return result.results || []
  }

  // ============================================================
  // Analytics & Reporting
  // ============================================================

  /**
   * Get asset performance analytics for a venture
   */
  async getAssetAnalytics(ventureId: string): Promise<{
    totalAssets: number
    averagePerformanceScore: number
    topPerformingAssetTypes: Array<{ assetType: AssetLibraryType; avgScore: number }>
    lowPerformingAssets: AssetLibraryItem[]
    mostUsedAssets: AssetLibraryItem[]
  }> {
    const allAssets = await this.baseService.list({
      venture_id: ventureId,
      limit: 1000,
    })

    const assets = allAssets.assets
    const totalAssets = assets.length

    if (totalAssets === 0) {
      return {
        totalAssets: 0,
        averagePerformanceScore: 0,
        topPerformingAssetTypes: [],
        lowPerformingAssets: [],
        mostUsedAssets: [],
      }
    }

    const averagePerformanceScore = assets.reduce((sum, asset) => sum + asset.performance_score, 0) / totalAssets

    // Group by asset type and calculate average scores
    const typeGroups = new Map<AssetLibraryType, { scores: number[] }>()
    for (const asset of assets) {
      if (!typeGroups.has(asset.asset_type)) {
        typeGroups.set(asset.asset_type, { scores: [] })
      }
      typeGroups.get(asset.asset_type)!.scores.push(asset.performance_score)
    }

    const topPerformingAssetTypes = Array.from(typeGroups.entries())
      .map(([assetType, { scores }]) => ({
        assetType,
        avgScore: scores.reduce((sum, score) => sum + score, 0) / scores.length,
      }))
      .sort((a, b) => b.avgScore - a.avgScore)
      .slice(0, 5)

    const lowPerformingAssets = assets
      .filter(asset => asset.performance_score < 30)
      .sort((a, b) => a.performance_score - b.performance_score)
      .slice(0, 10)

    const mostUsedAssets = assets
      .sort((a, b) => b.usage_count - a.usage_count)
      .slice(0, 10)

    return {
      totalAssets,
      averagePerformanceScore,
      topPerformingAssetTypes,
      lowPerformingAssets,
      mostUsedAssets,
    }
  }

  // ============================================================
  // Helper Methods
  // ============================================================

  /**
   * Mock asset generation for development/testing
   * In production, this would call the actual AI service
   */
  private async mockAssetGeneration(config: AssetGenerationConfig): Promise<{
    filePath: string
    cdnUrl: string
  }> {
    // Simulate AI generation delay
    await new Promise(resolve => setTimeout(resolve, 100))

    return {
      filePath: `/generated/${config.assetType}/${Date.now()}.temp`,
      cdnUrl: `https://cdn.example.com/generated/${Date.now()}`,
    }
  }
}