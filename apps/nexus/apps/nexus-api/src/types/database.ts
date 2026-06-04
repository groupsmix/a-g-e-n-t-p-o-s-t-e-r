// ============================================================
// Database Type Definitions
// ============================================================
// Type definitions for Cloudflare D1 database query results.
// These types replace `as any` casts to enable compile-time type checking.

/**
 * Represents a single value that can be returned from a D1 query.
 * D1 columns can contain strings, numbers, booleans, or null values.
 */
export type D1QueryValue = string | number | boolean | null

/**
 * Represents a single row returned from a D1 query.
 * Each row is an object where column names map to their values.
 * 
 * @example
 * const row: D1ResultRow = {
 *   id: '123',
 *   name: 'Product Name',
 *   price: 29.99,
 *   is_active: true,
 *   deleted_at: null
 * }
 */
export type D1ResultRow = Record<string, D1QueryValue>
