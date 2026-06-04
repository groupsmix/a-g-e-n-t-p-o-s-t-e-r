import { Hono } from 'hono'
import type { Env } from '../env'
import { publishProductToGumroad } from '../services/gumroad-publisher'

export const reviewRoutes = new Hono<{ Bindings: Env }>()

// POST /review/:productId/approve - Approve product for publishing
reviewRoutes.post('/:productId/approve', async (c) => {
  try {
    const productId = c.req.param('productId')
    const now = new Date().toISOString()
    
    // Update product status to approved
    const result = await c.env.DB.prepare(`
      UPDATE products SET status = 'approved', updated_at = ? WHERE id = ?
    `).bind(now, productId).run()
    
    if (result.meta.changes === 0) {
      return c.json({ error: 'Product not found' }, 404)
    }
    
    // Create approval review record
    const reviewId = crypto.randomUUID()
    await c.env.DB.prepare(`
      INSERT INTO reviews (id, product_id, decision, ai_score, feedback, reviewed_at)
      VALUES (?, ?, 'approved', 10, 'Approved for publishing', ?)
    `).bind(reviewId, productId, now).run()
    
    // Invalidate cache
    await c.env.CONFIG.delete(`product:${productId}`)

    // Auto-publish to Gumroad if the setting is enabled
    let gumroad: { gumroad_product_id?: string; gumroad_url?: string } | undefined
    try {
      const autoGumroad = await c.env.DB.prepare(
        `SELECT value FROM settings WHERE key = 'auto_publish_gumroad'`,
      ).first<{ value: string }>()
      if (autoGumroad && autoGumroad.value === 'true') {
        const gr = await publishProductToGumroad(c.env, productId)
        if (gr.ok) {
          gumroad = {
            gumroad_product_id: gr.gumroad_product_id,
            gumroad_url: gr.gumroad_url,
          }
        } else {
          console.error('Gumroad auto-publish failed:', gr.error)
        }
      }
    } catch (gpErr) {
      console.error('Gumroad auto-publish error:', gpErr)
    }

    return c.json({ message: 'Product approved', product_id: productId, gumroad })
  } catch (err) {
    console.error('Error approving product:', err)
    return c.json({ error: 'Failed to approve product' }, 500)
  }
})

// POST /review/:productId/reject - Reject product with feedback
reviewRoutes.post('/:productId/reject', async (c) => {
  try {
    const productId = c.req.param('productId')
    const { feedback, reason } = await c.req.json()
    const now = new Date().toISOString()
    
    if (!feedback) {
      return c.json({ error: 'Feedback is required' }, 400)
    }
    
    // Update product status to rejected and move it to the graveyard so it
    // remains visible (and restorable) instead of silently disappearing.
    const result = await c.env.DB.prepare(`
      UPDATE products
      SET status = 'rejected', graveyard_at = ?, graveyard_reason = ?, updated_at = ?
      WHERE id = ?
    `).bind(now, feedback, now, productId).run()
    
    if (result.meta.changes === 0) {
      return c.json({ error: 'Product not found' }, 404)
    }
    
    // Create rejection review record
    const reviewId = crypto.randomUUID()
    await c.env.DB.prepare(`
      INSERT INTO reviews (id, product_id, decision, ai_score, feedback, reviewed_at)
      VALUES (?, ?, 'rejected', 0, ?, ?)
    `).bind(reviewId, productId, feedback, now).run()
    
    // Invalidate cache
    await c.env.CONFIG.delete(`product:${productId}`)
    
    return c.json({ message: 'Product rejected', product_id: productId, reason })
  } catch (err) {
    console.error('Error rejecting product:', err)
    return c.json({ error: 'Failed to reject product' }, 500)
  }
})

// POST /review/:productId/revise - Request revision
reviewRoutes.post('/:productId/revise', async (c) => {
  try {
    const productId = c.req.param('productId')
    const { sections } = await c.req.json()
    const now = new Date().toISOString()
    
    if (!sections || !Array.isArray(sections)) {
      return c.json({ error: 'sections array is required' }, 400)
    }
    
    // Update product status to in_revision
    const result = await c.env.DB.prepare(`
      UPDATE products SET status = 'in_revision', updated_at = ? WHERE id = ?
    `).bind(now, productId).run()
    
    if (result.meta.changes === 0) {
      return c.json({ error: 'Product not found' }, 404)
    }
    
    // Create revision review record
    const reviewId = crypto.randomUUID()
    const revisionData = JSON.stringify({ sections })
    
    await c.env.DB.prepare(`
      INSERT INTO reviews (id, product_id, decision, ai_score, revised_sections, reviewed_at)
      VALUES (?, ?, 'revision', 5, ?, ?)
    `).bind(reviewId, productId, revisionData, now).run()
    
    // Invalidate cache
    await c.env.CONFIG.delete(`product:${productId}`)
    
    return c.json({ message: 'Revision requested', product_id: productId, sections })
  } catch (err) {
    console.error('Error requesting revision:', err)
    return c.json({ error: 'Failed to request revision' }, 500)
  }
})

// GET /review/:productId - Get all reviews for a product
reviewRoutes.get('/:productId', async (c) => {
  try {
    const productId = c.req.param('productId')
    
    const reviews = await c.env.DB.prepare(`
      SELECT id, decision, ai_score, section_scores, feedback, revised_sections, reviewed_at
      FROM reviews WHERE product_id = ? ORDER BY reviewed_at DESC
    `).bind(productId).all()
    
    return c.json({ reviews: reviews.results })
  } catch (err) {
    console.error('Error fetching reviews:', err)
    return c.json({ error: 'Failed to fetch reviews' }, 500)
  }
})
