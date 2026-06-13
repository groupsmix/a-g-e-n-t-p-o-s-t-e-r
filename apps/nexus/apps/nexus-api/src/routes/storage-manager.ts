/**
 * /api/storage — Storage Manager
 *
 * Full CRUD over R2 (ASSETS bucket) and KV (CONFIG namespace)
 * directly from the dashboard — no Cloudflare dashboard needed.
 *
 * R2 (files):
 *   GET    /api/storage/r2/list            list objects (prefix, cursor, limit)
 *   GET    /api/storage/r2/object/*key     download / read file
 *   PUT    /api/storage/r2/object/*key     upload a file
 *   DELETE /api/storage/r2/object/*key     delete one file
 *   POST   /api/storage/r2/delete-batch    delete up to 100 keys at once
 *   DELETE /api/storage/r2/empty           delete ALL objects (empty bucket)
 *   GET    /api/storage/r2/stats           object count + approx total size
 *
 * KV (config / cache):
 *   GET    /api/storage/kv/list            list keys (prefix, cursor, limit)
 *   GET    /api/storage/kv/key/*key        get a KV value
 *   PUT    /api/storage/kv/key/*key        set a KV value
 *   DELETE /api/storage/kv/key/*key        delete one key
 *   POST   /api/storage/kv/delete-batch    delete multiple keys
 *   DELETE /api/storage/kv/empty           delete ALL keys matching optional prefix
 *   GET    /api/storage/kv/stats           key count + sample of largest keys
 */

import { Hono } from 'hono'
import type { Env } from '../env'

export const storageRoutes = new Hono<{ Bindings: Env }>()

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

// ── R2 — list ────────────────────────────────────────────────────────────────
storageRoutes.get('/r2/list', async (c) => {
  const prefix  = c.req.query('prefix')  ?? ''
  const cursor  = c.req.query('cursor')  ?? undefined
  const limit   = Math.min(parseInt(c.req.query('limit') ?? '100'), 500)
  const delim   = c.req.query('delim') === '0' ? undefined : '/'

  const result = await c.env.ASSETS.list({
    prefix:    prefix || undefined,
    cursor:    cursor || undefined,
    limit,
    delimiter: delim,
  })

  const objects = result.objects.map(o => ({
    key:          o.key,
    size:         o.size,
    size_human:   fmtBytes(o.size),
    uploaded:     o.uploaded?.toISOString() ?? null,
    etag:         o.etag,
    content_type: o.httpMetadata?.contentType ?? null,
  }))

  const prefixes = (result as { delimitedPrefixes?: string[] }).delimitedPrefixes ?? []

  return c.json({
    objects,
    prefixes,
    truncated: result.truncated,
    cursor:    result.truncated ? result.cursor : null,
    count:     objects.length,
  })
})

// ── R2 — stats ────────────────────────────────────────────────────────────────
storageRoutes.get('/r2/stats', async (c) => {
  let count = 0
  let totalSize = 0
  let cursor: string | undefined

  // Walk the entire bucket (up to 10k objects for stats)
  for (let page = 0; page < 100; page++) {
    const result = await c.env.ASSETS.list({ limit: 100, cursor, delimiter: undefined })
    for (const o of result.objects) {
      count++
      totalSize += o.size
    }
    if (!result.truncated) break
    cursor = result.cursor
  }

  return c.json({
    count,
    total_size: totalSize,
    total_size_human: fmtBytes(totalSize),
  })
})

// ── R2 — get/download one object ─────────────────────────────────────────────
storageRoutes.get('/r2/object/*', async (c) => {
  const key = c.req.param('*') ?? c.req.path.replace('/api/storage/r2/object/', '')
  const object = await c.env.ASSETS.get(key)
  if (!object) return c.json({ error: 'not found' }, 404)

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('etag', object.httpEtag)
  headers.set('content-length', String(object.size))
  headers.set('content-disposition', `attachment; filename="${key.split('/').pop()}"`)

  return new Response(object.body, { headers })
})

// ── R2 — upload one object ────────────────────────────────────────────────────
storageRoutes.put('/r2/object/*', async (c) => {
  const key = c.req.param('*') ?? c.req.path.replace('/api/storage/r2/object/', '')
  const contentType = c.req.header('content-type') ?? 'application/octet-stream'
  const body = await c.req.arrayBuffer()

  await c.env.ASSETS.put(key, body, {
    httpMetadata: { contentType },
  })

  return c.json({ ok: true, key, size: body.byteLength, size_human: fmtBytes(body.byteLength) }, 201)
})

// ── R2 — delete one object ────────────────────────────────────────────────────
storageRoutes.delete('/r2/object/*', async (c) => {
  const key = c.req.param('*') ?? c.req.path.replace('/api/storage/r2/object/', '')
  await c.env.ASSETS.delete(key)
  return c.json({ ok: true, key })
})

// ── R2 — batch delete ─────────────────────────────────────────────────────────
storageRoutes.post('/r2/delete-batch', async (c) => {
  let body: { keys?: string[] } = {}
  try { body = await c.req.json() } catch { return c.json({ error: 'invalid JSON' }, 400) }

  const { keys = [] } = body
  if (!Array.isArray(keys) || keys.length === 0) return c.json({ error: 'keys array required' }, 400)
  if (keys.length > 100) return c.json({ error: 'max 100 keys per batch' }, 400)

  await c.env.ASSETS.delete(keys)
  return c.json({ ok: true, deleted: keys.length })
})

// ── R2 — empty entire bucket ──────────────────────────────────────────────────
storageRoutes.delete('/r2/empty', async (c) => {
  const prefix = c.req.query('prefix') ?? ''
  let deleted = 0
  let cursor: string | undefined

  while (true) {
    const result = await c.env.ASSETS.list({ limit: 100, cursor, prefix: prefix || undefined, delimiter: undefined })
    if (result.objects.length === 0) break

    const keys = result.objects.map(o => o.key)
    await c.env.ASSETS.delete(keys)
    deleted += keys.length

    if (!result.truncated) break
    cursor = result.cursor
  }

  return c.json({ ok: true, deleted, prefix: prefix || '(all)' })
})

// ── KV — list keys ────────────────────────────────────────────────────────────
storageRoutes.get('/kv/list', async (c) => {
  const prefix = c.req.query('prefix') ?? ''
  const cursor = c.req.query('cursor') ?? undefined
  const limit  = Math.min(parseInt(c.req.query('limit') ?? '100'), 1000)

  const result = await c.env.CONFIG.list({
    prefix:    prefix || undefined,
    cursor:    cursor || undefined,
    limit,
  })

  return c.json({
    keys:      result.keys.map(k => ({ name: k.name, expiration: k.expiration ?? null, metadata: k.metadata ?? null })),
    truncated: result.list_complete === false,
    cursor:    result.list_complete === false ? result.cursor : null,
    count:     result.keys.length,
  })
})

// ── KV — stats ────────────────────────────────────────────────────────────────
storageRoutes.get('/kv/stats', async (c) => {
  let count = 0
  let cursor: string | undefined

  // Walk all keys (paginated)
  for (let page = 0; page < 1000; page++) {
    const result = await c.env.CONFIG.list({ limit: 1000, cursor })
    count += result.keys.length
    if (result.list_complete !== false) break
    cursor = result.list_complete === false ? result.cursor : undefined
  }

  return c.json({ count })
})

// ── KV — get one key ──────────────────────────────────────────────────────────
storageRoutes.get('/kv/key/*', async (c) => {
  const key = c.req.param('*') ?? c.req.path.replace('/api/storage/kv/key/', '')
  const value = await c.env.CONFIG.get(key)
  if (value === null) return c.json({ error: 'key not found' }, 404)
  return c.json({ key, value })
})

// ── KV — set one key ──────────────────────────────────────────────────────────
storageRoutes.put('/kv/key/*', async (c) => {
  const key = c.req.param('*') ?? c.req.path.replace('/api/storage/kv/key/', '')
  let body: { value?: string; ttl?: number } = {}
  try { body = await c.req.json() } catch { return c.json({ error: 'invalid JSON' }, 400) }
  const { value = '', ttl } = body

  await c.env.CONFIG.put(key, value, ttl ? { expirationTtl: ttl } : undefined)
  return c.json({ ok: true, key })
})

// ── KV — delete one key ───────────────────────────────────────────────────────
storageRoutes.delete('/kv/key/*', async (c) => {
  const key = c.req.param('*') ?? c.req.path.replace('/api/storage/kv/key/', '')
  await c.env.CONFIG.delete(key)
  return c.json({ ok: true, key })
})

// ── KV — batch delete ─────────────────────────────────────────────────────────
storageRoutes.post('/kv/delete-batch', async (c) => {
  let body: { keys?: string[] } = {}
  try { body = await c.req.json() } catch { return c.json({ error: 'invalid JSON' }, 400) }
  const { keys = [] } = body
  if (!Array.isArray(keys) || keys.length === 0) return c.json({ error: 'keys array required' }, 400)

  await Promise.all(keys.map(k => c.env.CONFIG.delete(k)))
  return c.json({ ok: true, deleted: keys.length })
})

// ── KV — empty (all keys, or by prefix) ──────────────────────────────────────
storageRoutes.delete('/kv/empty', async (c) => {
  const prefix = c.req.query('prefix') ?? ''
  let deleted = 0
  let cursor: string | undefined

  while (true) {
    const result = await c.env.CONFIG.list({ limit: 1000, cursor, prefix: prefix || undefined })
    if (result.keys.length === 0) break

    await Promise.all(result.keys.map(k => c.env.CONFIG.delete(k.name)))
    deleted += result.keys.length

    if (result.list_complete !== false) break
    cursor = result.cursor
  }

  return c.json({ ok: true, deleted, prefix: prefix || '(all)' })
})

// ── D1 — list tables ──────────────────────────────────────────────────────────
storageRoutes.get('/d1/tables', async (c) => {
  const rows = await c.env.DB
    .prepare("SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name ASC")
    .all<{ name: string; type: string }>()
  return c.json({ tables: rows.results ?? [] })
})

// ── D1 — table info + first rows ──────────────────────────────────────────────
storageRoutes.get('/d1/table/:name', async (c) => {
  const name = c.req.param('name').replace(/[^a-zA-Z0-9_]/g, '')
  if (!name) return c.json({ error: 'invalid table name' }, 400)
  try {
    const [schema, rows] = await Promise.all([
      c.env.DB.prepare(`PRAGMA table_info("${name}")`).all<Record<string, unknown>>(),
      c.env.DB.prepare(`SELECT * FROM "${name}" LIMIT 100`).all<Record<string, unknown>>(),
    ])
    const count = await c.env.DB.prepare(`SELECT COUNT(*) as n FROM "${name}"`).first<{ n: number }>()
    return c.json({ table: name, schema: schema.results ?? [], rows: rows.results ?? [], total: count?.n ?? 0 })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})

// ── D1 — execute SQL ──────────────────────────────────────────────────────────
storageRoutes.post('/d1/query', async (c) => {
  let body: { sql?: string; readonly?: boolean } = {}
  try { body = await c.req.json() } catch { return c.json({ error: 'invalid JSON' }, 400) }
  const { sql = '', readonly = true } = body
  if (!sql.trim()) return c.json({ error: 'sql is required' }, 400)

  // Safety: block destructive schema ops
  const upper = sql.trim().toUpperCase()
  const blocked = ['DROP TABLE','DROP DATABASE','TRUNCATE','ALTER TABLE','ATTACH','DETACH','VACUUM','PRAGMA']
  const blocked_stmt = blocked.find(b => upper.startsWith(b))
  if (blocked_stmt) return c.json({ error: `${blocked_stmt} is not allowed from the dashboard` }, 403)

  // If readonly mode, only allow SELECT/EXPLAIN/PRAGMA table_info
  if (readonly && !upper.startsWith('SELECT') && !upper.startsWith('EXPLAIN') && !upper.startsWith('WITH')) {
    return c.json({ error: 'Only SELECT statements are allowed in read-only mode' }, 403)
  }

  try {
    const t0 = Date.now()
    const result = await c.env.DB.prepare(sql).all<Record<string, unknown>>()
    const elapsed = Date.now() - t0
    return c.json({ rows: result.results ?? [], count: (result.results ?? []).length, elapsed_ms: elapsed })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})
