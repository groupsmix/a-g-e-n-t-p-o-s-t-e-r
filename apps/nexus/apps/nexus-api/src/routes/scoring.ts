import { Hono } from 'hono'
import type { Env } from '../env'
import { scoreProduct, scoreNiche } from '../services/product-scorer'
import { checkPrePublish, checkPostBuild, checkPreBuild } from '../services/quality-gate'

export const scoringRoutes = new Hono<{ Bindings: Env }>()

// GET /products/:id/score — score an existing product
  .get('/:id/score', async (c) => {
  const productId = c.req.param('id')
  const product = await c.env.DB.prepare(
    `SELECT name, description, tags, price, deliverable_url, image_url FROM products WHERE id = ?`,
  )
    .bind(productId)
    .first<{
      name: string | null
      description: string | null
      tags: string | null
      price: number | null
      deliverable_url: string | null
      image_url: string | null
    }>()

  if (!product) return c.json({ error: 'Product not found' }, 404)

  const score = scoreProduct(product)
  const qualityGate = checkPrePublish(product)
  const postBuildGate = checkPostBuild(product)

  return c.json({ score, quality_gate: qualityGate, post_build_gate: postBuildGate })
})


// POST /niches/score — score a niche idea before building
  .post('/score', async (c) => {
  const body = await c.req.json<{ niche: string }>()
  if (!body.niche) return c.json({ error: 'niche is required' }, 400)

  const nicheScore = scoreNiche(body.niche)
  const qualityGate = checkPreBuild({ niche: body.niche })

  return c.json({ niche_score: nicheScore, quality_gate: qualityGate })
})
