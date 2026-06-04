import { Hono } from 'hono'
import type { Env } from '../env'

export const promptRoutes = new Hono<{ Bindings: Env }>()

// GET /prompts - List prompt templates (optionally filtered by layer)
promptRoutes.get('/', async (c) => {
  try {
    const layer = c.req.query('layer')
    
    let query = 'SELECT * FROM prompt_templates WHERE is_active = 1'
    const bindings: any[] = []
    
    if (layer) {
      query += ' AND layer = ?'
      bindings.push(layer)
    }
    
    query += ' ORDER BY layer, name'
    
    const result = await c.env.DB.prepare(query).bind(...bindings).all()
    return c.json(result.results)
  } catch (err) {
    console.error('Error listing prompts:', err)
    return c.json({ error: 'Failed to list prompts' }, 500)
  }
})

// GET /prompts/:id - Get prompt template
promptRoutes.get('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const prompt = await c.env.DB.prepare('SELECT * FROM prompt_templates WHERE id = ?').bind(id).first()
    
    if (!prompt) {
      return c.json({ error: 'Prompt not found' }, 404)
    }
    
    return c.json(prompt)
  } catch (err) {
    console.error('Error fetching prompt:', err)
    return c.json({ error: 'Failed to fetch prompt' }, 500)
  }
})

// PATCH /prompts/:id - Update prompt template
promptRoutes.patch('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const { prompt_text } = await c.req.json()
    
    if (!prompt_text) {
      return c.json({ error: 'prompt_text is required' }, 400)
    }
    
    const now = new Date().toISOString()
    
    const result = await c.env.DB.prepare(`
      UPDATE prompt_templates SET prompt_text = ?, updated_at = ? WHERE id = ?
    `).bind(prompt_text, now, id).run()
    
    if (result.meta.changes === 0) {
      return c.json({ error: 'Prompt not found' }, 404)
    }
    
    // Invalidate prompt cache
    const prompt = await c.env.DB.prepare('SELECT layer, reference_id FROM prompt_templates WHERE id = ?').bind(id).first() as any
    if (prompt) {
      const cacheKey = `prompts:${prompt.layer}:${prompt.reference_id || prompt.id}`
      await c.env.CONFIG.delete(cacheKey)
    }
    
    const updated = await c.env.DB.prepare('SELECT * FROM prompt_templates WHERE id = ?').bind(id).first()
    return c.json(updated)
  } catch (err) {
    console.error('Error updating prompt:', err)
    return c.json({ error: 'Failed to update prompt' }, 500)
  }
})

// POST /prompts - Create prompt template
promptRoutes.post('/', async (c) => {
  try {
    const data = await c.req.json()
    
    if (!data.name || !data.layer || !data.prompt_text) {
      return c.json({ error: 'name, layer, and prompt_text are required' }, 400)
    }
    
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    
    await c.env.DB.prepare(`
      INSERT INTO prompt_templates (id, name, layer, reference_id, prompt_text, 
                                   description, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id, data.name, data.layer, data.reference_id || '',
      data.prompt_text, data.description || '', data.is_active ?? 1, now, now
    ).run()
    
    const prompt = await c.env.DB.prepare('SELECT * FROM prompt_templates WHERE id = ?').bind(id).first()
    return c.json(prompt, 201)
  } catch (err) {
    console.error('Error creating prompt:', err)
    return c.json({ error: 'Failed to create prompt' }, 500)
  }
})
