import { Hono } from 'hono'
import type { Env } from '../env'

export const socialRoutes = new Hono<{ Bindings: Env }>()

// GET /social - List all social channels
socialRoutes.get('/', async (c) => {
  try {
    const cached = await c.env.CONFIG.get('config:social_channels')
    if (cached) {
      return c.json(JSON.parse(cached))
    }
    
    const result = await c.env.DB.prepare(`
      SELECT * FROM social_channels WHERE is_active = 1 ORDER BY sort_order ASC
    `).all()
    
    await c.env.CONFIG.put('config:social_channels', JSON.stringify(result.results), { expirationTtl: 3600 })
    
    return c.json(result.results)
  } catch (err) {
    console.error('Error listing social channels:', err)
    return c.json({ error: 'Failed to list social channels' }, 500)
  }
})

// POST /social - Create social channel
socialRoutes.post('/', async (c) => {
  try {
    const data = await c.req.json()
    
    if (!data.name || !data.slug) {
      return c.json({ error: 'name and slug are required' }, 400)
    }
    
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    
    await c.env.DB.prepare(`
      INSERT INTO social_channels (id, name, slug, caption_max_chars, hashtag_count,
                                 tone, format, content_types, posting_mode,
                                 is_active, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id, data.name, data.slug, data.caption_max_chars || null,
      data.hashtag_count || null, data.tone || '', data.format || '',
      JSON.stringify(data.content_types || []), data.posting_mode || 'manual',
      data.is_active ?? 1, data.sort_order ?? 0, now, now
    ).run()
    
    await c.env.CONFIG.delete('config:social_channels')
    
    const channel = await c.env.DB.prepare('SELECT * FROM social_channels WHERE id = ?').bind(id).first()
    return c.json(channel, 201)
  } catch (err: any) {
    if (err.message?.includes('UNIQUE constraint')) {
      return c.json({ error: 'Social channel with this slug already exists' }, 409)
    }
    console.error('Error creating social channel:', err)
    return c.json({ error: 'Failed to create social channel' }, 500)
  }
})

// GET /social/:id - Get social channel
socialRoutes.get('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const channel = await c.env.DB.prepare('SELECT * FROM social_channels WHERE id = ?').bind(id).first()
    
    if (!channel) {
      return c.json({ error: 'Social channel not found' }, 404)
    }
    
    return c.json(channel)
  } catch (err) {
    console.error('Error fetching social channel:', err)
    return c.json({ error: 'Failed to fetch social channel' }, 500)
  }
})

// PATCH /social/:id - Update social channel
socialRoutes.patch('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const updates = await c.req.json()
    const now = new Date().toISOString()
    
    const allowedFields = ['name', 'slug', 'caption_max_chars', 'hashtag_count',
                          'tone', 'format', 'content_types', 'posting_mode',
                          'is_active', 'sort_order']
    const setClause: string[] = ['updated_at = ?']
    const values: any[] = [now]
    
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        setClause.push(`${field} = ?`)
        values.push(field === 'content_types' 
          ? JSON.stringify(updates[field]) : updates[field])
      }
    }
    
    values.push(id)
    
    const result = await c.env.DB.prepare(`
      UPDATE social_channels SET ${setClause.join(', ')} WHERE id = ?
    `).bind(...values).run()
    
    if (result.meta.changes === 0) {
      return c.json({ error: 'Social channel not found' }, 404)
    }
    
    await c.env.CONFIG.delete('config:social_channels')
    
    const channel = await c.env.DB.prepare('SELECT * FROM social_channels WHERE id = ?').bind(id).first()
    return c.json(channel)
  } catch (err) {
    console.error('Error updating social channel:', err)
    return c.json({ error: 'Failed to update social channel' }, 500)
  }
})

// DELETE /social/:id - Delete social channel
socialRoutes.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    
    const result = await c.env.DB.prepare('DELETE FROM social_channels WHERE id = ?').bind(id).run()
    
    if (result.meta.changes === 0) {
      return c.json({ error: 'Social channel not found' }, 404)
    }
    
    await c.env.CONFIG.delete('config:social_channels')
    
    return c.json({ message: 'Social channel deleted' })
  } catch (err) {
    console.error('Error deleting social channel:', err)
    return c.json({ error: 'Failed to delete social channel' }, 500)
  }
})
