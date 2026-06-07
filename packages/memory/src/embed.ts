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

// ─── OpenAI — REMOVED ────────────────────────────────────────────────────────
//
// `OpenAIEmbeddingProvider` and `OpenAIEmbedOptions` were removed
// (AUDIT-PR20 dead-code). They had zero non-self consumers — the
// Workers runtime uses `WorkersAIEmbeddingProvider` and the default
// fallback is `NullEmbeddingProvider`. Re-add when a real OpenAI-backed
// memory pipeline is built.

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
