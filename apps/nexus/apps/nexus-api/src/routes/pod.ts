import { Hono } from 'hono'
import type { Env } from '../env'
import {
  listShops,
  listBlueprints,
  createProduct as printifyCreateProduct,
  publishProduct as printifyPublishProduct,
  generatePODDesign,
} from '../services/pod'

export const podRoutes = new Hono<{ Bindings: Env }>()

// GET /api/pod/shops — list connected Printify shops
podRoutes.get('/shops', async (c) => {
  const result = await listShops(c.env)
  if (!result.ok) return c.json({ error: result.error }, 502)
  return c.json({ shops: result.shops })
})

// GET /api/pod/blueprints — list available product types
podRoutes.get('/blueprints', async (c) => {
  const result = await listBlueprints(c.env)
  if (!result.ok) return c.json({ error: result.error }, 502)

  // Filter to the supported POD product types
  const supportedTypes = ['t-shirt', 'mug', 'poster', 'hoodie', 'tote bag']
  const filtered = (result.blueprints ?? []).filter((bp) =>
    supportedTypes.some((t) => bp.title.toLowerCase().includes(t)),
  )

  return c.json({ blueprints: filtered, total: filtered.length })
})

// GET /api/pod/products — list POD products created in our DB
podRoutes.get('/products', async (c) => {
  const status = c.req.query('status')
  let query = 'SELECT * FROM pod_products ORDER BY created_at DESC LIMIT 100'
  const params: string[] = []

  if (status) {
    query = 'SELECT * FROM pod_products WHERE status = ? ORDER BY created_at DESC LIMIT 100'
    params.push(status)
  }

  try {
    const stmt = params.length
      ? c.env.DB.prepare(query).bind(...params)
      : c.env.DB.prepare(query)
    const { results } = await stmt.all()
    return c.json({ products: results ?? [] })
  } catch (err) {
    console.error('POD products list error:', err)
    return c.json({ products: [], error: 'Failed to list products' })
  }
})

// POST /api/pod/products — create a new POD product
podRoutes.post('/products', async (c) => {
  const body = await c.req.json<{
    niche: string
    productType: string
    title?: string
    description?: string
    shopId?: string
    blueprintId?: number
  }>()

  if (!body.niche || !body.productType) {
    return c.json({ error: 'niche and productType are required' }, 400)
  }

  const design = generatePODDesign(body.niche, body.productType)

  const id = crypto.randomUUID()
  const title = body.title || design.elements.title
  const description =
    body.description || `${design.elements.tagline} — ${body.productType} design for ${body.niche} lovers.`

  // If a shopId + blueprintId are provided, also create on Printify
  let printifyProductId: string | null = null
  let printifyUrl: string | null = null

  if (body.shopId && body.blueprintId) {
    const result = await printifyCreateProduct(
      c.env,
      body.shopId,
      { id: body.blueprintId, title: body.productType },
      { title, description, tags: [body.niche, body.productType, 'pod', 'nexus'] },
    )
    if (result.ok && result.product) {
      printifyProductId = result.product.id
    }
  }

  try {
    await c.env.DB.prepare(
      `INSERT INTO pod_products
        (id, printify_product_id, shop_id, blueprint_id, title, description,
         niche, product_type, design_prompt, design_url, status, printify_url, price_cents)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, 0)`,
    )
      .bind(
        id,
        printifyProductId,
        body.shopId ?? null,
        body.blueprintId ?? null,
        title,
        description,
        body.niche,
        body.productType,
        design.prompt,
        null, // design_url — will be populated when image generation is available
        printifyUrl,
      )
      .run()
  } catch (err) {
    console.error('POD product insert error:', err)
    return c.json({ error: 'Failed to save product' }, 500)
  }

  return c.json({
    id,
    title,
    description,
    design,
    printify_product_id: printifyProductId,
    status: 'draft',
  })
})

// POST /api/pod/products/:id/publish — publish a POD product
podRoutes.post('/products/:id/publish', async (c) => {
  const id = c.req.param('id')

  let product: Record<string, unknown> | undefined
  try {
    const { results } = await c.env.DB.prepare(
      'SELECT * FROM pod_products WHERE id = ?',
    )
      .bind(id)
      .all()
    product = (results ?? [])[0] as Record<string, unknown> | undefined
  } catch {
    return c.json({ error: 'Database error' }, 500)
  }

  if (!product) return c.json({ error: 'Product not found' }, 404)
  if (product.status === 'published') return c.json({ error: 'Already published' }, 409)

  // If we have a Printify product, publish it there
  if (product.shop_id && product.printify_product_id) {
    const result = await printifyPublishProduct(
      c.env,
      product.shop_id as string,
      product.printify_product_id as string,
    )
    if (!result.ok) {
      return c.json({ error: result.error || 'Failed to publish on Printify' }, 502)
    }
  }

  try {
    await c.env.DB.prepare(
      "UPDATE pod_products SET status = 'published', published_at = datetime('now') WHERE id = ?",
    )
      .bind(id)
      .run()
  } catch {
    return c.json({ error: 'Failed to update status' }, 500)
  }

  return c.json({ ok: true, id, status: 'published' })
})

// GET /api/pod/stats — POD stats
podRoutes.get('/stats', async (c) => {
  try {
    const [totalRow, publishedRow, revenueRow] = await Promise.all([
      c.env.DB.prepare('SELECT COUNT(*) as count FROM pod_products').first<{ count: number }>(),
      c.env.DB.prepare("SELECT COUNT(*) as count FROM pod_products WHERE status = 'published'").first<{ count: number }>(),
      c.env.DB.prepare('SELECT COALESCE(SUM(price_cents), 0) as total FROM pod_products').first<{ total: number }>(),
    ])

    return c.json({
      total_products: totalRow?.count ?? 0,
      published: publishedRow?.count ?? 0,
      revenue_estimate_cents: revenueRow?.total ?? 0,
      revenue_estimate_usd: Math.round((revenueRow?.total ?? 0)) / 100,
    })
  } catch (err) {
    console.error('POD stats error:', err)
    return c.json({
      total_products: 0,
      published: 0,
      revenue_estimate_cents: 0,
      revenue_estimate_usd: 0,
    })
  }
})
