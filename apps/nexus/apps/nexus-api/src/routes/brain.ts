/**
 * /api/brain/* — read-only surface for the dashboard's Brain page.
 *
 *   GET /api/brain/summary           — top-of-page rollup
 *   GET /api/brain/memories          — list memory_items (filterable)
 *   GET /api/brain/journal           — list journal_entries
 *   GET /api/brain/persona           — SOUL.md + persona overrides
 *   GET /api/brain/now               — active scratchpad row (per scope)
 *   GET /api/brain/signals           — proactivity signals
 *
 * Shapes mirror `apps/dashboard/lib/brain/types.ts` so the dashboard's
 * `nexusApiSource` is a 1:1 passthrough.  Keep DTO field names in
 * lock-step with that file when schemas change.
 *
 * Writes live elsewhere — memories come in via task results + the
 * consolidation handler; journal via BaseAgent.afterRun; now via the
 * Settings page.  No mutation endpoints here.
 */

import { Hono } from 'hono'
import type { Env } from '../env'
import {
  getNow,
  getPersona,
  journalStats,
  listJournal,
  listMemories,
  memoryStats,
  type JournalEntryRow,
  type MemoryItemRow,
  type NowRow,
} from '../services/brain-store'
import { listSignals } from '../services/signals'

export const brainRoutes = new Hono<{ Bindings: Env }>()

// ── /api/brain/summary ──────────────────────────────────────────────────
  .get('/summary', async (c) => {
  const [memories, journal, persona, now, signals] = await Promise.all([
    memoryStats(c.env.DB),
    journalStats(c.env.DB),
    getPersona({ DB: c.env.DB, CONFIG: c.env.CONFIG }),
    getNow(c.env.DB, 'global'),
    listSignals(c.env.DB, { limit: 50 }),
  ])
  const urgent = signals.filter((s) => s.severity === 'urgent').length
  return c.json({
    source: 'nexus-api',
    summary: {
      memories,
      journal,
      signals: { total: signals.length, urgent },
      persona: {
        name: persona.name,
        emoji: persona.emoji,
        tagline: persona.tagline,
      },
      now: now
        ? {
            scope: now.scope,
            content: now.content,
            expiresInMs:
              new Date(now.expires_at).getTime() - Date.now(),
          }
        : null,
    },
  })
})


// ── /api/brain/memories ─────────────────────────────────────────────────
  .get('/memories', async (c) => {
  const type = c.req.query('type') as MemoryItemRow['type'] | undefined
  const memories = await listMemories(c.env.DB, {
    type,
    query: c.req.query('q') ?? undefined,
    limit: numberParam(c.req.query('limit'), 50),
  })
  return c.json({
    source: 'nexus-api',
    memories: memories.map(toMemoryDTO),
  })
})


// ── /api/brain/journal ──────────────────────────────────────────────────
  .get('/journal', async (c) => {
  const entries = await listJournal(c.env.DB, {
    sinceISO: c.req.query('since') ?? undefined,
    limit: numberParam(c.req.query('limit'), 50),
  })
  return c.json({
    source: 'nexus-api',
    entries: entries.map(toJournalDTO),
  })
})


// ── /api/brain/persona ──────────────────────────────────────────────────
  .get('/persona', async (c) => {
  const persona = await getPersona({ DB: c.env.DB, CONFIG: c.env.CONFIG })
  return c.json({
    source: 'nexus-api',
    persona,
  })
})


// ── /api/brain/now ──────────────────────────────────────────────────────
  .get('/now', async (c) => {
  const scope = c.req.query('scope') ?? 'global'
  const row = await getNow(c.env.DB, scope)
  return c.json({
    source: 'nexus-api',
    now: row ? toNowDTO(row) : null,
  })
})


// ── /api/brain/signals ──────────────────────────────────────────────────
  .get('/signals', async (c) => {
  const signals = await listSignals(c.env.DB, {
    limit: numberParam(c.req.query('limit'), 25),
  })
  return c.json({
    source: 'nexus-api',
    signals,
  })
})


// ── DTO mappers ─────────────────────────────────────────────────────────

function toMemoryDTO(row: MemoryItemRow) {
  return {
    id: row.id,
    type: row.type,
    content: row.content,
    tags: parseTags(row.tags),
    source: row.source,
    importance: 0.7,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}


function toJournalDTO(row: JournalEntryRow) {
  return {
    id: row.id,
    taskId: row.task_id,
    agentId: row.agent_id,
    summary: row.summary,
    outcome: row.outcome === 'noop' ? 'partial' : row.outcome,
    learnings: parseStringArray(row.learnings),
    followUps: parseStringArray(row.follow_ups),
    consolidated: row.consolidated === 1,
    createdAt: row.created_at,
  }
}


function toNowDTO(row: NowRow) {
  const expiresInMs = new Date(row.expires_at).getTime() - Date.now()
  return {
    scope: row.scope,
    content: row.content,
    setBy: row.set_by,
    expiresAt: row.expires_at,
    updatedAt: row.updated_at,
    expiresInMs,
  }
}


function parseTags(tags: string | null): string[] {
  if (!tags) return []
  try {
    const parsed = JSON.parse(tags)
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === 'string')
      : []
  } catch {
    return tags.split(',').map((s) => s.trim()).filter(Boolean)
  }
}


function parseStringArray(s: string | null): string[] {
  if (!s) return []
  try {
    const parsed = JSON.parse(s)
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === 'string')
      : []
  } catch {
    return []
  }
}


function numberParam(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback
  const n = parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 ? Math.min(n, 200) : fallback
}
