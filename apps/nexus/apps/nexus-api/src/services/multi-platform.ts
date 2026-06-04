import type { Env } from '../env'
import {
  executeBrowserActions,
  listOnEtsy,
  listOnCreativeMarket,
  listOnPayhip,
  checkGumroadSales,
  type MultiStepFlow,
  type ExecutionResult,
} from './browser-actions'

// ---------------------------------------------------------------------------
// Platform configuration
// ---------------------------------------------------------------------------

export interface PlatformConfig {
  name: string
  baseUrl: string
  listingFlow: (product: Record<string, string>) => MultiStepFlow
  requiresAuth: boolean
  method: 'browser' | 'api'
}

export interface PlatformStatus {
  name: string
  method: 'browser' | 'api'
  configured: boolean
  requiresAuth: boolean
  baseUrl: string
}

export interface ListingResult {
  platform: string
  ok: boolean
  execution?: ExecutionResult
  error?: string
  listingId?: string
}

const PLATFORMS: Record<string, PlatformConfig> = {
  gumroad: {
    name: 'Gumroad',
    baseUrl: 'https://app.gumroad.com',
    listingFlow: () => checkGumroadSales(),
    requiresAuth: true,
    method: 'api',
  },
  etsy: {
    name: 'Etsy',
    baseUrl: 'https://www.etsy.com',
    listingFlow: listOnEtsy,
    requiresAuth: true,
    method: 'browser',
  },
  creative_market: {
    name: 'Creative Market',
    baseUrl: 'https://creativemarket.com',
    listingFlow: listOnCreativeMarket,
    requiresAuth: true,
    method: 'browser',
  },
  payhip: {
    name: 'Payhip',
    baseUrl: 'https://payhip.com',
    listingFlow: listOnPayhip,
    requiresAuth: true,
    method: 'browser',
  },
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getSupportedPlatforms(): Record<string, PlatformConfig> {
  return PLATFORMS
}

export async function getPlatformStatus(env: Env): Promise<PlatformStatus[]> {
  const hasBrowser = !!env.BROWSER
  const hasGumroad = !!(await env.SECRETS.get('gumroad_access_token').catch(() => null))

  return Object.entries(PLATFORMS).map(([key, cfg]) => ({
    name: cfg.name,
    method: cfg.method,
    configured: key === 'gumroad' ? hasGumroad : hasBrowser,
    requiresAuth: cfg.requiresAuth,
    baseUrl: cfg.baseUrl,
  }))
}

export async function listOnPlatform(
  env: Env,
  product: Record<string, string>,
  platformKey: string,
): Promise<ListingResult> {
  const cfg = PLATFORMS[platformKey]
  if (!cfg) {
    return { platform: platformKey, ok: false, error: `Unknown platform: ${platformKey}` }
  }

  const listingId = crypto.randomUUID()

  // Record the attempt in D1
  await env.DB.prepare(
    `INSERT INTO platform_listings (id, product_id, platform, status, created_at)
     VALUES (?, ?, ?, 'pending', datetime('now'))`,
  )
    .bind(listingId, product.id ?? '', platformKey)
    .run()
    .catch(() => void 0)

  try {
    const flow = cfg.listingFlow(product)
    const execution = await executeBrowserActions(env, flow.steps, {
      ...flow.variables,
      ...product,
    })

    const status = execution.ok ? 'listed' : 'error'
    const errorMsg = execution.ok ? null : (execution.error ?? 'Flow execution failed')

    await env.DB.prepare(
      `UPDATE platform_listings SET status = ?, listed_at = datetime('now'), error = ? WHERE id = ?`,
    )
      .bind(status, errorMsg, listingId)
      .run()
      .catch(() => void 0)

    return { platform: platformKey, ok: execution.ok, execution, listingId, error: errorMsg ?? undefined }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'listing_failed'
    await env.DB.prepare(
      `UPDATE platform_listings SET status = 'error', error = ? WHERE id = ?`,
    )
      .bind(msg, listingId)
      .run()
      .catch(() => void 0)

    return { platform: platformKey, ok: false, error: msg, listingId }
  }
}

export async function listOnAllPlatforms(
  env: Env,
  product: Record<string, string>,
  platformKeys: string[],
): Promise<ListingResult[]> {
  const results: ListingResult[] = []
  for (const key of platformKeys) {
    results.push(await listOnPlatform(env, product, key))
  }
  return results
}
