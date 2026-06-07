/**
 * Monitor — daily loop over every TrackedProduct. For each, calls
 * the right ProductFetcher, persists the snapshot, compares to the
 * prior snapshot, emits alerts on threshold breach. Per-product
 * errors are swallowed.
 */

import type {
  AffiliateAlert,
  Network,
  ProductFetcher,
  ProductSnapshot,
  SnapshotHistory,
  TrackedProduct,
} from '../types'

const DEFAULT_DROP_THRESHOLD = 0.15
const RATING_JUMP_THRESHOLD = 0.3

export interface MonitorInput {
  products: TrackedProduct[]
  fetchers: Partial<Record<Network, ProductFetcher>>
  history: SnapshotHistory
  now?: () => Date
}

export interface MonitorResult {
  attempted: number
  fetched: number
  failed: number
  unrouted: number
  alerts: AffiliateAlert[]
  errors: Array<{ product_id: string; error: string }>
}

function evaluate(
  product: TrackedProduct,
  snapshot: ProductSnapshot,
  prior: ProductSnapshot | null,
  now: Date,
): AffiliateAlert[] {
  const alerts: AffiliateAlert[] = []
  const threshold = product.drop_threshold ?? DEFAULT_DROP_THRESHOLD

  // back in stock
  if (prior && !prior.in_stock && snapshot.in_stock) {
    alerts.push({ kind: 'back-in-stock', product, snapshot, prior, generated_at: now.toISOString() })
  }

  // price-drop
  if (prior && prior.price > 0 && snapshot.price > 0) {
    const delta = (snapshot.price - prior.price) / prior.price
    if (delta <= -threshold) {
      alerts.push({
        kind: 'price-drop',
        product,
        snapshot,
        prior,
        delta_pct: Math.round(delta * 1000) / 10,
        generated_at: now.toISOString(),
      })
    }
  }

  // rating jump
  if (prior?.rating != null && snapshot.rating != null && prior.rating > 0) {
    const delta = snapshot.rating - prior.rating
    if (delta >= RATING_JUMP_THRESHOLD) {
      alerts.push({
        kind: 'rating-jump',
        product,
        snapshot,
        prior,
        delta_pct: Math.round((delta / prior.rating) * 1000) / 10,
        generated_at: now.toISOString(),
      })
    }
  }

  // new-release sentinel: extra.release_at fresher than tracker's last_seen_release_at
  if (product.watch_releases) {
    const releaseAt = String(snapshot.extra?.release_at ?? '')
    const lastSeen = product.last_seen_release_at ?? ''
    if (releaseAt && releaseAt > lastSeen) {
      alerts.push({ kind: 'new-release', product, snapshot, prior, generated_at: now.toISOString() })
    }
  }

  return alerts
}

export async function runMonitor(input: MonitorInput): Promise<MonitorResult> {
  const now = input.now?.() ?? new Date()
  const result: MonitorResult = {
    attempted: input.products.length,
    fetched: 0,
    failed: 0,
    unrouted: 0,
    alerts: [],
    errors: [],
  }
  for (const product of input.products) {
    const fetcher = input.fetchers[product.network]
    if (!fetcher) {
      result.unrouted += 1
      continue
    }
    try {
      const snap = await fetcher.fetch(product)
      const prior = await input.history.prior(product.id, snap.captured_at)
      await input.history.insert(snap)
      result.fetched += 1
      for (const a of evaluate(product, snap, prior, now)) result.alerts.push(a)
    } catch (err) {
      result.failed += 1
      result.errors.push({
        product_id: product.id,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }
  return result
}
