/**
 * @posteragent/memory/store
 *
 * D1-backed storage layer.  Writes flow through here:
 *
 *   put()    — single insert with optional embedding
 *   putMany()— batch insert (uses D1 batch when available)
 *   get()    — fetch by id
 *   list()   — paginate by type / source / tag
 *   update() — content + tags edit
 *   delete() — hard delete (FTS5 trigger cleans the index)
 *
 * Retrieval is the *read* path and lives in retrieve.ts so its scoring
 * logic can be unit-tested without going through the store.
 *
 * The store is constructed with a D1 binding + an embedding provider.
 * Pass `new NullEmbeddingProvider()` when you don't need vector search.
 */

import type { MemoryItem, MemoryItemType } from '@posteragent/types'
import { createLogger } from '@posteragent/logger'
import {
  type D1Database,
  type MemoryRow,
  expiryFor,
  rowToMemoryItem,
} from './types.js'
import type { EmbeddingProvider } from './embed.js'
import { NullEmbeddingProvider } from './embed.js'

const log = createLogger('memory:store')

export interface PutOptions {
  type: MemoryItemType
  content: string
  source?: string
  tags?: string[]
  /** Override the default staleness window for this item. */
  expiresAt?: Date | null
}

export interface ListOptions {
  type?: MemoryItemType
  source?: string
  anyTag?: string[]
  limit?: number
  offset?: number
}

export class MemoryStore {
  constructor(
    private db: D1Database,
    private embedder: EmbeddingProvider = new NullEmbeddingProvider(),
  ) {}

  async put(opts: PutOptions): Promise<MemoryItem> {
    const id = crypto.randomUUID().replace(/-/g, '')
    const now = new Date()
    const expiresAt = opts.expiresAt === undefined ? expiryFor(opts.type, now) : opts.expiresAt

    const embedding = await this.embedder.embed(opts.content)
    const embeddingJson = embedding ? JSON.stringify(embedding) : null
    const tagsJson = opts.tags && opts.tags.length ? JSON.stringify(opts.tags) : null

    await this.db
      .prepare(
        `INSERT INTO memory_items (id, type, content, source, embedding, tags, expires_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        opts.type,
        opts.content,
        opts.source ?? 'unknown',
        embeddingJson,
        tagsJson,
        expiresAt ? expiresAt.toISOString() : null,
        now.toISOString(),
        now.toISOString(),
      )
      .run()

    log.debug('memory.put', { id, type: opts.type, hasEmbedding: embedding !== null })

    return {
      id,
      type: opts.type,
      content: opts.content,
      source: opts.source ?? 'unknown',
      embedding: embedding ?? undefined,
      tags: opts.tags,
      createdAt: now,
      expiresAt: expiresAt ?? undefined,
    }
  }

  async putMany(items: PutOptions[]): Promise<MemoryItem[]> {
    // No D1 batch helper here — embeddings need to be computed in parallel
    // and the batch must serialize their results.  Sequential insert is
    // fine; this is rarely a hot path.
    const out: MemoryItem[] = []
    for (const item of items) out.push(await this.put(item))
    return out
  }

  async get(id: string): Promise<MemoryItem | null> {
    const row = await this.db
      .prepare(`SELECT id, type, content, source, embedding, tags, expires_at, created_at, updated_at
                FROM memory_items WHERE id = ?`)
      .bind(id)
      .first<MemoryRow>()
    return row ? rowToMemoryItem(row) : null
  }

  async list(opts: ListOptions = {}): Promise<MemoryItem[]> {
    const clauses: string[] = []
    const binds: unknown[] = []

    if (opts.type) {
      clauses.push('type = ?')
      binds.push(opts.type)
    }
    if (opts.source) {
      clauses.push('source = ?')
      binds.push(opts.source)
    }
    if (opts.anyTag && opts.anyTag.length) {
      // tags is a JSON array string; LIKE match each tag as a quoted token.
      // Good enough for owner-scale data; swap for a tags-join table if it grows.
      const tagClauses = opts.anyTag.map(() => 'tags LIKE ?').join(' OR ')
      clauses.push(`(${tagClauses})`)
      for (const tag of opts.anyTag) binds.push(`%"${tag}"%`)
    }

    // Exclude expired rows by default.
    clauses.push('(expires_at IS NULL OR expires_at > ?)')
    binds.push(new Date().toISOString())

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
    const limit = opts.limit ?? 100
    const offset = opts.offset ?? 0

    const result = await this.db
      .prepare(
        `SELECT id, type, content, source, embedding, tags, expires_at, created_at, updated_at
         FROM memory_items
         ${where}
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`,
      )
      .bind(...binds, limit, offset)
      .all<MemoryRow>()

    return (result.results ?? []).map(rowToMemoryItem)
  }

  async update(id: string, patch: { content?: string; tags?: string[] }): Promise<void> {
    const updates: string[] = ['updated_at = ?']
    const binds: unknown[] = [new Date().toISOString()]

    if (patch.content !== undefined) {
      updates.push('content = ?')
      binds.push(patch.content)
      // Re-embed when content changes.
      const embedding = await this.embedder.embed(patch.content)
      updates.push('embedding = ?')
      binds.push(embedding ? JSON.stringify(embedding) : null)
    }
    if (patch.tags !== undefined) {
      updates.push('tags = ?')
      binds.push(patch.tags.length ? JSON.stringify(patch.tags) : null)
    }

    binds.push(id)
    await this.db
      .prepare(`UPDATE memory_items SET ${updates.join(', ')} WHERE id = ?`)
      .bind(...binds)
      .run()
  }

  async delete(id: string): Promise<void> {
    await this.db.prepare('DELETE FROM memory_items WHERE id = ?').bind(id).run()
  }

  /** Count by type — useful for the Brain dashboard. */
  async stats(): Promise<Record<MemoryItemType, number>> {
    const result = await this.db
      .prepare(
        `SELECT type, COUNT(*) AS n FROM memory_items
         WHERE expires_at IS NULL OR expires_at > ?
         GROUP BY type`,
      )
      .bind(new Date().toISOString())
      .all<{ type: MemoryItemType; n: number }>()

    const out: Record<MemoryItemType, number> = {
      identity: 0,
      preference: 0,
      project: 0,
      event: 0,
      fact: 0,
    }
    for (const row of result.results ?? []) out[row.type] = row.n
    return out
  }
}
