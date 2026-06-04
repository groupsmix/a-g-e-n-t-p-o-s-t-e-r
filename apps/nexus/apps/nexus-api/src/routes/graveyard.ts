import { Hono } from 'hono'
import type { Env } from '../env'

export const graveyardRoutes = new Hono<{ Bindings: Env }>()

// GET /graveyard - List products in graveyard
graveyardRoutes.get('/', async (c) => {
  try {
    const limit = parseInt(c.req.query('limit') || '50')
    const offset = parseInt(c.req.query('offset') || '0')
    
    const result = await c.env.DB.prepare(`
      SELECT p.*, d.name as domain_name, c.name as category_name
      FROM products p
      JOIN domains d ON p.domain_id = d.id
      JOIN categories c ON p.category_id = c.id
      WHERE p.graveyard_at IS NOT NULL
      ORDER BY p.graveyard_at DESC
      LIMIT ? OFFSET ?
    `).bind(limit, offset).all()
    
    return c.json({
      products: result.results,
      total: result.results.length,
    })
  } catch (err) {
    console.error('Error listing graveyard:', err)
    return c.json({ error: 'Failed to list graveyard' }, 500)
  }
})

// POST /graveyard/:productId/move - Move product to graveyard
graveyardRoutes.post('/:productId/move', async (c) => {
  try {
    const productId = c.req.param('productId')
    const { reason, resurface_at } = await c.req.json()
    const now = new Date().toISOString()
    
    const result = await c.env.DB.prepare(`
      UPDATE products SET 
        status = 'archived',
        graveyard_at = ?,
        graveyard_reason = ?,
        resurface_at = ?,
        updated_at = ?
      WHERE id = ?
    `).bind(now, reason || '', resurface_at || null, now, productId).run()
    
    if (result.meta.changes === 0) {
      return c.json({ error: 'Product not found' }, 404)
    }
    
    await c.env.CONFIG.delete(`product:${productId}`)
    
    return c.json({ message: 'Product moved to graveyard' })
  } catch (err) {
    console.error('Error moving to graveyard:', err)
    return c.json({ error: 'Failed to move to graveyard' }, 500)
  }
})

// POST /graveyard/:productId/restore - Restore product from graveyard
graveyardRoutes.post('/:productId/restore', async (c) => {
  try {
    const productId = c.req.param('productId')
    const now = new Date().toISOString()
    
    const result = await c.env.DB.prepare(`
      UPDATE products SET 
        status = 'draft',
        graveyard_at = NULL,
        graveyard_reason = NULL,
        resurface_at = NULL,
        updated_at = ?
      WHERE id = ? AND graveyard_at IS NOT NULL
    `).bind(now, productId).run()
    
    if (result.meta.changes === 0) {
      return c.json({ error: 'Product not found in graveyard' }, 404)
    }
    
    await c.env.CONFIG.delete(`product:${productId}`)
    
    return c.json({ message: 'Product restored from graveyard' })
  } catch (err) {
    console.error('Error restoring from graveyard:', err)
    return c.json({ error: 'Failed to restore from graveyard' }, 500)
  }
})

// GET /graveyard/due - List products due for re-analysis
graveyardRoutes.get('/due', async (c) => {
  try {
    const now = new Date().toISOString()
    
    const result = await c.env.DB.prepare(`
      SELECT p.*, d.name as domain_name, c.name as category_name
      FROM products p
      JOIN domains d ON p.domain_id = d.id
      JOIN categories c ON p.category_id = c.id
      WHERE p.graveyard_at IS NOT NULL 
        AND p.resurface_at IS NOT NULL 
        AND p.resurface_at <= ?
      ORDER BY p.resurface_at ASC
    `).bind(now).all()
    
    return c.json({
      products: result.results,
      total: result.results.length,
    })
  } catch (err) {
    console.error('Error listing due products:', err)
    return c.json({ error: 'Failed to list due products' }, 500)
  }
})
