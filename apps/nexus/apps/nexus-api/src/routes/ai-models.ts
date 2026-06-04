import { Hono } from 'hono'
import type { Env } from '../env'

export const aiModelRoutes = new Hono<{ Bindings: Env }>()

// GET /ai-models - List all AI models
aiModelRoutes.get('/', async (c) => {
  try {
    const cached = await c.env.CONFIG.get('config:ai_models')
    if (cached) {
      return c.json(JSON.parse(cached))
    }
    
    const result = await c.env.DB.prepare(`
      SELECT * FROM ai_models ORDER BY provider, name
    `).all()
    
    await c.env.CONFIG.put('config:ai_models', JSON.stringify(result.results), { expirationTtl: 3600 })
    
    return c.json(result.results)
  } catch (err) {
    console.error('Error listing AI models:', err)
    return c.json({ error: 'Failed to list AI models' }, 500)
  }
})

// GET /ai-models/:id - Get AI model
aiModelRoutes.get('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const model = await c.env.DB.prepare('SELECT * FROM ai_models WHERE id = ?').bind(id).first()
    
    if (!model) {
      return c.json({ error: 'AI model not found' }, 404)
    }
    
    return c.json(model)
  } catch (err) {
    console.error('Error fetching AI model:', err)
    return c.json({ error: 'Failed to fetch AI model' }, 500)
  }
})

// PATCH /ai-models/:id - Update AI model status
aiModelRoutes.patch('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const updates = await c.req.json()
    
    const allowedFields = ['name', 'status', 'priority', 'is_active', 'config_json']
    const setClause: string[] = []
    const values: any[] = []
    
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        setClause.push(`${field} = ?`)
        values.push(field === 'config_json' 
          ? JSON.stringify(updates[field]) : updates[field])
      }
    }
    
    if (setClause.length === 0) {
      return c.json({ error: 'No valid fields to update' }, 400)
    }
    
    values.push(id)
    
    const result = await c.env.DB.prepare(`
      UPDATE ai_models SET ${setClause.join(', ')} WHERE id = ?
    `).bind(...values).run()
    
    if (result.meta.changes === 0) {
      return c.json({ error: 'AI model not found' }, 404)
    }
    
    await c.env.CONFIG.delete('config:ai_models')
    
    const model = await c.env.DB.prepare('SELECT * FROM ai_models WHERE id = ?').bind(id).first()
    return c.json(model)
  } catch (err) {
    console.error('Error updating AI model:', err)
    return c.json({ error: 'Failed to update AI model' }, 500)
  }
})

// POST /ai-models/:id/reset - Reset rate limit for a model
aiModelRoutes.post('/:id/reset', async (c) => {
  try {
    const id = c.req.param('id')
    
    // Get model info
    const model = await c.env.DB.prepare('SELECT * FROM ai_models WHERE id = ?').bind(id).first() as any
    
    if (!model) {
      return c.json({ error: 'AI model not found' }, 404)
    }
    
    // Clear rate limit keys from KV
    await c.env.CONFIG.delete(`ai:rate_limit:${model.name}`)
    await c.env.CONFIG.delete(`ai:quota:${model.name}`)
    
    return c.json({ message: 'Rate limits reset', model: model.name })
  } catch (err) {
    console.error('Error resetting rate limits:', err)
    return c.json({ error: 'Failed to reset rate limits' }, 500)
  }
})
