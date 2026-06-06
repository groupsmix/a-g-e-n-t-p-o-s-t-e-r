/**
 * Worker-side reader for the brain tables (migration 024).
 *
 *   • memory_items           → listMemories / countMemoriesByType
 *   • journal_entries        → listJournal / countJournalLast7d
 *   • now_scratchpad         → getNow
 *   • persona_traits         → listPersonaTraits
 *
 * Pure SQL — no LLMs, no Vectorize.  The dashboard's `nexusApiSource`
 * calls into the HTTP routes that wrap these helpers (routes/brain.ts).
 *
 * Shapes returned here are converted to the dashboard DTOs in the
 * route layer — keeping that translation in one place makes future
 * schema drift a one-file fix.
 *
 * Persona resolution: SOUL.md ships in @posteragent/identity at the
 * outer workspace. The worker can't reach it across the nested boundary,
 * so we ship a copy at `src/data/SOUL.md` (kept in lock-step via the
 * brain CI job) and read from there.
 */

import type { D1Database } from '@cloudflare/workers-types'
import { DEFAULT_SOUL } from '../data/soul'

// ── Row types (raw D1 shape) ──────────────────────────────────────────────

export interface MemoryItemRow {
  id: string
  type: 'identity' | 'preference' | 'project' | 'event' | 'fact'
  content: string
  source: string
  tags: string | null
  embedding: string | null
  expires_at: string | null
  created_at: string
  updated_at: string
}

export interface JournalEntryRow {
  id: string
  task_id: string | null
  agent_id: string | null
  summary: string
  outcome: 'success' | 'partial' | 'failed' | 'noop'
  learnings: string | null
  follow_ups: string | null
  consolidated: number
  created_at: string
}

export interface NowRow {
  scope: string
  content: string
  set_by: string | null
  expires_at: string
  updated_at: string
}

export interface PersonaTraitRow {
  id: string
  scope: string
  trait: string
  weight: number
  enabled: number
  created_at: string
  updated_at: string
}

// ── memory_items ─────────────────────────────────────────────────────────

export interface ListMemoriesOpts {
  type?: MemoryItemRow['type']
  query?: string
  limit?: number
}

export async function listMemories(
  db: D1Database,
  opts: ListMemoriesOpts = {},
): Promise<MemoryItemRow[]> {
  const limit = clampLimit(opts.limit, 50)
  const filters: string[] = ['(expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)']
  const binds: unknown[] = []
  if (opts.type) {
    filters.push('type = ?')
    binds.push(opts.type)
  }
  if (opts.query && opts.query.trim()) {
    filters.push('(content LIKE ? OR COALESCE(tags, "") LIKE ?)')
    const like = `%${opts.query.trim()}%`
    binds.push(like, like)
  }
  const sql = `
    SELECT id, type, content, source, tags, embedding,
           expires_at, created_at, updated_at
      FROM memory_items
     WHERE ${filters.join(' AND ')}
     ORDER BY updated_at DESC
     LIMIT ?
  `
  binds.push(limit)
  const { results } = await db.prepare(sql).bind(...binds).all<MemoryItemRow>()
  return results ?? []
}

export interface MemoryStats {
  total: number
  byType: Record<string, number>
}

export async function memoryStats(db: D1Database): Promise<MemoryStats> {
  const { results } = await db
    .prepare(
      `SELECT type, COUNT(*) AS n
         FROM memory_items
        WHERE expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP
        GROUP BY type`,
    )
    .all<{ type: string; n: number }>()
  const byType: Record<string, number> = {}
  let total = 0
  for (const row of results ?? []) {
    byType[row.type] = row.n
    total += row.n
  }
  return { total, byType }
}

// ── journal_entries ──────────────────────────────────────────────────────

export interface ListJournalOpts {
  limit?: number
  sinceISO?: string
  consolidated?: boolean
}

export async function listJournal(
  db: D1Database,
  opts: ListJournalOpts = {},
): Promise<JournalEntryRow[]> {
  const limit = clampLimit(opts.limit, 50)
  const filters: string[] = []
  const binds: unknown[] = []
  if (opts.sinceISO) {
    filters.push('created_at > ?')
    binds.push(opts.sinceISO)
  }
  if (typeof opts.consolidated === 'boolean') {
    filters.push('consolidated = ?')
    binds.push(opts.consolidated ? 1 : 0)
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : ''
  const sql = `
    SELECT id, task_id, agent_id, summary, outcome, learnings, follow_ups,
           consolidated, created_at
      FROM journal_entries
      ${where}
      ORDER BY created_at DESC
      LIMIT ?
  `
  binds.push(limit)
  const { results } = await db.prepare(sql).bind(...binds).all<JournalEntryRow>()
  return results ?? []
}

export interface JournalStats {
  last7d: number
  unconsolidated: number
}

export async function journalStats(db: D1Database): Promise<JournalStats> {
  const cutoff = new Date(Date.now() - 7 * 86_400_000).toISOString()
  const last7d = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM journal_entries WHERE created_at > ?`,
    )
    .bind(cutoff)
    .first<{ n: number }>()
  const unconsolidated = await db
    .prepare(`SELECT COUNT(*) AS n FROM journal_entries WHERE consolidated = 0`)
    .first<{ n: number }>()
  return {
    last7d: last7d?.n ?? 0,
    unconsolidated: unconsolidated?.n ?? 0,
  }
}

// ── now_scratchpad ───────────────────────────────────────────────────────

export async function getNow(
  db: D1Database,
  scope = 'global',
): Promise<NowRow | null> {
  const row = await db
    .prepare(
      `SELECT scope, content, set_by, expires_at, updated_at
         FROM now_scratchpad
        WHERE scope = ?
          AND expires_at > CURRENT_TIMESTAMP`,
    )
    .bind(scope)
    .first<NowRow>()
  return row ?? null
}

// ── persona_traits ───────────────────────────────────────────────────────

export async function listPersonaTraits(
  db: D1Database,
  scope?: string,
): Promise<PersonaTraitRow[]> {
  const sql = scope
    ? `SELECT * FROM persona_traits WHERE enabled = 1 AND scope = ? ORDER BY weight DESC`
    : `SELECT * FROM persona_traits WHERE enabled = 1 ORDER BY scope, weight DESC`
  const stmt = scope ? db.prepare(sql).bind(scope) : db.prepare(sql)
  const { results } = await stmt.all<PersonaTraitRow>()
  return results ?? []
}

// ── persona resolution ───────────────────────────────────────────────────

export interface PersonaSnapshot {
  name: string
  emoji: string
  tagline: string
  soul: string
  updatedAt: string
}

/**
 * Pulls the persona snapshot from KV (if owner-overridden) or falls back
 * to the source-controlled SOUL.md copy.  The dashboard never edits this
 * directly — it's set via the Settings page (TASK-103).
 */
export async function getPersona(
  env: { DB: D1Database; CONFIG?: { get: (k: string) => Promise<string | null> } },
): Promise<PersonaSnapshot> {
  let overrides: Partial<PersonaSnapshot> = {}
  try {
    const raw = (await env.CONFIG?.get('persona:override')) ?? null
    if (raw) overrides = JSON.parse(raw) as Partial<PersonaSnapshot>
  } catch {
    // KV miss / parse fail → use defaults below.
  }
  return {
    name: overrides.name ?? 'NEXUS',
    emoji: overrides.emoji ?? '🧠',
    tagline:
      overrides.tagline ??
      'Single-owner money machine. Ships before it asks.',
    soul: overrides.soul ?? DEFAULT_SOUL,
    updatedAt: overrides.updatedAt ?? new Date(0).toISOString(),
  }
}

// ── helpers ──────────────────────────────────────────────────────────────

function clampLimit(value: number | undefined, fallback: number): number {
  if (!value || !Number.isFinite(value) || value <= 0) return fallback
  return Math.min(Math.max(Math.floor(value), 1), 200)
}
