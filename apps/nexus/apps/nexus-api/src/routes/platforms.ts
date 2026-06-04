import { Hono } from 'hono'
import type { Env } from '../env'

export const platformRoutes = new Hono<{ Bindings: Env }>()

// GET /platforms - List all platforms
platformRoutes.get('/', async (c) => {
  try {
    const cached = await c.env.CONFIG.get('config:platforms')
    if (cached) {
      return c.json(JSON.parse(cached))
    }
    
    const result = await c.env.DB.prepare(`
      SELECT * FROM platforms WHERE is_active = 1 ORDER BY sort_order ASC
    `).all()
    
    await c.env.CONFIG.put('config:platforms', JSON.stringify(result.results), { expirationTtl: 3600 })
    
    return c.json(result.results)
  } catch (err) {
    console.error('Error listing platforms:', err)
    return c.json({ error: 'Failed to list platforms' }, 500)
  }
})

// POST /platforms - Create platform
platformRoutes.post('/', async (c) => {
  try {
    const data = await c.req.json()
    
    if (!data.name || !data.slug) {
      return c.json({ error: 'name and slug are required' }, 400)
    }
    
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    
    await c.env.DB.prepare(`
      INSERT INTO platforms (id, name, slug, url, title_max_chars, description_max, 
                           tag_count, tag_max_chars, audience, tone, seo_style,
                           description_style, cta_style, forbidden_words, rules_json,
                           is_active, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id, data.name, data.slug, data.url || '', 
      data.title_max_chars || null, data.description_max || null,
      data.tag_count || null, data.tag_max_chars || null, 
      data.audience || '', data.tone || '', data.seo_style || '',
      data.description_style || '', data.cta_style || '',
      JSON.stringify(data.forbidden_words || []),
      JSON.stringify(data.rules_json || {}),
      data.is_active ?? 1, data.sort_order ?? 0, now, now
    ).run()
    
    await c.env.CONFIG.delete('config:platforms')
    
    const platform = await c.env.DB.prepare('SELECT * FROM platforms WHERE id = ?').bind(id).first()
    return c.json(platform, 201)
  } catch (err: any) {
    if (err.message?.includes('UNIQUE constraint')) {
      return c.json({ error: 'Platform with this slug already exists' }, 409)
    }
    console.error('Error creating platform:', err)
    return c.json({ error: 'Failed to create platform' }, 500)
  }
})

// GET /platforms/:id - Get platform
platformRoutes.get('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const platform = await c.env.DB.prepare('SELECT * FROM platforms WHERE id = ?').bind(id).first()
    
    if (!platform) {
      return c.json({ error: 'Platform not found' }, 404)
    }
    
    return c.json(platform)
  } catch (err) {
    console.error('Error fetching platform:', err)
    return c.json({ error: 'Failed to fetch platform' }, 500)
  }
})

// PATCH /platforms/:id - Update platform
platformRoutes.patch('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const updates = await c.req.json()
    const now = new Date().toISOString()
    
    const allowedFields = ['name', 'slug', 'url', 'title_max_chars', 'description_max',
                          'tag_count', 'tag_max_chars', 'audience', 'tone', 'seo_style',
                          'description_style', 'cta_style', 'forbidden_words', 'rules_json',
                          'is_active', 'sort_order']
    const setClause: string[] = ['updated_at = ?']
    const values: any[] = [now]
    
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        setClause.push(`${field} = ?`)
        values.push(field === 'forbidden_words' || field === 'rules_json' 
          ? JSON.stringify(updates[field]) : updates[field])
      }
    }
    
    values.push(id)
    
    const result = await c.env.DB.prepare(`
      UPDATE platforms SET ${setClause.join(', ')} WHERE id = ?
    `).bind(...values).run()
    
    if (result.meta.changes === 0) {
      return c.json({ error: 'Platform not found' }, 404)
    }
    
    await c.env.CONFIG.delete('config:platforms')
    
    const platform = await c.env.DB.prepare('SELECT * FROM platforms WHERE id = ?').bind(id).first()
    return c.json(platform)
  } catch (err) {
    console.error('Error updating platform:', err)
    return c.json({ error: 'Failed to update platform' }, 500)
  }
})

// DELETE /platforms/:id - Delete platform
platformRoutes.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    
    const result = await c.env.DB.prepare('DELETE FROM platforms WHERE id = ?').bind(id).run()
    
    if (result.meta.changes === 0) {
      return c.json({ error: 'Platform not found' }, 404)
    }
    
    await c.env.CONFIG.delete('config:platforms')
    
    return c.json({ message: 'Platform deleted' })
  } catch (err) {
    console.error('Error deleting platform:', err)
    return c.json({ error: 'Failed to delete platform' }, 500)
  }
})
