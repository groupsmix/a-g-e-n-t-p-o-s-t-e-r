/**
 * @posteragent/identity/soul
 *
 * SOUL.md is the assistant's character.  It gets concatenated into every
 * agent's system prompt by BaseAgent.buildSystemPrompt() (TASK-302).
 *
 * The canonical copy lives at packages/identity/data/SOUL.md.
 *
 * Loading strategies:
 *
 *   • Node side (CLI, tests, server)  — `loadSoulFromFs(rootDir?)` reads
 *     the markdown file directly.
 *
 *   • Cloudflare Worker side         — `loadSoulFromKV(kv, key?)` reads
 *     from a KV namespace.  Deploy step should `wrangler kv:key put SOUL.md`
 *     so the file is co-located with the Worker, not bundled as a string.
 *
 *   • As a last resort               — `DEFAULT_SOUL` is the in-source
 *     fallback, used when neither FS nor KV is available.  Keeps agents
 *     functional even in a minimal config.
 */

import { createLogger } from '@posteragent/logger'

const log = createLogger('identity:soul')

export interface SoulLoader {
  load(): Promise<string>
}

// The in-source fallback.  Intentionally short — the full text lives in
// packages/identity/data/SOUL.md and should be loaded from there in any
// real deployment.  This baseline keeps agents shaped correctly even when
// the FS or KV isn't reachable.
export const DEFAULT_SOUL = `You are NEXUS. The owner's personal AI operations engine.
Your job is to make them money, build their products, grow their audience,
and handle everything they don't want to manually do.

You are direct, efficient, and proactive. You use data to decide, not
guesses. You remember what worked and what didn't. You learn from every
task. When unsure, ask one clarifying question, not five. Ship fast and
improve iteratively. Never use em-dash characters.`

// ─── Filesystem loader (Node only) — REMOVED ────────────────────────────────
//
// `FsSoulLoader` was removed (AUDIT-PR20 dead-code). It had zero non-self
// consumers and a filesystem loader is inappropriate for the Workers
// runtime where this package actually runs. Use `KvSoulLoader` in
// Workers, `StaticSoulLoader(DEFAULT_SOUL)` elsewhere.

// ─── KV loader (Cloudflare Workers) ─────────────────────────────────────────

export interface KVNamespaceLike {
  get(key: string): Promise<string | null>
}

export class KvSoulLoader implements SoulLoader {
  constructor(
    private kv: KVNamespaceLike,
    private key = 'SOUL.md',
  ) {}

  async load(): Promise<string> {
    try {
      const val = await this.kv.get(this.key)
      return val?.trim() || DEFAULT_SOUL
    } catch (err) {
      log.warn('KvSoulLoader fell back to DEFAULT_SOUL', { err: String(err) })
      return DEFAULT_SOUL
    }
  }
}

// ─── Static loader (tests, ephemeral configs) ───────────────────────────────

export class StaticSoulLoader implements SoulLoader {
  constructor(private text: string) {}
  async load(): Promise<string> {
    return this.text
  }
}

// ─── Memoised wrapper ──────────────────────────────────────────────────────
// Reading SOUL.md on every agent call is wasteful.  Wrap any loader to
// cache the result for the lifetime of the process (or until invalidate()).

export class CachedSoulLoader implements SoulLoader {
  private cache: Promise<string> | null = null
  constructor(private inner: SoulLoader) {}

  async load(): Promise<string> {
    if (!this.cache) this.cache = this.inner.load()
    return this.cache
  }

  invalidate(): void {
    this.cache = null
  }
}

// ─── System-prompt assembly ────────────────────────────────────────────────
// What BaseAgent calls.  Joins SOUL.md, the NOW scratchpad, the persona
// traits, and any retrieved memories into a single deterministic block.

export interface SystemPromptParts {
  soul: string
  now?: string | null
  persona?: string[] // ordered, already filtered
  memories?: string[] // already retrieved + ranked
}

export function assembleSystemPrompt(parts: SystemPromptParts): string {
  const blocks: string[] = [parts.soul.trim()]

  if (parts.now && parts.now.trim()) {
    blocks.push(`# Current focus\n${parts.now.trim()}`)
  }

  if (parts.persona && parts.persona.length) {
    const lines = parts.persona.map((p) => `- ${p}`).join('\n')
    blocks.push(`# Persona traits\n${lines}`)
  }

  if (parts.memories && parts.memories.length) {
    const lines = parts.memories.map((m) => `- ${m}`).join('\n')
    blocks.push(`# Relevant context\n${lines}`)
  }

  return blocks.join('\n\n')
}
