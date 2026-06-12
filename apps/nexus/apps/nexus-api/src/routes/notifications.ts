import { Hono } from 'hono'
import type { Env } from '../env'

export const notificationsRoutes = new Hono<{ Bindings: Env }>()

// ── GET /api/notifications ──────────────────────────────────────────────────
notificationsRoutes.get('/', async (c) => {
  const { results } = await c.env.DB
    .prepare(`SELECT * FROM notifications ORDER BY created_at DESC`)
    .all()
  return c.json({
    notifications: (results ?? []).map((n: any) => ({
      ...n,
      read: n.read === 1,
    })),
  })
})

// ── POST /api/notifications/:id/read ─────────────────────────────────────────
notificationsRoutes.post('/:id/read', async (c) => {
  const id = c.req.param('id')
  const res = await c.env.DB
    .prepare(`UPDATE notifications SET read = 1 WHERE id = ?`)
    .bind(id)
    .run()

  if (res.meta?.changes === 0) {
    return c.json({ error: 'notification not found' }, 404)
  }

  return c.json({ ok: true })
})
