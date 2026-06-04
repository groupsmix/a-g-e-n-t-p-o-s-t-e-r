import { Hono } from 'hono'
import type { Env } from '../env'
import type { PublishRequest, PublishResult } from '../types'
import { publishToPlatform, postToSocial, type ListingPayload } from '../services/publishers'
import { checkPrePublish } from '../services/quality-gate'

// Build the listing payload for a variant, preferring variant-specific copy
// and falling back to the product's master content.
export async function buildListingPayload(
  env: Env,
  variant: Record<string, unknown>,
): Promise<ListingPayload> {
  const product = (await env.DB.prepare(
    `SELECT name, description, tags, price, currency, image_url FROM products WHERE id = ?`,
  )
    .bind(variant.product_id)
    .first()) as Record<string, unknown> | null

  const tagsRaw = (variant.tags as string) || (product?.tags as string) || ''
  return {
    productId: variant.product_id as string,
    platformSlug: (variant.platform_slug as string) || '',
    platformName: (variant.platform_name as string) || (variant.platform_slug as string) || '',
    title: (variant.title as string) || (product?.name as string) || 'Untitled',
    description: (variant.description as string) || (product?.description as string) || '',
    tags: tagsRaw ? tagsRaw.split(',').map((t) => t.trim()).filter(Boolean) : [],
    price: (variant.price as number) ?? (product?.price as number) ?? null,
    currency: (variant.currency as string) || (product?.currency as string) || 'USD',
    imageUrl: (product?.image_url as string) || null,
  }
}

export const publishRoutes = new Hono<{ Bindings: Env }>()

// GET /publish - List the publish queue (approved products with unpublished
// platform variants ready to go live)
publishRoutes.get('/', async (c) => {
  try {
    const result = await c.env.DB.prepare(`
      SELECT
        pv.id,
        pv.product_id,
        pv.platform_id,
        pv.title,
        pv.status,
        p.name AS product_name,
        pl.name AS platform_name
      FROM platform_variants pv
      JOIN products p ON pv.product_id = p.id
      JOIN platforms pl ON pv.platform_id = pl.id
      WHERE p.status = 'approved' AND pv.status != 'published'
      ORDER BY p.updated_at DESC
    `).all()

    return c.json({ items: result.results })
  } catch (err) {
    console.error('Error listing publish queue:', err)
    return c.json({ error: 'Failed to list publish queue' }, 500)
  }
})

// POST /publish - Publish product to platforms
publishRoutes.post('/', async (c) => {
  try {
    const body = await c.req.json<PublishRequest>()
    
    if (!body.product_id || !body.platform_ids || body.platform_ids.length === 0) {
      return c.json({ error: 'product_id and platform_ids are required' }, 400)
    }

    // Quality gate: pre-publish check
    const product = await c.env.DB.prepare(
      `SELECT name, description, tags, price, deliverable_url, image_url FROM products WHERE id = ?`,
    ).bind(body.product_id).first<{
      name: string | null
      description: string | null
      tags: string | null
      price: number | null
      deliverable_url: string | null
      image_url: string | null
    }>()
    if (product) {
      const gate = checkPrePublish(product)
      if (!gate.pass) {
        return c.json({
          error: 'Quality gate failed — product not ready to publish',
          quality_gate: gate,
        }, 422)
      }
    }
    
    const result: PublishResult = { published: [] }
    
    for (const platformId of body.platform_ids) {
      // Fetch platform variant for this product and platform
      const variant = await c.env.DB.prepare(`
        SELECT pv.*, pl.name as platform_name, pl.url as platform_url, pl.slug as platform_slug
        FROM platform_variants pv
        JOIN platforms pl ON pv.platform_id = pl.id
        WHERE pv.product_id = ? AND pv.platform_id = ?
      `).bind(body.product_id, platformId).first() as Record<string, unknown> | null
      
      if (!variant) {
        result.published.push({
          platform_id: platformId,
          platform_name: 'Unknown',
          url: '',
          status: 'failed',
          error: 'Platform variant not found',
        })
        continue
      }

      // Call the real platform API.
      const payload = await buildListingPayload(c.env, variant)
      const outcome = await publishToPlatform(payload, c.env)

      if (outcome.status !== 'success') {
        result.published.push({
          platform_id: platformId,
          platform_name: variant.platform_name as string,
          url: '',
          status: 'failed',
          error: outcome.error,
        })
        continue
      }

      const now = new Date().toISOString()
      const publishedUrl = outcome.url || `${variant.platform_url || '#'}/${variant.id}`
      await c.env.DB.prepare(`
        UPDATE platform_variants SET status = 'published', published_at = ?, published_url = ? WHERE id = ?
      `).bind(now, publishedUrl, variant.id).run()

      result.published.push({
        platform_id: platformId,
        platform_name: variant.platform_name as string,
        url: publishedUrl,
        status: 'success',
      })
    }
    
    // Check if all succeeded
    const allSuccess = result.published.every(p => p.status === 'success')
    
    if (allSuccess) {
      // Update product status to published
      await c.env.DB.prepare(`
        UPDATE products SET status = 'published', updated_at = ? WHERE id = ?
      `).bind(new Date().toISOString(), body.product_id).run()
    }
    
    return c.json(result)
  } catch (err) {
    console.error('Error publishing:', err)
    return c.json({ error: 'Failed to publish' }, 500)
  }
})

// POST /publish/schedule - Schedule publishing for later
publishRoutes.post('/schedule', async (c) => {
  try {
    const body = await c.req.json<PublishRequest & { schedule_at: string }>()
    
    if (!body.product_id || !body.platform_ids || !body.schedule_at) {
      return c.json({ error: 'product_id, platform_ids, and schedule_at are required' }, 400)
    }
    
    const scheduleTime = new Date(body.schedule_at)
    if (isNaN(scheduleTime.getTime())) {
      return c.json({ error: 'Invalid schedule_at date' }, 400)
    }
    
    // Store scheduled publish in KV for later processing
    const scheduleKey = `scheduled:publish:${body.product_id}:${Date.now()}`
    const scheduleData = JSON.stringify({
      product_id: body.product_id,
      platform_ids: body.platform_ids,
      schedule_at: body.schedule_at,
      created_at: new Date().toISOString(),
    })
    
    await c.env.CONFIG.put(scheduleKey, scheduleData, { expirationTtl: 86400 * 30 }) // 30 days TTL
    
    return c.json({
      message: 'Publishing scheduled',
      schedule_at: body.schedule_at,
      schedule_key: scheduleKey,
    })
  } catch (err) {
    console.error('Error scheduling publish:', err)
    return c.json({ error: 'Failed to schedule publishing' }, 500)
  }
})

// POST /publish/:id - Publish a single platform variant (by variant id)
publishRoutes.post('/:id', async (c) => {
  try {
    const id = c.req.param('id')

    const variant = await c.env.DB.prepare(`
      SELECT pv.*, pl.url as platform_url, pl.slug as platform_slug, pl.name as platform_name
      FROM platform_variants pv
      JOIN platforms pl ON pv.platform_id = pl.id
      WHERE pv.id = ?
    `).bind(id).first() as any

    if (!variant) {
      return c.json({ error: 'Variant not found' }, 404)
    }

    const now = new Date().toISOString()

    // Call the real platform API. On failure we surface the error and do NOT
    // mark the variant as published.
    const payload = await buildListingPayload(c.env, variant)
    const outcome = await publishToPlatform(payload, c.env)

    if (outcome.status !== 'success') {
      return c.json({ id, status: 'failed', error: outcome.error }, 422)
    }

    const publishedUrl = outcome.url || `${variant.platform_url || '#'}/${variant.id}`
    await c.env.DB.prepare(`
      UPDATE platform_variants SET status = 'published', published_at = ?, published_url = ? WHERE id = ?
    `).bind(now, publishedUrl, id).run()

    // If every variant for this product is now published, mark the product published.
    const remaining = await c.env.DB.prepare(`
      SELECT COUNT(*) as n FROM platform_variants WHERE product_id = ? AND status != 'published'
    `).bind(variant.product_id).first<{ n: number }>()

    if (remaining && remaining.n === 0) {
      await c.env.DB.prepare(`
        UPDATE products SET status = 'published', updated_at = ? WHERE id = ?
      `).bind(now, variant.product_id).run()
    }

    return c.json({ id, status: 'published', published_url: publishedUrl })
  } catch (err) {
    console.error('Error publishing variant:', err)
    return c.json({ error: 'Failed to publish variant' }, 500)
  }
})

// GET /publish/:productId - Get publish status for all platforms
publishRoutes.get('/:productId', async (c) => {
  try {
    const productId = c.req.param('productId')
    
    const variants = await c.env.DB.prepare(`
      SELECT pv.id, pv.platform_id, pl.name as platform_name, 
             pv.status, pv.published_at, pv.published_url
      FROM platform_variants pv
      JOIN platforms pl ON pv.platform_id = pl.id
      WHERE pv.product_id = ?
    `).bind(productId).all()
    
    return c.json({
      product_id: productId,
      platforms: variants.results.map((v: any) => ({
        platform_id: v.platform_id,
        platform_name: v.platform_name,
        status: v.status,
        published_at: v.published_at,
        published_url: v.published_url,
      })),
    })
  } catch (err) {
    console.error('Error fetching publish status:', err)
    return c.json({ error: 'Failed to fetch publish status' }, 500)
  }
})

// POST /publish/social/:id - Post a single social variant to its channel for real
publishRoutes.post('/social/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const variant = await c.env.DB.prepare(`
      SELECT sv.*, sc.slug as channel_slug, sc.name as channel_name
      FROM social_variants sv
      JOIN social_channels sc ON sv.channel_id = sc.id
      WHERE sv.id = ?
    `).bind(id).first() as any

    if (!variant) return c.json({ error: 'Social variant not found' }, 404)

    const product = await c.env.DB.prepare(
      `SELECT image_url FROM products WHERE id = ?`,
    ).bind(variant.product_id).first() as { image_url?: string } | null

    const outcome = await postToSocial(
      {
        productId: variant.product_id,
        channelSlug: variant.channel_slug,
        channelName: variant.channel_name,
        content: variant.content,
        imageUrl: product?.image_url || null,
      },
      c.env,
    )

    if (outcome.status !== 'success') {
      return c.json({ id, status: 'failed', error: outcome.error }, 422)
    }

    const now = new Date().toISOString()
    await c.env.DB.prepare(
      `UPDATE social_variants SET status = 'published', published_at = ? WHERE id = ?`,
    ).bind(now, id).run()

    return c.json({ id, status: 'published', url: outcome.url })
  } catch (err) {
    console.error('Error posting social variant:', err)
    return c.json({ error: 'Failed to post social variant' }, 500)
  }
})
