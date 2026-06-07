/**
 * SnapshotHistory implementations.
 *   InMemoryHistory — tests.
 *   D1History       — production over migration 029.
 */

import type { ProductSnapshot, SnapshotHistory } from '../types'

export class InMemoryHistory implements SnapshotHistory {
  private rows: ProductSnapshot[] = []
  async insert(snapshot: ProductSnapshot): Promise<void> {
    this.rows.push(snapshot)
  }
  async prior(productId: string, beforeIso: string): Promise<ProductSnapshot | null> {
    const candidates = this.rows
      .filter((r) => r.product_id === productId && r.captured_at < beforeIso)
      .sort((a, b) => b.captured_at.localeCompare(a.captured_at))
    return candidates[0] ?? null
  }
}

interface D1Like {
  prepare(sql: string): {
    bind(...args: unknown[]): {
      run(): Promise<unknown>
      first<T = unknown>(): Promise<T | null>
    }
  }
}

interface Row {
  product_id: string
  captured_at: string
  price: number
  currency: string
  in_stock: number
  rating: number | null
  review_count: number | null
  extra: string | null
}

export class D1History implements SnapshotHistory {
  constructor(private db: D1Like) {}
  async insert(s: ProductSnapshot): Promise<void> {
    await this.db
      .prepare(
        `INSERT OR IGNORE INTO product_snapshots
           (product_id, captured_at, price, currency, in_stock, rating, review_count, extra)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        s.product_id,
        s.captured_at,
        s.price,
        s.currency,
        s.in_stock ? 1 : 0,
        s.rating ?? null,
        s.review_count ?? null,
        s.extra ? JSON.stringify(s.extra) : null,
      )
      .run()
  }
  async prior(productId: string, beforeIso: string): Promise<ProductSnapshot | null> {
    const r = await this.db
      .prepare(
        `SELECT product_id, captured_at, price, currency, in_stock, rating, review_count, extra
           FROM product_snapshots
          WHERE product_id = ? AND captured_at < ?
          ORDER BY captured_at DESC LIMIT 1`,
      )
      .bind(productId, beforeIso)
      .first<Row>()
    if (!r) return null
    return {
      product_id: r.product_id,
      captured_at: r.captured_at,
      price: r.price,
      currency: r.currency,
      in_stock: !!r.in_stock,
      rating: r.rating ?? undefined,
      review_count: r.review_count ?? undefined,
      extra: r.extra ? JSON.parse(r.extra) : undefined,
    }
  }
}
