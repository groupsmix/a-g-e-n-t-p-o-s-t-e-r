/**
 * @posteragent/identity/now
 *
 * The "what am I focused on right now" scratchpad.  One row per scope,
 * TTL-based.  Used by:
 *
 *   • the dashboard's Brain page (TASK-203) — show + edit current focus
 *   • every agent — injected into the system prompt as "Current focus: ..."
 *   • the proactivity engine (TASK-202) — checks if the scratchpad is
 *     stale and prompts the owner if it is
 *
 * Default TTL: 24 hours for 'global' scope, 4 hours for everything else.
 * Override with `set(..., { ttlMs })`.
 */

import type { D1Database } from '@posteragent/memory'
import { createLogger } from '@posteragent/logger'

const log = createLogger('identity:now')

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

const DEFAULT_TTL: Record<string, number> = {
  global: DAY,
}

function defaultTtlFor(scope: string): number {
  return DEFAULT_TTL[scope] ?? 4 * HOUR
}

export interface NowEntry {
  scope: string
  content: string
  setBy: string | null
  expiresAt: Date
  updatedAt: Date
}

export interface SetNowOptions {
  setBy?: string
  /** Override the default TTL.  null = use the scope default. */
  ttlMs?: number | null
}

interface NowRow {
  scope: string
  content: string
  set_by: string | null
  expires_at: string
  updated_at: string
}

function rowToNowEntry(row: NowRow): NowEntry {
  return {
    scope: row.scope,
    content: row.content,
    setBy: row.set_by,
    expiresAt: new Date(row.expires_at),
    updatedAt: new Date(row.updated_at),
  }
}

export class NowScratchpad {
  constructor(private db: D1Database) {}

  /** Returns null if no entry, OR if expired (silently treats expired as absent). */
  async get(scope = 'global'): Promise<NowEntry | null> {
    const row = await this.db
      .prepare(
        `SELECT scope, content, set_by, expires_at, updated_at
         FROM now_scratchpad
         WHERE scope = ?`,
      )
      .bind(scope)
      .first<NowRow>()
    if (!row) return null
    const entry = rowToNowEntry(row)
    return entry.expiresAt.getTime() > Date.now() ? entry : null
  }

  /** Convenience for prompt building. */
  async getText(scope = 'global'): Promise<string | null> {
    const entry = await this.get(scope)
    return entry?.content ?? null
  }

  async set(scope: string, content: string, opts: SetNowOptions = {}): Promise<NowEntry> {
    const now = new Date()
    const ttl = opts.ttlMs ?? defaultTtlFor(scope)
    const expiresAt = new Date(now.getTime() + ttl)
    const setBy = opts.setBy ?? null

    await this.db
      .prepare(
        `INSERT INTO now_scratchpad (scope, content, set_by, expires_at, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(scope) DO UPDATE SET
           content = excluded.content,
           set_by = excluded.set_by,
           expires_at = excluded.expires_at,
           updated_at = excluded.updated_at`,
      )
      .bind(scope, content.trim(), setBy, expiresAt.toISOString(), now.toISOString())
      .run()

    log.debug('now.set', { scope, ttlMs: ttl })

    return {
      scope,
      content: content.trim(),
      setBy,
      expiresAt,
      updatedAt: now,
    }
  }

  async clear(scope = 'global'): Promise<void> {
    await this.db.prepare('DELETE FROM now_scratchpad WHERE scope = ?').bind(scope).run()
  }

  /** Sweep expired rows.  Called from the prune routine. */
  async pruneExpired(): Promise<number> {
    const result = await this.db
      .prepare('DELETE FROM now_scratchpad WHERE expires_at <= ?')
      .bind(new Date().toISOString())
      .run()
    const meta = (result.meta ?? {}) as { changes?: number }
    return meta.changes ?? 0
  }
}
