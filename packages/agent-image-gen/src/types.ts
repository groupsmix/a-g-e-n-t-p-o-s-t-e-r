/**
 * Image Gen Agent types (TASK-604).
 *
 * Use cases:
 *  - Thumbnails for YouTube
 *  - Blog hero / OG cards
 *  - Instagram tiles
 *  - Product mockups
 *
 * One pipeline:
 *   buildPrompt → generateBatch → variants (aspect-aware crops) →
 *   storeImages → return Asset[]
 */

export type ImageAspect = '1:1' | '16:9' | '9:16' | '4:5' | '3:2'

export interface ImageBrief {
  /** What we want in the image, plain English. */
  prompt: string
  /** Style hint: 'photo' / 'illustration' / 'minimal' / 'cinematic' / etc. */
  style?: string
  /** Brand palette hint. */
  palette?: string[]
  /** Target aspects; one image per aspect. */
  aspects?: ImageAspect[]
  /** How many variants per aspect. */
  variants?: number
  /** Optional negative prompt. */
  negative?: string
  /** Seed for reproducibility. */
  seed?: number
}

export interface GeneratedImage {
  /** stable id within this run */
  id: string
  prompt: string
  aspect: ImageAspect
  /** PNG/JPG base64 */
  imageBase64: string
  mime: string
  /** Source provider for the asset. */
  provider: string
  /** Width × height in px, when reported. */
  width?: number
  height?: number
}

export interface StoredImage extends GeneratedImage {
  url: string
  storageId?: string
}

export interface ImageReport {
  brief: ImageBrief
  prompt: string
  images: StoredImage[]
  /** Indices of attempts that failed. */
  failures: Array<{ aspect: ImageAspect; variant: number; error: string }>
}

// ── Clients ─────────────────────────────────────────────────────────────────

export interface ImageProvider {
  /** Provider name. */
  name: string
  /** Generate one image for the given prompt + aspect. */
  generate(args: {
    prompt: string
    aspect: ImageAspect
    seed?: number
    negative?: string
  }): Promise<GeneratedImage>
}

export interface ImageStore {
  put(args: {
    image: GeneratedImage
    name: string
  }): Promise<{ url: string; storageId?: string }>
}

export interface LLMClient {
  complete(args: {
    system?: string
    messages: Array<{ role: 'user' | 'assistant'; content: string }>
    maxTokens?: number
    temperature?: number
  }): Promise<{ content: string }>
}
