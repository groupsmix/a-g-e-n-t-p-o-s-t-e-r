import { Hono } from 'hono'
import type { Env } from '../env'

export const winnerRoutes = new Hono<{ Bindings: Env }>()

// GET /winners - List winner patterns
winnerRoutes.get('/', async (c) => {
  try {
    const limit = parseInt(c.req.query('limit') || '50')
    const offset = parseInt(c.req.query('offset') || '0')
    
    const result = await c.env.DB.prepare(`
      SELECT * FROM winner_patterns ORDER BY confidence DESC, sample_count DESC LIMIT ? OFFSET ?
    `).bind(limit, offset).all()
    
    return c.json({
      patterns: result.results,
      total: result.results.length,
    })
  } catch (err) {
    console.error('Error listing winner patterns:', err)
    return c.json({ error: 'Failed to list winner patterns' }, 500)
  }
})

// GET /winners/:id - Get winner pattern detail
winnerRoutes.get('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const pattern = await c.env.DB.prepare('SELECT * FROM winner_patterns WHERE id = ?').bind(id).first()
    
    if (!pattern) {
      return c.json({ error: 'Winner pattern not found' }, 404)
    }
    
    return c.json(pattern)
  } catch (err) {
    console.error('Error fetching winner pattern:', err)
    return c.json({ error: 'Failed to fetch winner pattern' }, 500)
  }
})
