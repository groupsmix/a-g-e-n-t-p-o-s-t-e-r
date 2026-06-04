import { Hono } from 'hono'
import type { Env } from '../env'

export const settingsRoutes = new Hono<{ Bindings: Env }>()

interface SettingRow {
  key: string
  value: string
}

function parse(value: string): unknown {
  try { return JSON.parse(value) } catch { return value }
}

// GET /settings - Get all settings
settingsRoutes.get('/', async (c) => {
  try {
    const result = await c.env.DB.prepare('SELECT key, value FROM settings').all<SettingRow>()
    const settings: Record<string, unknown> = {}
    for (const row of result.results ?? []) settings[row.key] = parse(row.value)
    return c.json(settings)
  } catch (err) {
    console.error('Error fetching settings:', err)
    return c.json({ error: 'Failed to fetch settings' }, 500)
  }
})

// GET /settings/:key - Get specific setting
settingsRoutes.get('/:key', async (c) => {
  try {
    const key = c.req.param('key')
    const setting = await c.env.DB.prepare('SELECT key, value FROM settings WHERE key = ?')
      .bind(key).first<SettingRow>()
    if (!setting) return c.json({ error: 'Setting not found' }, 404)
    return c.json({ key, value: parse(setting.value) })
  } catch (err) {
    console.error('Error fetching setting:', err)
    return c.json({ error: 'Failed to fetch setting' }, 500)
  }
})

async function upsert(c: { env: Env }, key: string, value: unknown, now: string) {
  const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value)
  await c.env.DB.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = ?`,
  ).bind(key, stringValue, now, stringValue, now).run()
}

// PATCH /settings - Update multiple settings
settingsRoutes.patch('/', async (c) => {
  try {
    const updates = await c.req.json() as Record<string, unknown>
    const now = new Date().toISOString()
    for (const [key, value] of Object.entries(updates)) await upsert(c, key, value, now)

    const result = await c.env.DB.prepare('SELECT key, value FROM settings').all<SettingRow>()
    const settings: Record<string, unknown> = {}
    for (const row of result.results ?? []) settings[row.key] = parse(row.value)
    return c.json(settings)
  } catch (err) {
    console.error('Error updating settings:', err)
    return c.json({ error: 'Failed to update settings' }, 500)
  }
})

// PATCH /settings/:key - Update specific setting
settingsRoutes.patch('/:key', async (c) => {
  try {
    const key = c.req.param('key')
    const { value } = await c.req.json() as { value?: unknown }
    if (value === undefined) return c.json({ error: 'value is required' }, 400)
    await upsert(c, key, value, new Date().toISOString())
    return c.json({ key, value })
  } catch (err) {
    console.error('Error updating setting:', err)
    return c.json({ error: 'Failed to update setting' }, 500)
  }
})

// ============================================================
// User Preferences (sidebar order, theme, dashboard layout)
// ============================================================

// GET /settings/preference/:key
settingsRoutes.get('/preference/:key', async (c) => {
  try {
    const key = c.req.param('key')
    const row = await c.env.DB.prepare(
      'SELECT key, value FROM user_preferences WHERE key = ?',
    ).bind(key).first<{ key: string; value: string }>()
    if (!row) return c.json({ error: 'Not found' }, 404)
    return c.json({ key: row.key, value: row.value })
  } catch (err) {
    console.error('Error fetching preference:', err)
    return c.json({ error: 'Failed to fetch preference' }, 500)
  }
})

// POST /settings/preference - Upsert a preference
settingsRoutes.post('/preference', async (c) => {
  try {
    const { key, value } = await c.req.json() as { key?: string; value?: string }
    if (!key) return c.json({ error: 'key is required' }, 400)
    const now = new Date().toISOString()
    const val = typeof value === 'string' ? value : JSON.stringify(value)
    await c.env.DB.prepare(
      `INSERT INTO user_preferences (id, key, value, updated_at) VALUES (lower(hex(randomblob(8))), ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = ?`,
    ).bind(key, val, now, val, now).run()
    return c.json({ ok: true })
  } catch (err) {
    console.error('Error saving preference:', err)
    return c.json({ error: 'Failed to save preference' }, 500)
  }
})
