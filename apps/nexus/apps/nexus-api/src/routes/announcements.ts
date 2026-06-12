import { Hono } from 'hono'
import type { Announcement, AnnouncementType } from '@posteragent/types/nexus'
import type { Env } from '../env'

const ANNOUNCEMENT_KEY = 'active_announcement'
const VALID_TYPES: AnnouncementType[] = ['info', 'success', 'warning', 'error']

function isAnnouncementType(value: unknown): value is AnnouncementType {
  return typeof value === 'string' && VALID_TYPES.includes(value as AnnouncementType)
}

async function getStoredAnnouncement(env: Env): Promise<Announcement | null> {
  const raw = await env.CONFIG.get(ANNOUNCEMENT_KEY)
  if (!raw) return null

  try {
    return JSON.parse(raw) as Announcement
  } catch {
    return null
  }
}

export const announcementRoutes = new Hono<{ Bindings: Env }>()
  .get('/', async (c) => {
    const announcement = await getStoredAnnouncement(c.env)
    return c.json({ announcement })
  })
  .post('/', async (c) => {
    const body = await c.req.json<{
      message?: string
      type?: AnnouncementType
      dismissible?: boolean
    }>()

    const message = body.message?.trim()
    if (!message) return c.json({ error: 'message is required' }, 400)

    const announcement: Announcement = {
      id: crypto.randomUUID(),
      message,
      type: isAnnouncementType(body.type) ? body.type : 'info',
      created_at: new Date().toISOString(),
      dismissible: body.dismissible ?? true,
      active: true,
    }

    await c.env.CONFIG.put(ANNOUNCEMENT_KEY, JSON.stringify(announcement))
    return c.json({ announcement }, 201)
  })
  .delete('/', async (c) => {
    await c.env.CONFIG.delete(ANNOUNCEMENT_KEY)
    return c.json({ cleared: true })
  })
  .patch('/dismiss', async (c) => {
    await c.env.CONFIG.delete(ANNOUNCEMENT_KEY)
    return c.json({ dismissed: true })
  })
