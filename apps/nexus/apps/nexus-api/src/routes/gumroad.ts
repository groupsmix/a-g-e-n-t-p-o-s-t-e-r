import { Hono } from 'hono'
import type { Env } from '../env'
import {
  listProducts,
  createProduct,
  updateProduct,
  listSales,
  getProductAnalytics,
} from '../services/gumroad'

export const gumroadRoutes = new Hono<{ Bindings: Env }>()

// GET /gumroad/products — list all Gumroad products
  .get('/products', async (c) => {
  const result = await listProducts(c.env)
  if (!result.ok) return c.json({ error: result.error }, 502)
  return c.json({ products: result.products })
})


// POST /gumroad/products — create or update a product on Gumroad
  .post('/products', async (c) => {
  const body = await c.req.json<{
    id?: string
    name: string
    price: number
    description?: string
  }>()

  if (!body.name) return c.json({ error: 'name is required' }, 400)

  if (body.id) {
    const result = await updateProduct(c.env, body.id, body)
    if (!result.ok) return c.json({ error: result.error }, 502)
    return c.json({ product: result.product })
  }

  const result = await createProduct(c.env, body)
  if (!result.ok) return c.json({ error: result.error }, 502)
  return c.json({ product: result.product }, 201)
})


// GET /gumroad/sales — fetch all sales
  .get('/sales', async (c) => {
  const after = c.req.query('after')
  const before = c.req.query('before')
  const page = c.req.query('page')
  const result = await listSales(c.env, {
    after: after || undefined,
    before: before || undefined,
    page: page ? Number(page) : undefined,
  })
  if (!result.ok) return c.json({ error: result.error }, 502)
  return c.json({ sales: result.sales })
})


// GET /gumroad/products/:id/analytics — fetch product analytics
  .get('/products/:id/analytics', async (c) => {
  const productId = c.req.param('id')
  const result = await getProductAnalytics(c.env, productId)
  if (!result.ok) return c.json({ error: result.error }, 502)
  return c.json({ analytics: result.analytics })
})
