/**
 * @posteragent/memory/embed
 *
 * Pluggable embedding provider.  Three implementations:
 *
 *   • NullProvider     — returns no embeddings (lexical retrieval only).
 *                        Used when no API key is configured.  Safe default.
 *
 *   • OpenAIProvider   — text-embedding-3-small (1536 dims, configurable).
 *                        Truncates to 384 dims for compatibility with the
 *                        DB schema and future Vectorize index.
 *
 *   • WorkersAIProvider — @cf/baai/bge-small-en-v1.5 via the Workers AI
 *                        binding.  Native 384 dims, no truncation.  This is
 *                        the preferred provider on Cloudflare.
 *
 * The retriever falls back gracefully when embedding fails — it just
 * doesn't fire the vector lane.  Never throws.
 */

import { createLogger } from '@posteragent/logger'

const log = createLogger('memory:embed')

export const EMBEDDING_DIMS = 384

export interface EmbeddingProvider {
  readonly name: string
  /** Returns null if embedding is unavailable for any reason.  Never throws. */
  embed(text: string): Promise<number[] | null>
}

// ─── Null (no-op) ────────────────────────────────────────────────────────────

export class NullEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'null'
  async embed(_text: string): Promise<number[] | null> {
    return null
  }
}

// ─── OpenAI ──────────────────────────────────────────────────────────────────

export interface OpenAIEmbedOptions {
  apiKey: string
  model?: string
  /** Cut the vector to this many dims (default: 384). */
  dims?: number
}

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'openai'
  private apiKey: string
  private model: string
  private dims: number

  constructor(opts: OpenAIEmbedOptions) {
    this.apiKey = opts.apiKey
    this.model = opts.model ?? 'text-embedding-3-small'
    this.dims = opts.dims ?? EMBEDDING_DIMS
  }

  async embed(text: string): Promise<number[] | null> {
    if (!text || text.length === 0) return null
    try {
      const res = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          // text-embedding-3-* supports `dimensions` for native truncation.
          dimensions: this.dims,
          input: text.slice(0, 8000), // hard cap on input length
        }),
      })
      if (!res.ok) {
        log.warn('openai embed failed', { status: res.status })
        return null
      }
      const json = (await res.json()) as { data?: Array<{ embedding: number[] }> }
      const vec = json.data?.[0]?.embedding
      if (!vec || vec.length === 0) return null
      // Defensive truncate in case the API ignores `dimensions`.
      return vec.length > this.dims ? vec.slice(0, this.dims) : vec
    } catch (err) {
      log.warn('openai embed threw', { err: String(err) })
      return null
    }
  }
}

// ─── Cloudflare Workers AI ───────────────────────────────────────────────────

/**
 * Structural type matching the Cloudflare Workers AI binding
 * (`c.env.AI`).  We avoid importing @cloudflare/workers-types here
 * so this package builds in Node too.
 */
export interface WorkersAIBinding {
  run(
    model: string,
    inputs: { text: string | string[] },
  ): Promise<{ data?: number[][]; shape?: number[] }>
}

export class WorkersAIEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'workers-ai'
  private ai: WorkersAIBinding
  private model: string

  constructor(ai: WorkersAIBinding, model = '@cf/baai/bge-small-en-v1.5') {
    this.ai = ai
    this.model = model
  }

  async embed(text: string): Promise<number[] | null> {
    if (!text) return null
    try {
      const res = await this.ai.run(this.model, { text: text.slice(0, 8000) })
      const vec = res.data?.[0]
      return vec && vec.length > 0 ? vec : null
    } catch (err) {
      log.warn('workers-ai embed threw', { err: String(err) })
      return null
    }
  }
}

// ─── Cosine similarity (used by the in-memory vector lane) ──────────────────

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!
    na += a[i]! * a[i]!
    nb += b[i]! * b[i]!
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}
