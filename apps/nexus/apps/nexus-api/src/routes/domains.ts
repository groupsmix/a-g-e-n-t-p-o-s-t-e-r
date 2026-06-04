import { Hono } from 'hono'
import type { Env } from '../env'

export const domainRoutes = new Hono<{ Bindings: Env }>()

// GET /domains - List all domains
domainRoutes.get('/', async (c) => {
  try {
    // Try cache first
    const cached = await c.env.CONFIG.get('config:domains')
    if (cached) {
      return c.json(JSON.parse(cached))
    }
    
    const result = await c.env.DB.prepare(`
      SELECT id, name, slug, description, icon, color, sort_order, is_active, created_at
      FROM domains WHERE is_active = 1 ORDER BY sort_order ASC
    `).all()
    
    // Cache for 1 hour
    await c.env.CONFIG.put('config:domains', JSON.stringify(result.results), { expirationTtl: 3600 })
    
    return c.json(result.results)
  } catch (err) {
    console.error('Error listing domains:', err)
    return c.json({ error: 'Failed to list domains' }, 500)
  }
})

// POST /domains - Create domain
domainRoutes.post('/', async (c) => {
  try {
    const { name, slug, description, icon, color } = await c.req.json()
    
    if (!name || !slug) {
      return c.json({ error: 'name and slug are required' }, 400)
    }
    
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    
    await c.env.DB.prepare(`
      INSERT INTO domains (id, name, slug, description, icon, color, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, name, slug, description || '', icon || '', color || '#6366f1', now, now).run()
    
    // Invalidate cache
    await c.env.CONFIG.delete('config:domains')
    
    const domain = await c.env.DB.prepare('SELECT * FROM domains WHERE id = ?').bind(id).first()
    return c.json(domain, 201)
  } catch (err: any) {
    if (err.message?.includes('UNIQUE constraint')) {
      return c.json({ error: 'Domain with this slug already exists' }, 409)
    }
    console.error('Error creating domain:', err)
    return c.json({ error: 'Failed to create domain' }, 500)
  }
})

// GET /domains/:id - Get domain
domainRoutes.get('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const domain = await c.env.DB.prepare('SELECT * FROM domains WHERE id = ?').bind(id).first()
    
    if (!domain) {
      return c.json({ error: 'Domain not found' }, 404)
    }
    
    return c.json(domain)
  } catch (err) {
    console.error('Error fetching domain:', err)
    return c.json({ error: 'Failed to fetch domain' }, 500)
  }
})

// PATCH /domains/:id - Update domain
domainRoutes.patch('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const updates = await c.req.json()
    const now = new Date().toISOString()
    
    const allowedFields = ['name', 'slug', 'description', 'icon', 'color', 'sort_order', 'is_active']
    const setClause: string[] = ['updated_at = ?']
    const values: any[] = [now]
    
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        setClause.push(`${field} = ?`)
        values.push(updates[field])
      }
    }
    
    values.push(id)
    
    const result = await c.env.DB.prepare(`
      UPDATE domains SET ${setClause.join(', ')} WHERE id = ?
    `).bind(...values).run()
    
    if (result.meta.changes === 0) {
      return c.json({ error: 'Domain not found' }, 404)
    }
    
    // Invalidate cache
    await c.env.CONFIG.delete('config:domains')
    
    const domain = await c.env.DB.prepare('SELECT * FROM domains WHERE id = ?').bind(id).first()
    return c.json(domain)
  } catch (err) {
    console.error('Error updating domain:', err)
    return c.json({ error: 'Failed to update domain' }, 500)
  }
})

// DELETE /domains/:id - Delete domain
domainRoutes.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    
    const result = await c.env.DB.prepare('DELETE FROM domains WHERE id = ?').bind(id).run()
    
    if (result.meta.changes === 0) {
      return c.json({ error: 'Domain not found' }, 404)
    }
    
    // Invalidate cache
    await c.env.CONFIG.delete('config:domains')
    await c.env.CONFIG.delete(`config:categories:${id}`)
    
    return c.json({ message: 'Domain deleted' })
  } catch (err) {
    console.error('Error deleting domain:', err)
    return c.json({ error: 'Failed to delete domain' }, 500)
  }
})

// GET /domains/:id/categories - List categories for a domain
domainRoutes.get('/:id/categories', async (c) => {
  try {
    const domainId = c.req.param('id')
    
    // Try cache first
    const cacheKey = `config:categories:${domainId}`
    const cached = await c.env.CONFIG.get(cacheKey)
    if (cached) {
      return c.json(JSON.parse(cached))
    }
    
    const result = await c.env.DB.prepare(`
      SELECT id, domain_id, name, slug, description, icon, sort_order, is_active, created_at
      FROM categories WHERE domain_id = ? AND is_active = 1 ORDER BY sort_order ASC
    `).bind(domainId).all()
    
    // Cache for 1 hour
    await c.env.CONFIG.put(cacheKey, JSON.stringify(result.results), { expirationTtl: 3600 })
    
    return c.json(result.results)
  } catch (err) {
    console.error('Error listing categories:', err)
    return c.json({ error: 'Failed to list categories' }, 500)
  }
})

// POST /domains/:id/categories - Create category
domainRoutes.post('/:id/categories', async (c) => {
  try {
    const domainId = c.req.param('id')
    const { name, slug, description, icon } = await c.req.json()
    
    if (!name || !slug) {
      return c.json({ error: 'name and slug are required' }, 400)
    }
    
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    
    await c.env.DB.prepare(`
      INSERT INTO categories (id, domain_id, name,slug, description, icon, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(id, domainId, name, slug, description || '', icon || '', now).run()
    
    // Invalidate cache
    await c.env.CONFIG.delete(`config:categories:${domainId}`)
    
    const category = await c.env.DB.prepare('SELECT * FROM categories WHERE id = ?').bind(id).first()
    return c.json(category, 201)
  } catch (err) {
    console.error('Error creating category:', err)
    return c.json({ error: 'Failed to create category' }, 500)
  }
})
