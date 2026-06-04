import { Hono } from 'hono'
import type { Env } from '../env'

export const competitorRoutes = new Hono<{ Bindings: Env }>()

// POST / — add competitor to track
competitorRoutes.post('/', async (c) => {
  try {
    const body = await c.req.json<{
      name: string
      platform: string
      url: string
      niche?: string
    }>()

    if (!body.name || !body.platform || !body.url) {
      return c.json({ error: 'name, platform, and url are required' }, 400)
    }

    const id = crypto.randomUUID()
    const now = new Date().toISOString()

    await c.env.DB.prepare(
      `INSERT INTO tracked_competitors (id, name, platform, url, niche, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(id, body.name, body.platform, body.url, body.niche || null, now).run()

    return c.json({ id, name: body.name, platform: body.platform, url: body.url, niche: body.niche || null, created_at: now }, 201)
  } catch (err) {
    console.error('Error adding competitor:', err)
    return c.json({ error: 'Failed to add competitor' }, 500)
  }
})

// GET / — list tracked competitors
competitorRoutes.get('/', async (c) => {
  try {
    const result = await c.env.DB.prepare(
      `SELECT id, name, platform, url, niche, last_checked_at, created_at
       FROM tracked_competitors ORDER BY created_at DESC`
    ).all()

    return c.json({ competitors: result.results })
  } catch (err) {
    console.error('Error listing competitors:', err)
    return c.json({ error: 'Failed to list competitors' }, 500)
  }
})

// DELETE /:id — stop tracking
competitorRoutes.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id')

    const result = await c.env.DB.prepare(
      `DELETE FROM tracked_competitors WHERE id = ?`
    ).bind(id).run()

    if (result.meta.changes === 0) {
      return c.json({ error: 'Competitor not found' }, 404)
    }

    return c.json({ ok: true })
  } catch (err) {
    console.error('Error deleting competitor:', err)
    return c.json({ error: 'Failed to delete competitor' }, 500)
  }
})

// POST /:id/scan — scan competitor store page
competitorRoutes.post('/:id/scan', async (c) => {
  try {
    const id = c.req.param('id')

    const competitor = await c.env.DB.prepare(
      `SELECT id, name, platform, url, niche FROM tracked_competitors WHERE id = ?`
    ).bind(id).first<{ id: string; name: string; platform: string; url: string; niche: string | null }>()

    if (!competitor) {
      return c.json({ error: 'Competitor not found' }, 404)
    }

    // Use AI worker to analyze the competitor store page
    const prompt = `Analyze this ${competitor.platform} store page for competitor "${competitor.name}" (URL: ${competitor.url}).
Niche: ${competitor.niche || 'general'}.
Return a JSON object with:
- products: array of { title, price, description, url } for up to 20 products you find
- summary: a short summary of their store strategy
Only return valid JSON.`

    let products: { title: string; price?: string; description?: string; url?: string }[] = []
    let summary = ''

    try {
      const aiResp = await c.env.AI_WORKER.fetch(new Request('http://internal/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: prompt }],
          model: 'deepseek',
          max_tokens: 4000,
        }),
      }))
      const aiData = await aiResp.json() as { reply?: string }
      if (aiData.reply) {
        try {
          const parsed = JSON.parse(aiData.reply)
          products = parsed.products || []
          summary = parsed.summary || ''
        } catch {
          summary = aiData.reply
        }
      }
    } catch {
      // AI unavailable — return empty scan
    }

    // Upsert scanned products
    const now = new Date().toISOString()
    for (const p of products) {
      const pid = crypto.randomUUID()
      await c.env.DB.prepare(
        `INSERT INTO competitor_products (id, competitor_id, title, price, description, url, first_seen_at, last_seen_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET last_seen_at = ?, price = ?, description = ?`
      ).bind(pid, id, p.title, p.price || null, p.description || null, p.url || null, now, now, now, p.price || null, p.description || null).run()
    }

    // Update last_checked_at
    await c.env.DB.prepare(
      `UPDATE tracked_competitors SET last_checked_at = ? WHERE id = ?`
    ).bind(now, id).run()

    return c.json({ ok: true, products_found: products.length, summary })
  } catch (err) {
    console.error('Error scanning competitor:', err)
    return c.json({ error: 'Failed to scan competitor' }, 500)
  }
})

// GET /insights — AI-generated insights
competitorRoutes.get('/insights', async (c) => {
  try {
    // Fetch all competitors and their products
    const competitors = await c.env.DB.prepare(
      `SELECT id, name, platform, url, niche FROM tracked_competitors ORDER BY created_at DESC`
    ).all<{ id: string; name: string; platform: string; url: string; niche: string | null }>()

    const products = await c.env.DB.prepare(
      `SELECT cp.title, cp.price, cp.description, cp.url, cp.first_seen_at, tc.name as competitor_name, tc.niche
       FROM competitor_products cp
       JOIN tracked_competitors tc ON tc.id = cp.competitor_id
       ORDER BY cp.first_seen_at DESC LIMIT 100`
    ).all<{ title: string; price: string | null; description: string | null; url: string | null; first_seen_at: string; competitor_name: string; niche: string | null }>()

    if (competitors.results.length === 0) {
      return c.json({
        insights: 'No competitors tracked yet. Add competitors to get AI-generated insights.',
        trending_products: [],
        price_gaps: [],
        opportunities: [],
      })
    }

    const prompt = `You are analyzing competitor data for an e-commerce seller. Here are the tracked competitors and their products:

Competitors: ${JSON.stringify(competitors.results)}
Recent products: ${JSON.stringify(products.results)}

Provide insights as a JSON object with:
- insights: string with overall market analysis (2-3 paragraphs)
- trending_products: array of { title, reason } for trending items
- price_gaps: array of { niche, observation } showing price opportunities
- opportunities: array of { title, description } for product opportunities
Only return valid JSON.`

    let result = {
      insights: 'Add competitors and run scans to generate AI insights.',
      trending_products: [] as { title: string; reason: string }[],
      price_gaps: [] as { niche: string; observation: string }[],
      opportunities: [] as { title: string; description: string }[],
    }

    try {
      const aiResp = await c.env.AI_WORKER.fetch(new Request('http://internal/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: prompt }],
          model: 'deepseek',
          max_tokens: 4000,
        }),
      }))
      const aiData = await aiResp.json() as { reply?: string }
      if (aiData.reply) {
        try {
          result = JSON.parse(aiData.reply)
        } catch {
          result.insights = aiData.reply
        }
      }
    } catch {
      // AI unavailable
    }

    return c.json(result)
  } catch (err) {
    console.error('Error generating insights:', err)
    return c.json({ error: 'Failed to generate insights' }, 500)
  }
})
