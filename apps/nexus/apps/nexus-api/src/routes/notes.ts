import { Hono } from 'hono'
import type { Env } from '../env'

export interface NoteRow {
  id: string
  title: string
  content: string
  tags: string
  pinned: number
  created_at: string
  updated_at: string
}

export const notesRoutes = new Hono<{ Bindings: Env }>()

  .get('/', async (c) => {
    const q = c.req.query('q') || ''
    let sql = 'SELECT * FROM notes'
    const binds: unknown[] = []
    if (q) {
      sql += ' WHERE (title LIKE ? OR content LIKE ? OR tags LIKE ?)'
      binds.push(`%${q}%`, `%${q}%`, `%${q}%`)
    }
    sql += ' ORDER BY pinned DESC, updated_at DESC LIMIT 200'
    const rows = await c.env.DB.prepare(sql).bind(...binds).all<NoteRow>()
    return c.json({ notes: rows.results ?? [] })
  })

  .post('/', async (c) => {
    const body = await c.req.json<{ title?: string; content?: string; tags?: string; pinned?: boolean }>()
    const id = crypto.randomUUID().replace(/-/g, '').slice(0, 16)
    const now = new Date().toISOString()
    const title   = (body.title   ?? '').trim()
    const content = (body.content ?? '').trim()
    const tags    = (body.tags    ?? '').trim()
    const pinned  = body.pinned ? 1 : 0
    await c.env.DB.prepare(
      'INSERT INTO notes (id, title, content, tags, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(id, title, content, tags, pinned, now, now).run()
    const note = await c.env.DB.prepare('SELECT * FROM notes WHERE id = ?').bind(id).first<NoteRow>()
    return c.json({ note }, 201)
  })

  .patch('/:id', async (c) => {
    const id = c.req.param('id')
    const body = await c.req.json<{ title?: string; content?: string; tags?: string; pinned?: boolean }>()
    const existing = await c.env.DB.prepare('SELECT * FROM notes WHERE id = ?').bind(id).first<NoteRow>()
    if (!existing) return c.json({ error: 'Note not found' }, 404)
    const title   = typeof body.title   === 'string' ? body.title.trim()   : existing.title
    const content = typeof body.content === 'string' ? body.content.trim() : existing.content
    const tags    = typeof body.tags    === 'string' ? body.tags.trim()    : existing.tags
    const pinned  = typeof body.pinned  === 'boolean' ? (body.pinned ? 1 : 0) : existing.pinned
    const now = new Date().toISOString()
    await c.env.DB.prepare(
      'UPDATE notes SET title = ?, content = ?, tags = ?, pinned = ?, updated_at = ? WHERE id = ?'
    ).bind(title, content, tags, pinned, now, id).run()
    const note = await c.env.DB.prepare('SELECT * FROM notes WHERE id = ?').bind(id).first<NoteRow>()
    return c.json({ note })
  })

  .delete('/:id', async (c) => {
    const id = c.req.param('id')
    await c.env.DB.prepare('DELETE FROM notes WHERE id = ?').bind(id).run()
    return c.json({ ok: true })
  })
