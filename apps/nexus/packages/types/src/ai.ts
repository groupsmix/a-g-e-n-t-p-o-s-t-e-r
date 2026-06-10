// Task Types - every AI task has an exact type
export type TaskType =
  | 'research_market'          // Find trends, competitors, pricing
  | 'research_psychology'      // Analyze buyer emotion + language
  | 'research_keywords'        // SEO keyword research
  | 'research_competitors'     // Competitor listing analysis
  | 'generate_long_form'       // Articles, guides, ebooks (2000+ words)
  | 'generate_short_copy'      // Titles, descriptions, hooks (< 500 words)
  | 'generate_seo_tags'        // Constrained output: tags, meta
  | 'generate_code'            // Software development deliverables
  | 'generate_strategy'        // Business strategy, analysis
  | 'generate_image_prompt'    // Write Midjourney/FLUX prompts
  | 'generate_music_prompt'    // Write Suno/Udio prompts
  | 'generate_image'           // Create actual images
  | 'generate_music'           // Create actual audio
  | 'generate_mockup'          // Product mockup generation
  | 'platform_variation'       // Rewrite per platform rules
  | 'social_adaptation'        // Rewrite per social channel
  | 'humanize'                 // Remove AI-sounding language
  | 'quality_editor'           // Pedantic editing pass
  | 'quality_buyer_sim'        // Buyer simulation pass
  | 'quality_competitor'       // Competitor comparison pass
  | 'quality_ceo'              // Final CEO review
  | 'revenue_estimate'         // Calculate revenue projection
  | 'trend_analysis'           // Analyze trend data
  | 'pattern_extraction'       // Extract winner patterns
  | 'parse_document'           // Parse uploaded PDFs/docs
  | 'browser_agent'            // Plan and control browser automation
  | 'browse_summarize'         // Summarize web page content

// AI Model
export interface AIModel {
  id: string
  name: string
  provider: AIProvider
  apiKeySecretName: string
  taskTypes: TaskType[]
  rank: number
  status: AIModelStatus
  rateLimitResetAt: string | null
  dailyLimitResetAt: string | null
  isFreeTier: boolean
  maxTokens: number | null
  supportsStreaming: boolean
  contextWindow: number | null
  costPer1MTokens: number
  notes: string | null
  lastUsedAt: string | null
  totalCalls: number
  totalFailures: number
  updatedAt: string
}

export type AIModelStatus = 
  | 'active'
  | 'sleeping'
  | 'rate_limited'
  | 'quota_exceeded'
  | 'no_key'
  | 'error'
  | 'checking'

export type AIProvider = 
  | 'deepseek'
  | 'siliconflow'
  | 'groq'
  | 'fireworks'
  | 'moonshot'
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'fal'
  | 'huggingface'
  | 'tavily'
  | 'exa'
  | 'serpapi'
  | 'suno'
  | 'ideogram'
  | 'local'

// AI Registry Entry
export interface AIRegistryEntry {
  id: string
  name: string
  secretKey: string | null
  rank: number
  isFree: boolean
  why: string
  provider: AIProvider
  apiModelName: string
}

// Failover Result
export interface FailoverResult {
  output: string
  model_used: string
  models_tried: string[]
  tokens_used: number
  cost_usd?: number
}

// AI Task Request/Response
export interface AIRunTaskRequest {
  taskType: TaskType
  prompt: string
  outputFormat?: 'text' | 'json'
  maxRetries?: number
  timeoutMs?: number
  excludeModelIds?: string[]
}

export interface AIRunTaskResponse {
  output: string
  model_used: string
  models_tried: string[]
  tokens_used: number
  cost_usd: number
  source?: 'model' | 'universal' | 'offline'
}

// AI Model Status for Dashboard
export interface AIModelDashboardStatus {
  id: string
  name: string
  provider: string
  status: AIModelStatus
  isFreeTier: boolean
  lastUsedAt: string | null
  totalCalls: number
  successRate: number
  taskTypes: TaskType[]
}
