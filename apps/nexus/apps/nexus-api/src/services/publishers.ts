// ============================================================
// Real publishing adapters
// ============================================================
// Turns an approved platform/social variant into a REAL listing or post by
// calling the actual provider API. Each adapter is gated behind the
// credentials it needs: when a credential is missing it returns an honest
// `failed` outcome (it never fakes a successful publish).
//
// Credentials are read from Cloudflare Secrets Store (env.SECRETS) when
// available, otherwise from plain worker secrets / env vars (.dev.vars
// locally, `wrangler secret put` in production).

import type { Env } from '../env'

export interface ListingPayload {
  productId: string
  platformSlug: string
  platformName: string
  title: string
  description: string
  tags: string[]
  price: number | null
  currency: string
  imageUrl?: string | null
}

export interface SocialPayload {
  productId: string
  channelSlug: string
  channelName: string
  content: string
  imageUrl?: string | null
}

export interface PublishOutcome {
  status: 'success' | 'failed'
  url?: string
  error?: string
}

export async function getSecret(env: Env, key: string): Promise<string | null> {
  if (env.SECRETS) {
    try {
      const v = await env.SECRETS.get(key)
      if (v) return v
    } catch {
      /* fall through */
    }
  }
  const plain = (env as unknown as Record<string, unknown>)[key]
  if (typeof plain === 'string' && plain.length > 0) return plain
  // Keys added from the dashboard are stored in KV as secret:<KEY>.
  if (env.CONFIG) {
    try {
      const v = await env.CONFIG.get(`secret:${key}`)
      if (v) return v
    } catch {
      /* fall through */
    }
  }
  return null
}

function notConfigured(envVar: string, what: string): PublishOutcome {
  return {
    status: 'failed',
    error: `${what} not configured — set ${envVar} to publish for real.`,
  }
}

// ============================================================
// Storefront adapters
// ============================================================

async function publishToGumroad(p: ListingPayload, env: Env): Promise<PublishOutcome> {
  const token = await getSecret(env, 'GUMROAD_ACCESS_TOKEN')
  if (!token) return notConfigured('GUMROAD_ACCESS_TOKEN', 'Gumroad')

  const form = new URLSearchParams()
  form.set('access_token', token)
  form.set('name', p.title.slice(0, 100))
  // Gumroad expects price in cents.
  form.set('price', String(Math.max(0, Math.round((p.price ?? 0) * 100))))
  form.set('description', p.description.slice(0, 8000))

  const res = await fetch('https://api.gumroad.com/v2/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  })
  const data = (await res.json().catch(() => ({}))) as {
    success?: boolean
    product?: { short_url?: string }
    message?: string
  }
  if (!res.ok || !data.success) {
    return { status: 'failed', error: data.message || `Gumroad error ${res.status}` }
  }
  return { status: 'success', url: data.product?.short_url }
}

async function publishToShopify(p: ListingPayload, env: Env): Promise<PublishOutcome> {
  const shop = await getSecret(env, 'SHOPIFY_STORE') // e.g. my-store.myshopify.com
  const token = await getSecret(env, 'SHOPIFY_ADMIN_TOKEN')
  if (!shop || !token) return notConfigured('SHOPIFY_STORE + SHOPIFY_ADMIN_TOKEN', 'Shopify')

  const body = {
    product: {
      title: p.title.slice(0, 255),
      body_html: p.description,
      tags: p.tags.join(', '),
      status: 'active',
      images: p.imageUrl ? [{ src: p.imageUrl }] : undefined,
      variants: [{ price: (p.price ?? 0).toFixed(2) }],
    },
  }
  const res = await fetch(`https://${shop}/admin/api/2024-01/products.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
    body: JSON.stringify(body),
  })
  const data = (await res.json().catch(() => ({}))) as {
    product?: { handle?: string }
    errors?: unknown
  }
  if (!res.ok || !data.product) {
    return { status: 'failed', error: `Shopify error ${res.status}: ${JSON.stringify(data.errors ?? '')}` }
  }
  return { status: 'success', url: `https://${shop}/products/${data.product.handle}` }
}

// Generic webhook — lets any platform be wired through Zapier / Make / a custom
// endpoint. The full listing payload is POSTed as JSON.
async function publishToWebhook(p: ListingPayload, env: Env): Promise<PublishOutcome> {
  const url = await getSecret(env, 'PUBLISH_WEBHOOK_URL')
  if (!url) {
    return {
      status: 'failed',
      error: `No adapter for "${p.platformSlug}". Set PUBLISH_WEBHOOK_URL (Zapier/Make) to route it, or add that platform's API token.`,
    }
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'listing', ...p }),
  })
  if (!res.ok) return { status: 'failed', error: `Webhook error ${res.status}` }
  return { status: 'success', url }
}

// ============================================================
// Social posting (Ayrshare — one key fans out to IG / X / TikTok / FB / etc.)
// ============================================================

const AYRSHARE_PLATFORM: Record<string, string> = {
  instagram: 'instagram',
  'x-twitter': 'twitter',
  xtwitter: 'twitter',
  twitter: 'twitter',
  'twitter-x': 'twitter',
  facebook: 'facebook',
  linkedin: 'linkedin',
  tiktok: 'tiktok',
  pinterest: 'pinterest',
  youtube: 'youtube',
  'youtube-shorts': 'youtube',
  threads: 'threads',
  reddit: 'reddit',
  telegram: 'telegram',
}

export async function postToSocial(p: SocialPayload, env: Env): Promise<PublishOutcome> {
  const key = await getSecret(env, 'AYRSHARE_API_KEY')
  if (!key) {
    // Fall back to a generic webhook if configured.
    const url = await getSecret(env, 'PUBLISH_WEBHOOK_URL')
    if (!url) return notConfigured('AYRSHARE_API_KEY', 'Social posting')
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'social', ...p }),
    })
    if (!res.ok) return { status: 'failed', error: `Webhook error ${res.status}` }
    return { status: 'success', url }
  }

  const platform = AYRSHARE_PLATFORM[p.channelSlug]
  if (!platform) {
    return { status: 'failed', error: `Unsupported social channel "${p.channelSlug}" for Ayrshare.` }
  }

  const res = await fetch('https://app.ayrshare.com/api/post', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      post: p.content,
      platforms: [platform],
      mediaUrls: p.imageUrl ? [p.imageUrl] : undefined,
    }),
  })
  const data = (await res.json().catch(() => ({}))) as {
    status?: string
    postIds?: { postUrl?: string }[]
    errors?: { message?: string }[]
  }
  if (!res.ok || data.status === 'error') {
    return { status: 'failed', error: data.errors?.[0]?.message || `Ayrshare error ${res.status}` }
  }
  return { status: 'success', url: data.postIds?.[0]?.postUrl }
}

// ============================================================
// Dispatcher
// ============================================================

export async function publishToPlatform(p: ListingPayload, env: Env): Promise<PublishOutcome> {
  switch (p.platformSlug) {
    case 'gumroad':
    case 'gumroad-plus':
      return publishToGumroad(p, env)
    case 'shopify':
      return publishToShopify(p, env)
    default:
      // Etsy/Amazon/etc. need per-platform OAuth; route them through the
      // generic webhook until a dedicated adapter + token is configured.
      return publishToWebhook(p, env)
  }
}
