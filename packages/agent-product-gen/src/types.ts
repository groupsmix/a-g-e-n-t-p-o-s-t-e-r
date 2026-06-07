/**
 * Product Generator types (TASK-502).
 *
 * Four product kinds share a uniform pipeline:
 *   outlineProduct → generateProduct → packageProduct → listProduct
 *
 * Each kind brings its own outliner + writer functions; the orchestrator
 * dispatches on `brief.kind`.  The packager always produces a list of
 * Asset blobs (markdown / json / txt) the storefront adapter uploads.
 */

export type ProductKind = 'ebook' | 'prompt-pack' | 'template-pack' | 'mini-course'

export interface ProductBrief {
  kind: ProductKind
  topic: string
  audience?: string
  voice?: string
  /** Suggested retail price in USD; the listing adapter is free to ignore. */
  priceUsd?: number
  /** Number of chapters / prompts / templates / lessons. */
  units?: number
}

export interface ProductOutline {
  kind: ProductKind
  title: string
  summary: string
  units: Array<{ title: string; brief: string }>
}

export interface ProductAsset {
  /** filename within the bundle */
  filename: string
  /** mime type for upload */
  mime: string
  /** content; string for text/markdown, Uint8Array for binaries */
  body: string | Uint8Array
}

export interface PackagedProduct {
  brief: ProductBrief
  outline: ProductOutline
  /** Sales-page copy (markdown). */
  salesCopy: string
  /** Files that make up the deliverable. */
  assets: ProductAsset[]
}

export interface ListedProduct {
  ok: boolean
  productId?: string
  productUrl?: string
  error?: string
  provider: 'gumroad' | 'dry-run'
}

export interface ProductReport {
  brief: ProductBrief
  outline: ProductOutline
  packaged: PackagedProduct
  listed: ListedProduct
}

// ── Client interfaces ───────────────────────────────────────────────────────

export interface LLMClient {
  complete(args: {
    system?: string
    messages: Array<{ role: 'user' | 'assistant'; content: string }>
    maxTokens?: number
    temperature?: number
    json?: boolean
  }): Promise<{ content: string; inputTokens?: number; outputTokens?: number }>
}

export interface StorefrontClient {
  list(args: {
    title: string
    description: string
    priceUsd: number
    assets: ProductAsset[]
  }): Promise<ListedProduct>
}
