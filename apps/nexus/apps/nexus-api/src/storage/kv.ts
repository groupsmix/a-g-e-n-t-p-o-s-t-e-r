// ============================================================
// Storage Layer: KV Namespace Helpers
// ============================================================
// Provides typed helpers for KV operations.
// Used for: config cache, prompt cache, AI status, trends, winners.

import type { KVNamespace } from '@cloudflare/workers-types'

export interface KVHelper {
  get: KVNamespace['get']
  put: KVNamespace['put']
  delete: KVNamespace['delete']
  list: KVNamespace['list']
}

// ============================================================
// KV Key Prefixes
// ============================================================

export const KV_KEYS = {
  // Config
  DOMAINS: 'config:domains',
  CATEGORIES: (domainId: string) => `config:categories:${domainId}`,
  PLATFORMS: 'config:platforms',
  SOCIAL_CHANNELS: 'config:social_channels',
  AI_MODELS: 'config:ai_models',
  SETTINGS: 'config:settings',

  // Prompts
  PROMPT_MASTER: 'prompts:master',
  PROMPT_PERSONA: (personaId: string) => `prompts:persona:${personaId}`,
  PROMPT_ROLE: (roleId: string) => `prompts:role:${roleId}`,
  PROMPT_DOMAIN: (domainId: string) => `prompts:domain:${domainId}`,
  PROMPT_CATEGORY: (categoryId: string) => `prompts:category:${categoryId}`,
  PROMPT_PLATFORM: (platformId: string) => `prompts:platform:${platformId}`,
  PROMPT_SOCIAL: (channelId: string) => `prompts:social:${channelId}`,
  PROMPT_QUALITY: (type: string) => `prompts:quality:${type}`,

  // AI Status
  AI_STATUS: (modelId: string) => `ai_status:${modelId}`,

  // Trends & Winners
  TRENDS_LATEST: 'trends:latest',
  WINNERS: (domainId: string, categoryId: string) => `winners:${domainId}:${categoryId}`,

  // Product cache
  PRODUCT: (productId: string) => `product:${productId}`,
} as const

// ============================================================
// Generic KV Operations
// ============================================================

export async function kvGet<T>(kv: KVNamespace, key: string, type: 'json' | 'text' | 'arrayBuffer' = 'json'): Promise<T | null> {
  const value = await kv.get(key, type as any)
  if (!value) return null

  if (type === 'json') {
    try {
      return JSON.parse(value as string) as T
    } catch {
      return null
    }
  }

  return value as T
}

export async function kvPut(
  kv: KVNamespace,
  key: string,
  value: unknown,
  options?: { expirationTtl?: number; expiration?: number }
): Promise<void> {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value)
  await kv.put(key, serialized, options as any)
}

export async function kvDelete(kv: KVNamespace, key: string): Promise<void> {
  await kv.delete(key)
}

export async function kvListKeys(kv: KVNamespace, prefix: string): Promise<string[]> {
  const keys: string[] = []
  let cursor: string | undefined

  do {
    const result = await kv.list({ prefix, cursor })
    keys.push(...result.keys.map((k) => k.name))
    cursor = result.list_complete ? undefined : (result as { cursor?: string }).cursor
  } while (cursor)

  return keys
}

// ============================================================
// Config Cache Operations
// ============================================================

export async function getCachedConfig<T>(kv: KVNamespace, key: string): Promise<T | null> {
  return kvGet<T>(kv, key, 'json')
}

export async function setCachedConfig<T>(kv: KVNamespace, key: string, value: T, ttlSeconds = 86400): Promise<void> {
  await kvPut(kv, key, value, { expirationTtl: ttlSeconds })
}

export async function invalidateConfig(kv: KVNamespace, key: string): Promise<void> {
  await kvDelete(kv, key)
}

// ============================================================
// Domain Config Cache
// ============================================================

export async function getCachedDomains(kv: KVNamespace) {
  return getCachedConfig<unknown[]>(kv, KV_KEYS.DOMAINS)
}

export async function setCachedDomains(kv: KVNamespace, domains: unknown[]): Promise<void> {
  await setCachedConfig(kv, KV_KEYS.DOMAINS, domains)
}

export async function getCachedCategories(kv: KVNamespace, domainId: string) {
  return getCachedConfig<unknown[]>(kv, KV_KEYS.CATEGORIES(domainId))
}

export async function setCachedCategories(kv: KVNamespace, domainId: string, categories: unknown[]): Promise<void> {
  await setCachedConfig(kv, KV_KEYS.CATEGORIES(domainId), categories)
}

// ============================================================
// Platform & Social Channel Cache
// ============================================================

export async function getCachedPlatforms(kv: KVNamespace) {
  return getCachedConfig<unknown[]>(kv, KV_KEYS.PLATFORMS)
}

export async function setCachedPlatforms(kv: KVNamespace, platforms: unknown[]): Promise<void> {
  await setCachedConfig(kv, KV_KEYS.PLATFORMS, platforms)
}

export async function getCachedSocialChannels(kv: KVNamespace) {
  return getCachedConfig<unknown[]>(kv, KV_KEYS.SOCIAL_CHANNELS)
}

export async function setCachedSocialChannels(kv: KVNamespace, channels: unknown[]): Promise<void> {
  await setCachedConfig(kv, KV_KEYS.SOCIAL_CHANNELS, channels)
}

// ============================================================
// AI Model Status Cache
// ============================================================

export interface AIStatusCache {
  type: 'rate_limited' | 'quota_exceeded' | 'invalid_key' | 'error'
  reset_at: number
  hit_at: number
  message?: string
}

export async function getAIStatus(kv: KVNamespace, modelId: string): Promise<AIStatusCache | null> {
  return getCachedConfig<AIStatusCache>(kv, KV_KEYS.AI_STATUS(modelId))
}

export async function setAIStatus(
  kv: KVNamespace,
  modelId: string,
  status: AIStatusCache,
  ttlSeconds: number
): Promise<void> {
  await kvPut(kv, KV_KEYS.AI_STATUS(modelId), status, { expirationTtl: ttlSeconds })
}

export async function clearAIStatus(kv: KVNamespace, modelId: string): Promise<void> {
  await kvDelete(kv, KV_KEYS.AI_STATUS(modelId))
}

export async function isAIRateLimited(kv: KVNamespace, modelId: string): Promise<boolean> {
  const status = await getAIStatus(kv, modelId)
  if (!status) return false
  return Date.now() < status.reset_at
}

// ============================================================
// Prompt Cache Operations
// ============================================================

export async function getCachedPrompt(kv: KVNamespace, layer: string, targetId?: string): Promise<string | null> {
  let key: string

  switch (layer) {
    case 'master':
      key = KV_KEYS.PROMPT_MASTER
      break
    case 'persona':
      key = KV_KEYS.PROMPT_PERSONA(targetId!)
      break
    case 'role':
      key = KV_KEYS.PROMPT_ROLE(targetId!)
      break
    case 'domain':
      key = KV_KEYS.PROMPT_DOMAIN(targetId!)
      break
    case 'category':
      key = KV_KEYS.PROMPT_CATEGORY(targetId!)
      break
    case 'platform':
      key = KV_KEYS.PROMPT_PLATFORM(targetId!)
      break
    case 'social':
      key = KV_KEYS.PROMPT_SOCIAL(targetId!)
      break
    case 'quality':
      key = KV_KEYS.PROMPT_QUALITY(targetId!)
      break
    default:
      return null
  }

  return kv.get(key, 'text')
}

export async function setCachedPrompt(
  kv: KVNamespace,
  layer: string,
  prompt: string,
  targetId?: string
): Promise<void> {
  let key: string

  switch (layer) {
    case 'master':
      key = KV_KEYS.PROMPT_MASTER
      break
    case 'persona':
      key = KV_KEYS.PROMPT_PERSONA(targetId!)
      break
    case 'role':
      key = KV_KEYS.PROMPT_ROLE(targetId!)
      break
    case 'domain':
      key = KV_KEYS.PROMPT_DOMAIN(targetId!)
      break
    case 'category':
      key = KV_KEYS.PROMPT_CATEGORY(targetId!)
      break
    case 'platform':
      key = KV_KEYS.PROMPT_PLATFORM(targetId!)
      break
    case 'social':
      key = KV_KEYS.PROMPT_SOCIAL(targetId!)
      break
    case 'quality':
      key = KV_KEYS.PROMPT_QUALITY(targetId!)
      break
    default:
      return
  }

  // Prompts cached for 1 hour
  await kvPut(kv, key, prompt, { expirationTtl: 3600 })
}

export async function invalidatePromptCache(kv: KVNamespace, layer: string, targetId?: string): Promise<void> {
  let key: string

  switch (layer) {
    case 'master':
      key = KV_KEYS.PROMPT_MASTER
      break
    case 'persona':
      key = KV_KEYS.PROMPT_PERSONA(targetId!)
      break
    case 'role':
      key = KV_KEYS.PROMPT_ROLE(targetId!)
      break
    case 'domain':
      key = KV_KEYS.PROMPT_DOMAIN(targetId!)
      break
    case 'category':
      key = KV_KEYS.PROMPT_CATEGORY(targetId!)
      break
    case 'platform':
      key = KV_KEYS.PROMPT_PLATFORM(targetId!)
      break
    case 'social':
      key = KV_KEYS.PROMPT_SOCIAL(targetId!)
      break
    case 'quality':
      key = KV_KEYS.PROMPT_QUALITY(targetId!)
      break
    default:
      return
  }

  await kvDelete(kv, key)
}

// ============================================================
// Trends & Winners Cache
// ============================================================

export async function getCachedTrends(kv: KVNamespace) {
  return getCachedConfig<unknown[]>(kv, KV_KEYS.TRENDS_LATEST)
}

export async function setCachedTrends(kv: KVNamespace, trends: unknown[]): Promise<void> {
  // Trends cached for ~25 hours (refreshed daily)
  await setCachedConfig(kv, KV_KEYS.TRENDS_LATEST, trends, 90000)
}

export async function getCachedWinners(kv: KVNamespace,domainId: string, categoryId: string) {
  return getCachedConfig<unknown[]>(kv, KV_KEYS.WINNERS(domainId, categoryId))
}

export async function setCachedWinners(
  kv: KVNamespace,
  domainId: string,
  categoryId: string,
  winners: unknown[]
): Promise<void> {
  await setCachedConfig(kv, KV_KEYS.WINNERS(domainId, categoryId), winners, 86400)
}

// ============================================================
// Settings Cache
// ============================================================

export async function getCachedSettings(kv: KVNamespace) {
  return getCachedConfig<Record<string, string>>(kv, KV_KEYS.SETTINGS)
}

export async function setCachedSettings(
  kv: KVNamespace,
  settings: Record<string, string>
): Promise<void> {
  await setCachedConfig(kv, KV_KEYS.SETTINGS, settings, 3600)
}
