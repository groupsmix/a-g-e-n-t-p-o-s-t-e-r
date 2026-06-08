import { Hono } from 'hono'
import type { Env } from '../env'
import { checkNiche } from '../services/niche-dedup'

export const trendRoutes = new Hono<{ Bindings: Env }>()

// GET /trends - List trend alerts
trendRoutes.get('/', async (c) => {
  try {
    const includeDismissed = c.req.query('include_dismissed') === 'true'
    const limit = parseInt(c.req.query('limit') || '20')
    const offset = parseInt(c.req.query('offset') || '0')

    let query = `
      SELECT
        id,
        domain_id,
        trend_keyword AS keyword,
        trend_score AS engagement_score,
        demand_window,
        source,
        suggested_niche AS trend_type,
        status,
        detected_at,
        dismissed_at,
        workflow_id
      FROM trend_alerts
    `
    if (!includeDismissed) {
      query += " WHERE status != 'dismissed'"
    }
    query += ' ORDER BY detected_at DESC LIMIT ? OFFSET ?'

    const result = await c.env.DB.prepare(query).bind(limit, offset).all()

    return c.json(result.results)
  } catch (err) {
    console.error('Error listing trends:', err)
    return c.json({ error: 'Failed to list trends' }, 500)
  }
})

// POST /trends/:id/dismiss - Dismiss a trend
trendRoutes.post('/:id/dismiss', async (c) => {
  try {
    const id = c.req.param('id')
    
    const result = await c.env.DB.prepare(`
      UPDATE trend_alerts SET status = 'dismissed', dismissed_at = ? WHERE id = ?
    `).bind(new Date().toISOString(), id).run()
    
    if (result.meta.changes === 0) {
      return c.json({ error: 'Trend not found' }, 404)
    }
    
    return c.json({ message: 'Trend dismissed' })
  } catch (err) {
    console.error('Error dismissing trend:', err)
    return c.json({ error: 'Failed to dismiss trend' }, 500)
  }
})

// POST /trends/:id/start - Start workflow from trend
trendRoutes.post('/:id/start', async (c) => {
  try {
    const trendId = c.req.param('id')
    
    // Get trend info
    const trend = await c.env.DB.prepare('SELECT * FROM trend_alerts WHERE id = ?').bind(trendId).first() as any
    
    if (!trend) {
      return c.json({ error: 'Trend not found' }, 404)
    }

    // Niche dedup guard: a trend can land on the same keyword as a live
    // product, or be too generic ("essentials" / "bundle") to be worth
    // building. Refuse before we write the row.
    const guard = await checkNiche(c.env, trend.trend_keyword)
    if (!guard.ok) {
      return c.json({ error: 'Trend skipped', reason: guard.reason }, 409)
    }

    // Create a new product based on the trend
    const productId = crypto.randomUUID()
    const now = new Date().toISOString()
    
    // Get default domain and category (first active ones)
    const domain = await c.env.DB.prepare('SELECT id FROM domains WHERE is_active = 1 LIMIT 1').first() as any
    const category = await c.env.DB.prepare('SELECT id FROM categories WHERE is_active = 1 LIMIT 1').first() as any
    
    const userInput = {
      niche: trend.trend_keyword,
      keywords: trend.trend_keyword,
      source: 'trend',
      trend_id: trendId,
    }
    
    await c.env.DB.prepare(`
      INSERT INTO products (id, domain_id, category_id, user_input, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'draft', ?, ?)
    `).bind(
      productId,
      domain?.id || '',
      category?.id || '',
      JSON.stringify(userInput),
      now,
      now
    ).run()
    
    // Create workflow run
    const runId = crypto.randomUUID()
    await c.env.DB.prepare(`
      INSERT INTO workflow_runs (id, product_id, status, created_at)
      VALUES (?, ?, 'queued', ?)
    `).bind(runId, productId, now).run()
    
    return c.json({
      workflow_id: runId,
      product_id: productId,
      keyword: trend.trend_keyword,
    })
  } catch (err) {
    console.error('Error starting workflow from trend:', err)
    return c.json({ error: 'Failed to start workflow' }, 500)
  }
})
