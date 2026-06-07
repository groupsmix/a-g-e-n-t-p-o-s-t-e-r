/**
 * Affiliate monitor contracts (TASK-802).
 *
 * The agent watches a catalog of TrackedProducts across affiliate
 * networks (Amazon Associates, generic). When a snapshot reveals a
 * price drop past a threshold or a new release, it emits an Alert
 * and (optionally) drafts a review post the publisher can ship.
 */

export type Network = 'amazon' | 'generic'

export interface TrackedProduct {
  id: string
  network: Network
  /** ASIN for Amazon; URL or sku for generic. */
  external_id: string
  title: string
  niche: string
  /** Base affiliate URL (Amazon: associate-tagged product link; generic: deep link). */
  affiliate_url: string
  /** Currency code for the snapshot price. */
  currency: string
  /** Drop threshold as a fraction (0.15 = 15%). */
  drop_threshold?: number
  /** When true, watch for any release post-last_seen_release_at. */
  watch_releases?: boolean
  last_seen_release_at?: string | null
}

export interface ProductSnapshot {
  product_id: string
  captured_at: string
  price: number
  currency: string
  in_stock: boolean
  rating?: number
  review_count?: number
  /** Free-form per-network breadcrumbs. */
  extra?: Record<string, string | number | boolean>
}

export type AlertKind = 'price-drop' | 'new-release' | 'back-in-stock' | 'rating-jump'

export interface AffiliateAlert {
  kind: AlertKind
  product: TrackedProduct
  snapshot: ProductSnapshot
  /** Prior snapshot for context (null when no history). */
  prior: ProductSnapshot | null
  /** delta_pct only for price-drop / rating-jump. */
  delta_pct?: number
  generated_at: string
}

export interface ProductFetcher {
  network: Network
  /** Returns a fresh snapshot for the given external_id. */
  fetch(product: TrackedProduct): Promise<ProductSnapshot>
}

export interface SnapshotHistory {
  insert(snapshot: ProductSnapshot): Promise<void>
  /** Most-recent prior snapshot before captured_at, or null. */
  prior(productId: string, beforeIso: string): Promise<ProductSnapshot | null>
}

export interface ReviewDraft {
  product_id: string
  alert_kind: AlertKind
  title: string
  body: string
  /** Affiliate URL the publisher should ship the post against. */
  affiliate_url: string
  generated_at: string
}

export interface ReviewWriterAdapter {
  draft(input: { product: TrackedProduct; alert: AffiliateAlert }): Promise<ReviewDraft>
}
