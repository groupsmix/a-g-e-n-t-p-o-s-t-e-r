/**
 * @posteragent/memory
 *
 * The brain layer's memory engine.  Public surface:
 *
 *   import {
 *     MemoryStore,
 *     MemoryRetriever,
 *     NullEmbeddingProvider,
 *     WorkersAIEmbeddingProvider,
 *     extractFromJournal,
 *     extractFromTaskResult,
 *     prune,
 *   } from '@posteragent/memory'
 *
 * Adapt freely — every consumer should only depend on the names exported
 * from here, never the file paths under `./src`.
 */

export { MemoryStore } from './store.js'
export type { PutOptions, ListOptions } from './store.js'

export { MemoryRetriever } from './retrieve.js'

export {
  NullEmbeddingProvider,
  WorkersAIEmbeddingProvider,
  cosineSimilarity,
  EMBEDDING_DIMS,
} from './embed.js'
export type {
  EmbeddingProvider,
  WorkersAIBinding,
} from './embed.js'

export {
  extractFromJournal,
  extractFromTaskResult,
} from './consolidate.js'
export type {
  JournalLike,
  ExtractableResult,
  TaskRefLike,
} from './consolidate.js'

export { prune, pruneExpired, pruneDuplicates } from './prune.js'
export type { PruneReport } from './prune.js'

export {
  STALENESS_WINDOWS,
  expiryFor,
  rowToMemoryItem,
} from './types.js'
export type {
  D1Database,
  D1PreparedStatement,
  MemoryRow,
  RetrieveOptions,
  ScoredMemory,
} from './types.js'

// Re-export the shared public types for convenience.
export type { MemoryItem, MemoryItemType } from '@posteragent/types'
