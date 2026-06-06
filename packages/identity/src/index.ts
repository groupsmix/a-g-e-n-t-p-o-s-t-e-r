/**
 * @posteragent/identity
 *
 * NEXUS identity layer.  Exports:
 *
 *   - SOUL loading:           DEFAULT_SOUL, FsSoulLoader, KvSoulLoader,
 *                             StaticSoulLoader, CachedSoulLoader
 *   - Prompt assembly:        assembleSystemPrompt
 *   - Journal:                Journal, JournalEntry, JournalOutcome
 *   - NOW scratchpad:         NowScratchpad, NowEntry
 *   - Persona traits:         PersonaStore, PersonaTrait
 *
 * Plus an `IdentityLayer` convenience wrapper that bundles them all
 * around a single D1 binding.
 */

import type { D1Database } from '@posteragent/memory'
import { Journal } from './journal.js'
import { NowScratchpad } from './now.js'
import { PersonaStore } from './persona.js'
import {
  type SoulLoader,
  CachedSoulLoader,
  StaticSoulLoader,
  DEFAULT_SOUL,
  assembleSystemPrompt,
} from './soul.js'

export {
  DEFAULT_SOUL,
  FsSoulLoader,
  KvSoulLoader,
  StaticSoulLoader,
  CachedSoulLoader,
  assembleSystemPrompt,
} from './soul.js'
export type { SoulLoader, KVNamespaceLike, SystemPromptParts } from './soul.js'

export { Journal } from './journal.js'
export type { JournalEntry, JournalOutcome, AppendJournalInput } from './journal.js'

export { NowScratchpad } from './now.js'
export type { NowEntry, SetNowOptions } from './now.js'

export { PersonaStore } from './persona.js'
export type { PersonaTrait, SetTraitInput } from './persona.js'

// ─── Convenience wrapper ────────────────────────────────────────────────────

export interface IdentityLayerOptions {
  /** Loader for SOUL.md.  Defaults to a cached static loader with DEFAULT_SOUL. */
  soulLoader?: SoulLoader
}

/**
 * Bundles SOUL + journal + NOW + persona around a single D1 binding so
 * agents can `new IdentityLayer(db)` and get the whole brain surface.
 *
 * Provides `.buildSystemPrompt(opts)` — the one-stop call that BaseAgent
 * uses to compose the per-task system message.
 */
export class IdentityLayer {
  readonly journal: Journal
  readonly now: NowScratchpad
  readonly persona: PersonaStore
  readonly soul: SoulLoader

  constructor(db: D1Database, opts: IdentityLayerOptions = {}) {
    this.journal = new Journal(db)
    this.now = new NowScratchpad(db)
    this.persona = new PersonaStore(db)
    this.soul = opts.soulLoader ?? new CachedSoulLoader(new StaticSoulLoader(DEFAULT_SOUL))
  }

  /** Compose the system prompt for an agent run. */
  async buildSystemPrompt(opts: {
    agent?: string
    channel?: string
    nowScope?: string
    memories?: string[]
    maxPersonaTraits?: number
  } = {}): Promise<string> {
    const [soul, persona, now] = await Promise.all([
      this.soul.load(),
      this.persona.resolve({
        agent: opts.agent,
        channel: opts.channel,
        maxTraits: opts.maxPersonaTraits ?? 12,
      }),
      this.now.getText(opts.nowScope ?? 'global'),
    ])

    return assembleSystemPrompt({
      soul,
      now,
      persona,
      memories: opts.memories,
    })
  }
}
