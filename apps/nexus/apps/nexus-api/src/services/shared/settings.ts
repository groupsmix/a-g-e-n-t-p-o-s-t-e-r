import type { Env } from '../../env'

/**
 * Shared helpers for reading/writing the `settings` table. Replaces the
 * duplicate getSetting / setSetting functions in marketing.ts, autopilot.ts,
 * and the raw queries scattered elsewhere.
 */

export async function getSetting(env: Env, key: string): Promise<string | null> {
  const row = await env.DB.prepare('SELECT value FROM settings WHERE key = ? LIMIT 1')
    .bind(key)
    .first<{ value: string }>()
    .catch(() => null)
  return row?.value ?? null
}

export async function setSetting(env: Env, key: string, value: string): Promise<void> {
  const now = new Date().toISOString()
  await env.DB.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = ?`,
  )
    .bind(key, value, now, value, now)
    .run()
}
