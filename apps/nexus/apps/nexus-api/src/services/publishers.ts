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
import { flagsToIssues, screenFields } from './brand-safety'

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



export async function postToSocial(p: SocialPayload, env: Env): Promise<PublishOutcome> {
  // Audit #45: last-line brand-safety gate. The quality gate screens
  // earlier, but content can also reach here via direct API routes —
  // nothing leaves the system without passing this check.
  const safety = screenFields({ content: p.content })
  if (!safety.pass) {
    return {
      status: 'failed',
      error: `Blocked by brand-safety gate: ${flagsToIssues(safety).join('; ')}`,
    }
  }

  // Map the channelSlug to agent-publisher platform identifiers
  const slug = p.channelSlug.toLowerCase();
  let resolvedPlatform: 'x' | 'linkedin' | 'instagram' | 'tiktok' | 'youtube' | 'newsletter' | 'blog' | null = null;
  
  if (slug === 'x' || slug === 'twitter' || slug === 'x-twitter' || slug === 'xtwitter' || slug === 'twitter-x') {
    resolvedPlatform = 'x';
  } else if (slug === 'linkedin') {
    resolvedPlatform = 'linkedin';
  } else if (slug.startsWith('instagram')) {
    resolvedPlatform = 'instagram';
  } else if (slug === 'tiktok') {
    resolvedPlatform = 'tiktok';
  } else if (slug.startsWith('youtube')) {
    resolvedPlatform = 'youtube';
  } else if (slug === 'newsletter' || slug === 'email') {
    resolvedPlatform = 'newsletter';
  } else if (slug === 'blog' || slug === 'cosmic') {
    resolvedPlatform = 'blog';
  }

  // If no direct platform match, fall back to webhook
  if (!resolvedPlatform) {
    const url = await getSecret(env, 'PUBLISH_WEBHOOK_URL')
    if (!url) {
      return {
        status: 'failed',
        error: `No publisher configured for social channel "${p.channelSlug}" and no PUBLISH_WEBHOOK_URL was set.`,
      }
    }
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'social', ...p }),
    })
    if (!res.ok) return { status: 'failed', error: `Webhook error ${res.status}` }
    return { status: 'success', url }
  }

  let adapter: any = null;

  if (resolvedPlatform === 'x') {
    const xToken = await getSecret(env, 'X_BEARER_TOKEN')
    if (!xToken) return notConfigured('X_BEARER_TOKEN', 'X/Twitter')
    const { createXAdapter } = await import('@posteragent/agent-publisher/adapters')
    adapter = createXAdapter({ bearerToken: xToken })
  } else if (resolvedPlatform === 'linkedin') {
    const liToken = await getSecret(env, 'LINKEDIN_ACCESS_TOKEN')
    if (!liToken) return notConfigured('LINKEDIN_ACCESS_TOKEN', 'LinkedIn')
    const { createLinkedInAdapter } = await import('@posteragent/agent-publisher/adapters')
    adapter = createLinkedInAdapter({ accessToken: liToken })
  } else if (resolvedPlatform === 'instagram') {
    const igToken = await getSecret(env, 'INSTAGRAM_ACCESS_TOKEN')
    if (!igToken) return notConfigured('INSTAGRAM_ACCESS_TOKEN', 'Instagram')
    const { createInstagramAdapter } = await import('@posteragent/agent-publisher/adapters')
    adapter = createInstagramAdapter({ accessToken: igToken })
  } else if (resolvedPlatform === 'tiktok') {
    const ttToken = await getSecret(env, 'TIKTOK_ACCESS_TOKEN')
    if (!ttToken) return notConfigured('TIKTOK_ACCESS_TOKEN', 'TikTok')
    const { createTikTokAdapter } = await import('@posteragent/agent-publisher/adapters')
    adapter = createTikTokAdapter({ accessToken: ttToken })
  } else if (resolvedPlatform === 'youtube') {
    const ytToken = await getSecret(env, 'YOUTUBE_ACCESS_TOKEN')
    if (!ytToken) return notConfigured('YOUTUBE_ACCESS_TOKEN', 'YouTube')
    const { createYouTubeAdapter } = await import('@posteragent/agent-publisher/adapters')
    adapter = createYouTubeAdapter({ accessToken: ytToken })
  } else if (resolvedPlatform === 'newsletter') {
    const nsToken = await getSecret(env, 'NEWSLETTER_API_KEY')
    const nsBaseUrl = await getSecret(env, 'NEWSLETTER_BASE_URL')
    if (!nsToken) return notConfigured('NEWSLETTER_API_KEY', 'Newsletter')
    const { createNewsletterAdapter } = await import('@posteragent/agent-publisher/adapters')
    adapter = createNewsletterAdapter({ apiKey: nsToken, baseUrl: nsBaseUrl ?? 'https://api.emailoctopus.com/v3' })
  } else if (resolvedPlatform === 'blog') {
    const slugVal = await getSecret(env, 'COSMIC_BUCKET_SLUG')
    const readKey = await getSecret(env, 'COSMIC_READ_KEY')
    const writeKey = await getSecret(env, 'COSMIC_WRITE_KEY')
    if (!slugVal || !readKey || !writeKey) return notConfigured('COSMIC_BUCKET_SLUG + read/write keys', 'CosmicJS Blog')
    const { createBlogAdapter } = await import('@posteragent/agent-publisher/adapters')
    adapter = createBlogAdapter({ bucketSlug: slugVal, readKey, writeKey })
  }

  if (!adapter) {
    return { status: 'failed', error: `Failed to construct adapter for platform: ${resolvedPlatform}` }
  }

  const authorUrnVal = resolvedPlatform === 'linkedin' ? (await getSecret(env, 'LINKEDIN_AUTHOR_URN')) : null;

  try {
    const result = await adapter.publish({
      platform: resolvedPlatform,
      title: p.channelName || p.channelSlug,
      parts: [p.content],
      media: p.imageUrl ? { type: 'image', url: p.imageUrl } : undefined,
      meta: resolvedPlatform === 'linkedin' ? { authorUrn: authorUrnVal || undefined } : undefined,
    })

    if (result.ok) {
      return { status: 'success', url: result.url }
    } else {
      return { status: 'failed', error: result.error }
    }
  } catch (err) {
    return { status: 'failed', error: err instanceof Error ? err.message : String(err) }
  }
}

// ============================================================
// Dispatcher
// ============================================================

export async function publishToPlatform(p: ListingPayload, env: Env): Promise<PublishOutcome> {
  // Audit #45: last-line brand-safety gate (see postToSocial).
  const safety = screenFields({ title: p.title, description: p.description, tags: p.tags })
  if (!safety.pass) {
    return {
      status: 'failed',
      error: `Blocked by brand-safety gate: ${flagsToIssues(safety).join('; ')}`,
    }
  }

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
