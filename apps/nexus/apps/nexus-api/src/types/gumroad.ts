// ============================================================
// Gumroad API Type Definitions
// ============================================================
// Type definitions for Gumroad API responses and internal
// publishing results. These types replace `as any` casts
// throughout the codebase to enable compile-time type checking.

/**
 * Represents a product from the Gumroad API.
 * Returned by list, create, and update product endpoints.
 */
export interface GumroadProduct {
  id: string
  name: string
  description: string | null
  price: number
  currency: string
  short_url: string
  published: boolean
  sales_count: number
  sales_usd_cents: number
  views_count: number
}

/**
 * Result type for Gumroad publishing operations.
 * Used internally to track the outcome of publishing a product to Gumroad.
 * 
 * Success case: ok=true, includes gumroad_product_id and gumroad_url
 * Error case: ok=false, includes error message
 */
export interface GumroadResult {
  ok: boolean
  gumroad_product_id?: string
  gumroad_url?: string
  error?: string
}

/**
 * Represents a sale from the Gumroad API.
 * Returned by the sales list endpoint.
 */
export interface GumroadSale {
  id: string
  email: string
  price: number
  product_id: string
  product_name: string
  created_at: string
  refunded: boolean
}

/**
 * Analytics data for a Gumroad product.
 * Aggregated from product data in the Gumroad API.
 */
export interface GumroadAnalytics {
  product_id: string
  views: number
  sales: number
  revenue_cents: number
}
