// ============================================================
// NEXUS-AI Types
// ============================================================

import type { TaskType, AIRunTaskRequest, AIRunTaskResponse } from '@nexus/types'

export type { TaskType, AIRunTaskRequest, AIRunTaskResponse }

// ============================================================
// AI Registry Types
// ============================================================

export interface AIRegistryEntry {
  id: string
  name: string
  provider: AIProvider
  secretKey: string | null
  rank: number
  isFree: boolean
  why: string
  apiModelName: string
  costPer1kIn?: number
  costPer1kOut?: number
  maxOutputTokens: number
  supportsJsonMode: boolean
}

export interface SearchProviderEntry {
  id: string
  name: string
  provider: 'tavily' | 'exa' | 'serpapi' | 'dataforseo'
  secretKey: string | null
  rank: number
  isFree: boolean
  why: string
  costPerSearch?: number
}

export type AIProvider =
  | 'deepseek'
  | 'siliconflow'
  | 'groq'
  | 'fireworks'
  | 'moonshot'
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'perplexity'
  | 'mistral'
  | 'fal'
  | 'huggingface'
  | 'tavily'
  | 'exa'
  | 'serpapi'
  | 'suno'
  | 'ideogram'
  | 'printful'
  | 'printify'
  | 'local'

// ============================================================
// Failover Result
// ============================================================

export interface FailoverResult {
  output: string
  model_used: string
  models_tried: string[]
  tokens_used: number
  cost_usd?: number
  source?: 'model' | 'universal' | 'offline'
}

// ============================================================
// Failover Options
// ============================================================

export interface FailoverOptions {
  maxRetries?: number
  timeoutMs?: number
  outputFormat?: 'text' | 'json'
  excludeModelIds?: string[]
}

// ============================================================
// AI Status Cache
// ============================================================

export interface AIStatusCache {
  type: 'rate_limited' | 'quota_exceeded' | 'invalid_key' | 'error'
  reset_at: number
  hit_at: number
  message?: string
}

// ============================================================
// Secrets Store Interface
// ============================================================

export interface SecretsStore {
  get(key: string): Promise<string | null>
}
