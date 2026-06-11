import { Hono } from 'hono'
import type { Env } from '../env'
import { callAISimple } from '../services/shared'


interface ABTest {
  id: string
  product_id: string
  variant_a_title: string
  variant_a_description: string
  variant_b_title: string
  variant_b_description: string
  variant_a_views: number
  variant_b_views: number
  variant_a_conversions: number
  variant_b_conversions: number
  winner: string | null
  status: string
  created_at: string
}

export const abTestingRoutes = new Hono<{ Bindings: Env }>()

// POST / — create a new A/B test for a product
  .post('/', async (c) => {
  try {
    const body = await c.req.json<{ product_id: string }>()
    if (!body.product_id) return c.json({ error: 'product_id is required' }, 400)

    const product = await c.env.DB.prepare(
      `SELECT id, name, description FROM products WHERE id = ?`,
    )
      .bind(body.product_id)
      .first<{ id: string; name: string | null; description: string | null }>()

    if (!product) return c.json({ error: 'Product not found' }, 404)

    const variantATitle = product.name || 'Untitled Product'
    const variantADescription = product.description || ''

    let variantBTitle = variantATitle
    let variantBDescription = variantADescription

    try {
      const prompt = `You are helping with A/B testing for product listings. Given the original product title and description, generate an alternative variant that could perform better.

Original title: ${variantATitle}
Original description: ${variantADescription}

Respond with ONLY valid JSON (no markdown fences):
{"title": "alternative title here", "description": "alternative description here"}

Guidelines:
- Keep the same product meaning but try a different angle
- Try a different emotional hook or value proposition
- Keep similar length`

      const aiResult = await callAISimple(c.env, prompt, { taskType: 'ab-test-variant', outputFormat: 'text' })
      const parsed = JSON.parse(aiResult)
      if (parsed.title) variantBTitle = parsed.title
      if (parsed.description) variantBDescription = parsed.description
    } catch {
      variantBTitle = `${variantATitle} — Premium Edition`
      variantBDescription = variantADescription
        ? `${variantADescription}\n\nCrafted with care for discerning customers.`
        : 'A premium product designed to exceed expectations.'
    }

    const result = await c.env.DB.prepare(
      `INSERT INTO ab_tests (product_id, variant_a_title, variant_a_description, variant_b_title, variant_b_description)
       VALUES (?, ?, ?, ?, ?)
       RETURNING *`,
    )
      .bind(body.product_id, variantATitle, variantADescription, variantBTitle, variantBDescription)
      .first<ABTest>()

    return c.json(result, 201)
  } catch (err) {
    console.error('[ab-testing] Create error:', err)
    return c.json({ error: 'Failed to create A/B test' }, 500)
  }
})


// GET / — list all A/B tests
  .get('/', async (c) => {
  try {
    const status = c.req.query('status')
    let query = `SELECT t.*, p.name AS product_name FROM ab_tests t LEFT JOIN products p ON t.product_id = p.id`
    const params: string[] = []
    if (status) {
      query += ` WHERE t.status = ?`
      params.push(status)
    }
    query += ` ORDER BY t.created_at DESC`

    const stmt = params.length
      ? c.env.DB.prepare(query).bind(...params)
      : c.env.DB.prepare(query)

    const result = await stmt.all<ABTest & { product_name: string | null }>()
    return c.json({ tests: result.results ?? [] })
  } catch (err) {
    console.error('[ab-testing] List error:', err)
    return c.json({ error: 'Failed to list A/B tests' }, 500)
  }
})


// GET /:id — get test details with stats
  .get('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const test = await c.env.DB.prepare(
      `SELECT t.*, p.name AS product_name FROM ab_tests t LEFT JOIN products p ON t.product_id = p.id WHERE t.id = ?`,
    )
      .bind(id)
      .first<ABTest & { product_name: string | null }>()

    if (!test) return c.json({ error: 'A/B test not found' }, 404)

    const convRateA = test.variant_a_views > 0
      ? (test.variant_a_conversions / test.variant_a_views) * 100
      : 0
    const convRateB = test.variant_b_views > 0
      ? (test.variant_b_conversions / test.variant_b_views) * 100
      : 0

    const totalViews = test.variant_a_views + test.variant_b_views
    const confidence = totalViews >= 100 ? 'high' : totalViews >= 30 ? 'medium' : 'low'

    return c.json({
      ...test,
      stats: {
        variant_a_conversion_rate: Math.round(convRateA * 100) / 100,
        variant_b_conversion_rate: Math.round(convRateB * 100) / 100,
        total_views: totalViews,
        confidence,
      },
    })
  } catch (err) {
    console.error('[ab-testing] Detail error:', err)
    return c.json({ error: 'Failed to get A/B test details' }, 500)
  }
})


// POST /:id/record — record a view or conversion for a variant
  .post('/:id/record', async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json<{ variant: 'a' | 'b'; event: 'view' | 'conversion' }>()

    if (!body.variant || !['a', 'b'].includes(body.variant)) {
      return c.json({ error: 'variant must be "a" or "b"' }, 400)
    }
    if (!body.event || !['view', 'conversion'].includes(body.event)) {
      return c.json({ error: 'event must be "view" or "conversion"' }, 400)
    }

    const test = await c.env.DB.prepare(`SELECT id, status FROM ab_tests WHERE id = ?`)
      .bind(id)
      .first<{ id: string; status: string }>()
    if (!test) return c.json({ error: 'A/B test not found' }, 404)
    if (test.status === 'completed') return c.json({ error: 'Test is already completed' }, 400)

    const column = `variant_${body.variant}_${body.event}s`
    await c.env.DB.prepare(`UPDATE ab_tests SET ${column} = ${column} + 1 WHERE id = ?`)
      .bind(id)
      .run()

    return c.json({ ok: true })
  } catch (err) {
    console.error('[ab-testing] Record error:', err)
    return c.json({ error: 'Failed to record event' }, 500)
  }
})


// POST /:id/complete — pick winner based on conversion rate
  .post('/:id/complete', async (c) => {
  try {
    const id = c.req.param('id')
    const test = await c.env.DB.prepare(`SELECT * FROM ab_tests WHERE id = ?`)
      .bind(id)
      .first<ABTest>()

    if (!test) return c.json({ error: 'A/B test not found' }, 404)
    if (test.status === 'completed') return c.json({ error: 'Test is already completed' }, 400)

    const convRateA = test.variant_a_views > 0
      ? test.variant_a_conversions / test.variant_a_views
      : 0
    const convRateB = test.variant_b_views > 0
      ? test.variant_b_conversions / test.variant_b_views
      : 0

    let winner: string
    if (convRateA > convRateB) winner = 'a'
    else if (convRateB > convRateA) winner = 'b'
    else winner = test.variant_a_views >= test.variant_b_views ? 'a' : 'b'

    await c.env.DB.prepare(
      `UPDATE ab_tests SET status = 'completed', winner = ? WHERE id = ?`,
    )
      .bind(winner, id)
      .run()

    return c.json({
      ok: true,
      winner,
      variant_a_rate: Math.round(convRateA * 10000) / 100,
      variant_b_rate: Math.round(convRateB * 10000) / 100,
    })
  } catch (err) {
    console.error('[ab-testing] Complete error:', err)
    return c.json({ error: 'Failed to complete A/B test' }, 500)
  }
})
