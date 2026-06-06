/**
 * @posteragent/memory — internal type surface
 *
 * Public-facing memory shapes live in @posteragent/types so consumers
 * don't need to import this package just to type a MemoryItem.  This
 * file holds the *engine-level* types that don't belong in the shared
 * types package (DB row shapes, retrieval scoring, runtime interfaces).
 */

import type { MemoryItem, MemoryItemType } from '@posteragent/types'

// ─── Staleness windows (TASK-200) ────────────────────────────────────────────
// Per-type TTLs — copied from the V2 spec.  Identity entries never expire.
// All values in milliseconds for easy `Date.now() + WINDOW` arithmetic.

const DAY = 24 * 60 * 60 * 1000

export const STALENESS_WINDOWS: Record<MemoryItemType, number | null> = {
  identity: null, // never expires
  preference: 180 * DAY, // 6 months
  project: 90 * DAY, // 3 months
  event: 3 * DAY, // 3 days
  fact: 14 * DAY, // 2 weeks
}

/** Compute an expires_at Date for a new memory item, or null for identity. */
export function expiryFor(type: MemoryItemType, now: Date = new Date()): Date | null {
  const window = STALENESS_WINDOWS[type]
  return window === null ? null : new Date(now.getTime() + window)
}

// ─── Database row shape ──────────────────────────────────────────────────────

/** Raw row as it lives in D1. JSON columns are strings; dates are ISO strings. */
export interface MemoryRow {
  id: string
  type: MemoryItemType
  content: string
  source: string
  embedding: string | null // JSON array of numbers, or null
  tags: string | null // JSON array of strings, or null
  expires_at: string | null
  created_at: string
  updated_at: string
}

/** Convert a D1 row into the public MemoryItem shape. */
export function rowToMemoryItem(row: MemoryRow): MemoryItem {
  return {
    id: row.id,
    type: row.type,
    content: row.content,
    source: row.source,
    embedding: row.embedding ? JSON.parse(row.embedding) : undefined,
    tags: row.tags ? JSON.parse(row.tags) : undefined,
    createdAt: new Date(row.created_at),
    expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
  }
}

// ─── Retrieval ───────────────────────────────────────────────────────────────

export interface RetrieveOptions {
  /** Maximum number of items to return after fusion. */
  limit?: number
  /** Filter to specific memory types. */
  types?: MemoryItemType[]
  /** Filter by tag (memory must have at least one matching tag). */
  anyTag?: string[]
  /** Skip items older than this (in addition to expires_at). */
  newerThan?: Date
  /** Weight applied to FTS rank in RRF fusion (default 0.5). */
  ftsWeight?: number
  /** Weight applied to vector rank in RRF fusion (default 0.5). */
  vectorWeight?: number
}

export interface ScoredMemory {
  item: MemoryItem
  /** Reciprocal Rank Fusion score across the lanes that fired. */
  score: number
  /** Which retrieval lanes contributed. */
  lanes: Array<'fts' | 'vector' | 'recency'>
}

// ─── D1 binding (structural, no Cloudflare types dependency) ─────────────────
// We type the binding structurally so this package compiles in plain Node
// (for vitest) and in Workers without requiring @cloudflare/workers-types
// as a dependency.  Callers pass `c.env.DB` directly.

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement
  first<T = unknown>(): Promise<T | null>
  all<T = unknown>(): Promise<{ results?: T[]; meta?: unknown }>
  run(): Promise<{ meta?: unknown }>
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement
  batch?(statements: D1PreparedStatement[]): Promise<unknown[]>
}
