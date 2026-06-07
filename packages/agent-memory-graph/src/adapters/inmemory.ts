/**
 * InMemoryGraphClient — degraded fallback. Stores episodes verbatim,
 * never extracts entities/relations. Useful for tests and for keeping
 * agents alive when Zep isn't configured: searchNodes returns empty,
 * which the callers already treat as "no prior context".
 */

import type {
  Entity,
  GraphSearchOpts,
  MemoryEpisode,
  MemoryGraphClient,
  Relation,
} from '../types'

export class InMemoryGraphClient implements MemoryGraphClient {
  episodes: MemoryEpisode[] = []
  async addEpisode(ep: MemoryEpisode): Promise<{ uuid: string }> {
    const uuid = `local-${this.episodes.length + 1}`
    this.episodes.push(ep)
    return { uuid }
  }
  async searchNodes(opts: GraphSearchOpts): Promise<Entity[]> {
    return this.matching(opts).slice(0, opts.limit ?? 10).map((ep, i) => ({
      uuid: `node-${i}`,
      name: ep.content.slice(0, 60),
      labels: [ep.source],
      summary: ep.content,
      group_id: ep.group_id,
    }))
  }
  async searchEdges(): Promise<Relation[]> {
    return []
  }
  async recall(group_id: string, query: string, limit = 10) {
    const entities = await this.searchNodes({ query, group_id, limit })
    return { entities, relations: [] as Relation[] }
  }
  private matching(opts: GraphSearchOpts): MemoryEpisode[] {
    const q = opts.query.toLowerCase()
    return this.episodes.filter((e) =>
      (!opts.group_id || e.group_id === opts.group_id) &&
      e.content.toLowerCase().includes(q),
    )
  }
}
