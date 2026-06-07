/**
 * Memory graph contracts (TASK-1000). A thin abstraction over Zep
 * Graphiti — entities, relations, and temporal episodes.
 *
 * Why an interface instead of using the Zep SDK directly: agents
 * call addEpisode / searchFacts in lots of places (research, lead
 * scrape, brand monitor, autonome). If we ever swap Zep for another
 * graph backend (a self-hosted Graphiti, Neo4j, or an in-memory
 * fallback), only the adapter changes.
 */

export type EpisodeSource = 'agent' | 'web' | 'email' | 'lead' | 'sale' | 'note' | 'other'

export interface MemoryEpisode {
  /** Free text or JSON-stringified facts. Graphiti extracts entities + edges from it. */
  content: string
  source: EpisodeSource
  /** Logical "thread" — usually a user or workspace id. */
  group_id: string
  reference_time?: string
  /** Adapter-specific metadata pass-through. */
  metadata?: Record<string, unknown>
}

export interface Entity {
  uuid: string
  name: string
  labels: string[]
  summary?: string
  group_id?: string
}

export interface Relation {
  uuid: string
  /** Subject and object entity uuids. */
  source_uuid: string
  target_uuid: string
  /** Predicate / fact (e.g. "works_at", "purchased", "mentioned"). */
  fact: string
  valid_from?: string
  valid_to?: string
  group_id?: string
}

export interface GraphSearchOpts {
  query: string
  group_id?: string
  limit?: number
}

export interface MemoryGraphClient {
  addEpisode(ep: MemoryEpisode): Promise<{ uuid: string }>
  searchNodes(opts: GraphSearchOpts): Promise<Entity[]>
  searchEdges(opts: GraphSearchOpts): Promise<Relation[]>
  /** Get N most-recent or most-relevant facts for a group_id. */
  recall(group_id: string, query: string, limit?: number): Promise<{ entities: Entity[]; relations: Relation[] }>
}
