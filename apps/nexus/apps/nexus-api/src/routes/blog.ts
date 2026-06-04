import { Hono } from 'hono'
import type { Env } from '../env'
import { callAISimple } from '../services/shared/call-ai'

export const blogRoutes = new Hono<{ Bindings: Env }>()

interface BlogPostRow {
  id: string
  title: string
  slug: string
  content: string
  meta_description: string | null
  keywords: string | null
  product_id: string | null
  status: string
  published_at: string | null
  created_at: string
  updated_at: string
}

// POST /blog/generate — AI generates SEO-optimized blog post
blogRoutes.post('/generate', async (c) => {
  try {
    const body = await c.req.json<{
      niche?: string
      product_id?: string
      keywords?: string
      tone?: string
    }>()

    const niche = body.niche || 'general'
    const extraKeywords = body.keywords || ''
    const tone = body.tone || 'professional, helpful'

    let productContext = ''
    if (body.product_id) {
      const product = await c.env.DB
        .prepare('SELECT id, name, niche FROM products WHERE id = ?')
        .bind(body.product_id)
        .first<{ id: string; name: string | null; niche: string | null }>()
      if (product) {
        productContext = `\nProduct context: "${product.name || product.niche || 'Untitled'}"`
      }
    }

    const prompt = `Write an SEO-optimized blog post about "${niche}".${productContext}
Additional keywords to incorporate: ${extraKeywords}
Tone: ${tone}

Return JSON with exactly these fields:
{
  "title": "SEO-optimized title (60 chars max)",
  "slug": "url-friendly-slug",
  "content": "Full blog post in Markdown (1500-2500 words). Include H2/H3 headings, bullet points, and a conclusion with a call-to-action.",
  "meta_description": "Compelling meta description (155 chars max)",
  "keywords": "comma-separated SEO keywords (5-10)"
}`

    const raw = await callAISimple(c.env, prompt, {
      taskType: 'generate_long_form',
      outputFormat: 'json',
      timeoutMs: 90000,
    })

    let parsed: {
      title?: string
      slug?: string
      content?: string
      meta_description?: string
      keywords?: string
    }
    try {
      parsed = JSON.parse(raw)
    } catch {
      return c.json({ error: 'AI returned invalid JSON', raw }, 422)
    }

    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const slug = (parsed.slug || parsed.title || id)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 120)

    await c.env.DB
      .prepare(
        `INSERT INTO blog_posts (id, title, slug, content, meta_description, keywords, product_id, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`,
      )
      .bind(
        id,
        parsed.title || 'Untitled Post',
        slug,
        parsed.content || '',
        parsed.meta_description || null,
        parsed.keywords || null,
        body.product_id || null,
        now,
        now,
      )
      .run()

    const post = await c.env.DB
      .prepare('SELECT * FROM blog_posts WHERE id = ?')
      .bind(id)
      .first<BlogPostRow>()

    return c.json({ post })
  } catch (err) {
    console.error('Error generating blog post:', err)
    return c.json({ error: 'Failed to generate blog post' }, 500)
  }
})

// GET /blog — list posts with pagination
blogRoutes.get('/', async (c) => {
  try {
    const limit = parseInt(c.req.query('limit') || '20')
    const offset = parseInt(c.req.query('offset') || '0')
    const status = c.req.query('status')

    let query = 'SELECT * FROM blog_posts'
    const params: (string | number)[] = []

    if (status) {
      query += ' WHERE status = ?'
      params.push(status)
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?'
    params.push(limit, offset)

    const result = await c.env.DB.prepare(query).bind(...params).all<BlogPostRow>()

    const countQuery = status
      ? 'SELECT COUNT(*) as total FROM blog_posts WHERE status = ?'
      : 'SELECT COUNT(*) as total FROM blog_posts'
    const countResult = status
      ? await c.env.DB.prepare(countQuery).bind(status).first<{ total: number }>()
      : await c.env.DB.prepare(countQuery).first<{ total: number }>()

    return c.json({
      posts: result.results,
      total: countResult?.total ?? 0,
      limit,
      offset,
    })
  } catch (err) {
    console.error('Error listing blog posts:', err)
    return c.json({ error: 'Failed to list blog posts' }, 500)
  }
})

// GET /blog/:slug — get single post by slug
blogRoutes.get('/:slug', async (c) => {
  try {
    const slug = c.req.param('slug')

    const post = await c.env.DB
      .prepare('SELECT * FROM blog_posts WHERE slug = ?')
      .bind(slug)
      .first<BlogPostRow>()

    if (!post) {
      return c.json({ error: 'Post not found' }, 404)
    }

    return c.json({ post })
  } catch (err) {
    console.error('Error fetching blog post:', err)
    return c.json({ error: 'Failed to fetch blog post' }, 500)
  }
})

// PUT /blog/:id — edit post
blogRoutes.put('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json<Partial<Omit<BlogPostRow, 'id' | 'created_at'>>>()

    const existing = await c.env.DB
      .prepare('SELECT id FROM blog_posts WHERE id = ?')
      .bind(id)
      .first<{ id: string }>()

    if (!existing) {
      return c.json({ error: 'Post not found' }, 404)
    }

    const fields: string[] = []
    const values: (string | null)[] = []

    if (body.title !== undefined) { fields.push('title = ?'); values.push(body.title) }
    if (body.slug !== undefined) { fields.push('slug = ?'); values.push(body.slug) }
    if (body.content !== undefined) { fields.push('content = ?'); values.push(body.content) }
    if (body.meta_description !== undefined) { fields.push('meta_description = ?'); values.push(body.meta_description) }
    if (body.keywords !== undefined) { fields.push('keywords = ?'); values.push(body.keywords) }
    if (body.product_id !== undefined) { fields.push('product_id = ?'); values.push(body.product_id) }
    if (body.status !== undefined) { fields.push('status = ?'); values.push(body.status) }

    if (fields.length === 0) {
      return c.json({ error: 'No fields to update' }, 400)
    }

    fields.push('updated_at = ?')
    values.push(new Date().toISOString())
    values.push(id)

    await c.env.DB
      .prepare(`UPDATE blog_posts SET ${fields.join(', ')} WHERE id = ?`)
      .bind(...values)
      .run()

    const post = await c.env.DB
      .prepare('SELECT * FROM blog_posts WHERE id = ?')
      .bind(id)
      .first<BlogPostRow>()

    return c.json({ post })
  } catch (err) {
    console.error('Error updating blog post:', err)
    return c.json({ error: 'Failed to update blog post' }, 500)
  }
})

// DELETE /blog/:id — delete post
blogRoutes.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id')

    const result = await c.env.DB
      .prepare('DELETE FROM blog_posts WHERE id = ?')
      .bind(id)
      .run()

    if (result.meta.changes === 0) {
      return c.json({ error: 'Post not found' }, 404)
    }

    return c.json({ ok: true })
  } catch (err) {
    console.error('Error deleting blog post:', err)
    return c.json({ error: 'Failed to delete blog post' }, 500)
  }
})

// POST /blog/:id/publish — publish post
blogRoutes.post('/:id/publish', async (c) => {
  try {
    const id = c.req.param('id')
    const now = new Date().toISOString()

    const existing = await c.env.DB
      .prepare('SELECT id, status FROM blog_posts WHERE id = ?')
      .bind(id)
      .first<{ id: string; status: string }>()

    if (!existing) {
      return c.json({ error: 'Post not found' }, 404)
    }

    await c.env.DB
      .prepare("UPDATE blog_posts SET status = 'published', published_at = ?, updated_at = ? WHERE id = ?")
      .bind(now, now, id)
      .run()

    const post = await c.env.DB
      .prepare('SELECT * FROM blog_posts WHERE id = ?')
      .bind(id)
      .first<BlogPostRow>()

    return c.json({ post })
  } catch (err) {
    console.error('Error publishing blog post:', err)
    return c.json({ error: 'Failed to publish blog post' }, 500)
  }
})
