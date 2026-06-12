import type { Env } from './env'
import type { WorkflowAICall } from '@posteragent/types/nexus'

// Re-export shared types
export type {
  Domain,
  Category,
  Platform,
  SocialChannel,
  Product,
  WorkflowRun,
  WorkflowStep,
  Review,
  Settings,
  TrendAlert,
  WinnerPattern,
  AIModel,
  TaskType,
  FailoverResult,
} from '@posteragent/types/nexus'

// Env type for Cloudflare bindings
export type { Env }

// Workflow input types
export interface StartWorkflowInput {
  domain_slug: string
  category_slug: string
  user_input: {
    language?: string
    niche?: string
    product_name?: string
    description?: string
    keywords?: string
    selected_platform_ids?: string[]
    post_to_social?: boolean
    selected_social_channel_ids?: string[]
    social_posting_mode?: 'auto' | 'manual'
    let_ai_price?: boolean
    let_ai_audience?: boolean
    let_ai_style?: boolean
  }
}

export interface WorkflowStatus {
  id: string
  product_id: string
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  current_step: string | null
  total_steps?: number
  steps: Array<{
    id: string
    step_name: string
    status: 'waiting' | 'running' | 'completed' | 'failed' | 'skipped'
    started_at: string | null
    completed_at: string | null
    error: string | null
    ai_model_used?: string | null
    ai_models_tried?: string | null
    tokens_used?: number | null
    cost_usd?: number | null
  }>
  error: string | null
  started_at: string | null
  completed_at: string | null
  ai_calls?: WorkflowAICall[]
}

export interface ProductFilters {
  domain_id?: string
  category_id?: string
  status?: string
  graveyard?: boolean
  limit?: number
  offset?: number
}

export interface AIWorkerRequest {
  taskType: string
  prompt: string
  outputFormat?: 'json' | 'text'
  options?: {
    temperature?: number
    maxTokens?: number
  }
}

export interface AIWorkerResponse {
  output: string
  modelUsed: string
  tokensUsed: number
  costUsd: number
  cached: boolean
  failoverCount: number
}

export interface PublishRequest {
  product_id: string
  platform_ids: string[]
  schedule_at?: string
}

export interface PublishResult {
  published: Array<{
    platform_id: string
    platform_name: string
    url: string
    status: 'success' | 'pending' | 'failed'
    error?: string
  }>
}

// KV Cache keys
export const KV_KEYS = {
  DOMAINS: 'config:domains',
  CATEGORIES: (domainId: string) => `config:categories:${domainId}`,
  PLATFORMS: 'config:platforms',
  SOCIAL_CHANNELS: 'config:social_channels',
  AI_MODELS: 'config:ai_models',
  PROMPT: (layer: string, id: string) => `prompts:${layer}:${id}`,
  MASTER_PROMPT: 'prompts:master',
  PRODUCT: (id: string) => `product:${id}`,
  WORKFLOW_RUN: (id: string) => `workflow:${id}`,
} as const
