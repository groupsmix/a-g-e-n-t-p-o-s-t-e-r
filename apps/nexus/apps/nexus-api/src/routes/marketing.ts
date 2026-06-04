import { Hono } from 'hono'
import type { Env } from '../env'
import { postToSocial, getSecret } from '../services/publishers'
import { callAISimple, getSetting, setSetting } from '../services/shared'

// ============================================================
// Marketing team — an autonomous promotion crew. When ON, the cron picks
// live products and, for each connected channel, writes channel-specific
// promo copy (via the AI team) and posts it through Ayrshare or a
// Zapier/Make webhook. Everything it pushes is logged so the dashboard
// shows what went out and where. This is the "sells while you sleep" half
// of the loop: autopilot builds, marketing promotes.
// ============================================================

export const marketingRoutes = new Hono<{ Bindings: Env }>()

interface MarketingExecCtx { waitUntil(p: Promise<unknown>): void }

const PROMO_COOLDOWN_MS = 3 * 24 * 3600_000 // don't re-promote a product within 3 days
const MAX_CHANNELS_PER_PRODUCT = 4

async function ensureTable(env: Env): Promise<void> {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS marketing_log (
       id TEXT PRIMARY KEY, product_id TEXT, channel TEXT, content TEXT,
       status TEXT NOT NULL, note TEXT, created_at TEXT NOT NULL)`,
  ).run().catch(() => void 0)
}

async function logMarketing(
  env: Env,
  fields: { product_id?: string; channel?: string; content?: string; status: string; note?: string },
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO marketing_log (id, product_id, channel, content, status, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    crypto.randomUUID(), fields.product_id ?? null, fields.channel ?? null,
    fields.content ?? null, fields.status, fields.note ?? null, new Date().toISOString(),
  ).run().catch(() => void 0)
}

// Whether anything can actually be posted (Ayrshare key or a webhook).
async function deliveryConfigured(env: Env): Promise<boolean> {
  const ayr = await getSecret(env, 'AYRSHARE_API_KEY')
  const hook = await getSecret(env, 'PUBLISH_WEBHOOK_URL')
  return Boolean(ayr || hook)
}

// --- Status: toggle + stats + recent promotions + channels -------------
marketingRoutes.get('/status', async (c) => {
  await ensureTable(c.env)
  const enabled = (await getSetting(c.env, 'marketing_enabled')) === 'true'
  const perRun = Number((await getSetting(c.env, 'marketing_per_run')) || '2') || 2

  const postedRow = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM marketing_log WHERE status = 'posted'`,
  ).first<{ n: number }>().catch(() => ({ n: 0 }))

  const channels = await c.env.DB.prepare(
    `SELECT slug, name FROM social_channels WHERE is_active = 1 ORDER BY sort_order LIMIT 12`,
  ).all<{ slug: string; name: string }>().catch(() => ({ results: [] as { slug: string; name: string }[] }))

  const recent = await c.env.DB.prepare(
    `SELECT m.channel, m.content, m.status, m.note, m.created_at, p.name AS product_name
       FROM marketing_log m LEFT JOIN products p ON p.id = m.product_id
      ORDER BY m.created_at DESC LIMIT 25`,
  ).all().catch(() => ({ results: [] as unknown[] }))

  return c.json({
    enabled,
    per_run: perRun,
    delivery_configured: await deliveryConfigured(c.env),
    promotions_sent: postedRow?.n ?? 0,
    channels: channels.results ?? [],
    recent: recent.results ?? [],
  })
})

// --- Toggle on/off + throughput ----------------------------------------
marketingRoutes.post('/toggle', async (c) => {
  const b = await c.req.json().catch(() => ({})) as Record<string, unknown>
  if (typeof b.enabled === 'boolean') await setSetting(c.env, 'marketing_enabled', b.enabled ? 'true' : 'false')
  if (typeof b.per_run === 'number' && b.per_run >= 1 && b.per_run <= 10) {
    await setSetting(c.env, 'marketing_per_run', String(Math.floor(b.per_run)))
  }
  const enabled = (await getSetting(c.env, 'marketing_enabled')) === 'true'
  return c.json({ ok: true, enabled })
})

// --- Run one marketing cycle now (test without waiting for cron) -------
marketingRoutes.post('/run', async (c) => {
  await ensureTable(c.env)
  const sent = await runMarketing(c.env, c.executionCtx, undefined, true)
  return c.json({ ok: true, promoted: sent })
})

// ============================================================
// The crew
// ============================================================

async function callAI(env: Env, prompt: string, taskType = 'social_adaptation'): Promise<string> {
  try {
    return (await callAISimple(env, prompt, { taskType, outputFormat: 'text' })).trim()
  } catch { return '' }
}

interface PromoProduct {
  id: string
  name: string
  description: string | null
  tags: string | null
  image_url: string | null
  price: number | null
  currency: string | null
  published_url: string | null
}

// Pick live products that haven't been promoted recently.
async function pickProductsToPromote(env: Env, limit: number): Promise<PromoProduct[]> {
  const rows = await env.DB.prepare(
    `SELECT p.id, p.name, p.description, p.tags, p.image_url, p.price, p.currency,
            (SELECT pv.published_url FROM platform_variants pv
              WHERE pv.product_id = p.id AND pv.published_url IS NOT NULL LIMIT 1) AS published_url,
            (SELECT MAX(m.created_at) FROM marketing_log m
              WHERE m.product_id = p.id AND m.status = 'posted') AS last_promo
       FROM products p
      WHERE p.status IN ('approved', 'published')
      ORDER BY last_promo ASC NULLS FIRST, p.updated_at DESC
      LIMIT ?`,
  ).bind(limit * 3).all<PromoProduct & { last_promo: string | null }>().catch(() => ({ results: [] as (PromoProduct & { last_promo: string | null })[] }))

  const now = Date.now()
  const eligible = (rows.results ?? []).filter((p) => {
    const last = p.last_promo ? Date.parse(p.last_promo) : 0
    return now - last >= PROMO_COOLDOWN_MS
  })
  return eligible.slice(0, limit)
}

// Promote `count` products (defaults to the configured per_run). Returns how
// many channel posts were actually sent. When `force` we ignore the on/off
// switch (used by the manual "Run now" button).
export async function runMarketing(
  env: Env,
  _ctx?: MarketingExecCtx,
  count?: number,
  force = false,
): Promise<number> {
  await ensureTable(env)
  if (!force && (await getSetting(env, 'marketing_enabled')) !== 'true') return 0

  const perRun = count ?? (Number((await getSetting(env, 'marketing_per_run')) || '2') || 2)
  const canPost = await deliveryConfigured(env)

  const channelRows = await env.DB.prepare(
    `SELECT slug, name, caption_max_chars, hashtag_count, tone FROM social_channels
      WHERE is_active = 1 ORDER BY sort_order LIMIT ?`,
  ).bind(MAX_CHANNELS_PER_PRODUCT).all<{ slug: string; name: string; caption_max_chars: number; hashtag_count: number; tone: string }>()
    .catch(() => ({ results: [] as { slug: string; name: string; caption_max_chars: number; hashtag_count: number; tone: string }[] }))
  const channels = channelRows.results ?? []

  const products = await pickProductsToPromote(env, perRun)
  if (products.length === 0) {
    await logMarketing(env, { channel: 'system', status: 'skipped', note: 'No live products due for promotion.' })
    return 0
  }
  if (channels.length === 0) {
    await logMarketing(env, { channel: 'system', status: 'skipped', note: 'No active social channels configured.' })
    return 0
  }

  let posted = 0
  for (const product of products) {
    const link = product.published_url ? `\nLink: ${product.published_url}` : ''
    for (const ch of channels) {
      const prompt = [
        `Write ONE ready-to-post ${ch.name} promo for this digital product, the way a real person who actually uses it would post — not an ad.`,
        `Product: ${product.name}.`,
        product.description ? `What it is: ${product.description.slice(0, 600)}` : '',
        `Channel tone: ${ch.tone || 'natural, a little informal'}.`,
        `Hard limit: ${ch.caption_max_chars || 280} characters. Include up to ${ch.hashtag_count || 3} genuinely relevant hashtags (no hashtag soup).`,
        `Open with a hook in the first line, give ONE concrete benefit or example, end with a clear, low-pressure call to action.${link}`,
        `Sound human: vary sentence length, be specific. NEVER use these AI clichés: in today's, unlock, unleash, elevate, seamless, game-changer, revolutionize, dive in, supercharge, look no further, take it to the next level.`,
        `Output ONLY the post text — no quotes, no preamble, no explanation.`,
      ].filter(Boolean).join('\n')

      let copy = await callAI(env, prompt)
      if (!copy) {
        await logMarketing(env, { product_id: product.id, channel: ch.slug, status: 'failed', note: 'AI returned no copy' })
        continue
      }
      if (ch.caption_max_chars && copy.length > ch.caption_max_chars) copy = copy.slice(0, ch.caption_max_chars)

      if (!canPost) {
        // No channel connected yet — still generate + store the copy so the
        // owner can use it, and say so honestly.
        await logMarketing(env, {
          product_id: product.id, channel: ch.slug, content: copy, status: 'generated',
          note: 'Generated (connect Ayrshare or a webhook on the API keys page to auto-post).',
        })
        continue
      }

      const outcome = await postToSocial(
        { productId: product.id, channelSlug: ch.slug, channelName: ch.name, content: copy, imageUrl: product.image_url },
        env,
      )
      if (outcome.status === 'success') {
        posted++
        await logMarketing(env, { product_id: product.id, channel: ch.slug, content: copy, status: 'posted', note: outcome.url || 'Posted' })
      } else {
        await logMarketing(env, { product_id: product.id, channel: ch.slug, content: copy, status: 'failed', note: outcome.error || 'Post failed' })
      }
    }
  }
  return posted
}
