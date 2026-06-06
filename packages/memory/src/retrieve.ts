/**
 * @posteragent/memory/retrieve
 *
 * Hybrid retrieval with Reciprocal Rank Fusion (RRF).
 *
 *   1. FTS5 lexical search over memory_items_fts
 *   2. Vector cosine similarity (in-memory, fed by D1 rows w/ embeddings)
 *   3. Recency boost (most recent items get a small constant rank)
 *
 * Each lane produces a ranked list; RRF fuses them with k=60.  Lanes
 * without coverage (no embedding provider, no query string) are silently
 * skipped — never throw.
 *
 * Why no Vectorize here yet?  The D1-only path keeps the whole system
 * runnable in CI and local dev without provisioning a Vectorize index.
 * When the index lands, `vectorLane()` will switch to `index.query()`
 * and stop loading all embeddings into a Worker.
 */

import type { MemoryItem, MemoryItemType } from '@posteragent/types'
import { createLogger } from '@posteragent/logger'
import {
  type D1Database,
  type MemoryRow,
  type RetrieveOptions,
  type ScoredMemory,
  rowToMemoryItem,
} from './types.js'
import { type EmbeddingProvider, cosineSimilarity } from './embed.js'

const log = createLogger('memory:retrieve')

const RRF_K = 60

export class MemoryRetriever {
  constructor(
    private db: D1Database,
    private embedder: EmbeddingProvider,
  ) {}

  async retrieve(query: string, opts: RetrieveOptions = {}): Promise<ScoredMemory[]> {
    const limit = opts.limit ?? 10

    // Pull from each lane in parallel.
    const [ftsHits, vectorHits] = await Promise.all([
      this.ftsLane(query, opts),
      this.vectorLane(query, opts),
    ])

    if (ftsHits.length === 0 && vectorHits.length === 0) {
      // Fallback: most recent items in scope.  Useful when the query
      // is generic and lexical/vector both fired empty.
      return (await this.recencyLane(opts)).slice(0, limit)
    }

    return this.fuse(ftsHits, vectorHits, opts).slice(0, limit)
  }

  // ─── Lane 1: FTS5 keyword search ─────────────────────────────────────────

  private async ftsLane(query: string, opts: RetrieveOptions): Promise<MemoryItem[]> {
    const cleaned = sanitizeFtsQuery(query)
    if (!cleaned) return []

    const { whereClauses, binds } = scopeFilters(opts)
    const where = whereClauses.length ? `AND ${whereClauses.join(' AND ')}` : ''

    try {
      const result = await this.db
        .prepare(
          `SELECT m.id, m.type, m.content, m.source, m.embedding, m.tags,
                  m.expires_at, m.created_at, m.updated_at
           FROM memory_items m
           JOIN memory_items_fts f ON f.rowid = m.rowid
           WHERE memory_items_fts MATCH ?
                 AND (m.expires_at IS NULL OR m.expires_at > ?)
                 ${where}
           ORDER BY rank
           LIMIT 50`,
        )
        .bind(cleaned, new Date().toISOString(), ...binds)
        .all<MemoryRow>()

      return (result.results ?? []).map(rowToMemoryItem)
    } catch (err) {
      log.warn('fts lane failed', { err: String(err) })
      return []
    }
  }

  // ─── Lane 2: Vector cosine similarity ────────────────────────────────────

  private async vectorLane(query: string, opts: RetrieveOptions): Promise<MemoryItem[]> {
    const queryVec = await this.embedder.embed(query)
    if (!queryVec) return []

    const { whereClauses, binds } = scopeFilters(opts)
    const where = whereClauses.length ? `AND ${whereClauses.join(' AND ')}` : ''

    // Load candidate rows that have embeddings.  This is a full-table scan
    // in the worst case — fine for owner-scale data (thousands of rows).
    // Once we exceed ~10k rows, swap this for Vectorize.
    const result = await this.db
      .prepare(
        `SELECT id, type, content, source, embedding, tags,
                expires_at, created_at, updated_at
         FROM memory_items
         WHERE embedding IS NOT NULL
               AND (expires_at IS NULL OR expires_at > ?)
               ${where}
         LIMIT 1000`,
      )
      .bind(new Date().toISOString(), ...binds)
      .all<MemoryRow>()

    const scored = (result.results ?? [])
      .map((row) => {
        const item = rowToMemoryItem(row)
        const sim = item.embedding ? cosineSimilarity(queryVec, item.embedding) : 0
        return { item, sim }
      })
      .filter((x) => x.sim > 0.2) // hard floor — drop unrelated rows
      .sort((a, b) => b.sim - a.sim)
      .slice(0, 50)

    return scored.map((x) => x.item)
  }

  // ─── Lane 3: Recency fallback ────────────────────────────────────────────

  private async recencyLane(opts: RetrieveOptions): Promise<ScoredMemory[]> {
    const { whereClauses, binds } = scopeFilters(opts)
    const where = whereClauses.length ? `AND ${whereClauses.join(' AND ')}` : ''

    const result = await this.db
      .prepare(
        `SELECT id, type, content, source, embedding, tags,
                expires_at, created_at, updated_at
         FROM memory_items
         WHERE (expires_at IS NULL OR expires_at > ?)
               ${where}
         ORDER BY created_at DESC
         LIMIT 20`,
      )
      .bind(new Date().toISOString(), ...binds)
      .all<MemoryRow>()

    return (result.results ?? []).map((row, i) => ({
      item: rowToMemoryItem(row),
      score: 1 / (RRF_K + i + 1),
      lanes: ['recency' as const],
    }))
  }

  // ─── Reciprocal Rank Fusion ──────────────────────────────────────────────

  private fuse(
    fts: MemoryItem[],
    vector: MemoryItem[],
    opts: RetrieveOptions,
  ): ScoredMemory[] {
    const ftsWeight = opts.ftsWeight ?? 0.5
    const vectorWeight = opts.vectorWeight ?? 0.5
    const scores = new Map<string, ScoredMemory>()

    fts.forEach((item, i) => {
      const score = ftsWeight / (RRF_K + i + 1)
      scores.set(item.id, { item, score, lanes: ['fts'] })
    })

    vector.forEach((item, i) => {
      const score = vectorWeight / (RRF_K + i + 1)
      const existing = scores.get(item.id)
      if (existing) {
        existing.score += score
        existing.lanes.push('vector')
      } else {
        scores.set(item.id, { item, score, lanes: ['vector'] })
      }
    })

    return Array.from(scores.values()).sort((a, b) => b.score - a.score)
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function scopeFilters(opts: RetrieveOptions): {
  whereClauses: string[]
  binds: unknown[]
} {
  const whereClauses: string[] = []
  const binds: unknown[] = []

  if (opts.types && opts.types.length) {
    const placeholders = opts.types.map(() => '?').join(',')
    whereClauses.push(`type IN (${placeholders})`)
    for (const t of opts.types) binds.push(t)
  }

  if (opts.newerThan) {
    whereClauses.push('created_at > ?')
    binds.push(opts.newerThan.toISOString())
  }

  if (opts.anyTag && opts.anyTag.length) {
    const tagClauses = opts.anyTag.map(() => 'tags LIKE ?').join(' OR ')
    whereClauses.push(`(${tagClauses})`)
    for (const tag of opts.anyTag) binds.push(`%"${tag}"%`)
  }

  return { whereClauses, binds }
}

/**
 * FTS5 has special syntax (column filters, AND/OR, NEAR, etc.) that
 * blows up on user input containing things like apostrophes or quotes.
 * Strategy: extract alphanumeric tokens, OR them.  Conservative but safe.
 */
function sanitizeFtsQuery(input: string): string {
  if (!input) return ''
  const tokens = input
    .toLowerCase()
    .match(/[a-z0-9]+/g)
    ?.filter((t) => t.length >= 2)
  if (!tokens || tokens.length === 0) return ''
  // Quote each token to disable FTS operators inside it.
  return tokens.map((t) => `"${t}"`).join(' OR ')
}

// Re-export so consumers can import everything from one module.
export type { ScoredMemory, RetrieveOptions } from './types.js'
export type { MemoryItem, MemoryItemType }
