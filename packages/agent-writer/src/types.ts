/**
 * Writer Agent types (TASK-601).
 *
 * One brief, many formats.  A FormatSpec encodes a per-format prompt
 * + structural constraints (max chars, parts, etc.); the writer loop
 * is uniform.  Output for every format is a WriterDraft with a typed
 * `parts` array so downstream publishers know how to slice (e.g. an
 * X thread is one draft with 5 parts).
 */

export type WriterFormat =
  | 'blog'
  | 'x-thread'
  | 'linkedin'
  | 'instagram'
  | 'tiktok'
  | 'youtube'
  | 'newsletter'
  | 'product-copy'
  | 'cold-email'

export interface WriterBrief {
  /** What we're writing about. */
  topic: string
  /** The hook / angle the planner picked. */
  angle: string
  /** Optional reference URLs (research, source post, etc.). */
  references?: string[]
  /** Tone hints. */
  voice?: string
  /** Audience descriptor. */
  audience?: string
  /** Optional call-to-action. */
  cta?: string
}

export interface WriterDraft {
  format: WriterFormat
  /** Headline / subject / first-tweet etc. */
  title: string
  /** Ordered post body. Each `parts` entry is one publishable unit. */
  parts: string[]
  /** Free-form metadata for the publisher (hashtags, link, etc.). */
  meta?: Record<string, unknown>
}

export interface WriterRequest {
  brief: WriterBrief
  formats: WriterFormat[]
}

export interface WriterReport {
  brief: WriterBrief
  drafts: WriterDraft[]
  skipped: WriterFormat[]
  usage: { inputTokens: number; outputTokens: number }
}

// ── LLM ────────────────────────────────────────────────────────────────────

export interface LLMClient {
  complete(args: {
    system?: string
    messages: Array<{ role: 'user' | 'assistant'; content: string }>
    maxTokens?: number
    temperature?: number
    json?: boolean
  }): Promise<{ content: string; inputTokens?: number; outputTokens?: number }>
}
