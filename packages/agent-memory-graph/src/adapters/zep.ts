/**
 * Zep Cloud client. Hits the Graphiti REST surface that ships with
 * Zep — /api/v2/graph/episode, /api/v2/graph/search/{nodes,edges}.
 * The Zep TypeScript SDK is heavier than we need; this stays a few
 * hundred lines.
 */

import type {
  Entity,
  GraphSearchOpts,
  MemoryEpisode,
  MemoryGraphClient,
  Relation,
} from '../types'

export interface ZepConfig {
  baseUrl?: string
  apiKey: string
}

interface ZepNode { uuid: string; name: string; labels?: string[]; summary?: string; group_id?: string }
interface ZepEdge { uuid: string; source_node_uuid: string; target_node_uuid: string; fact: string; valid_at?: string; invalid_at?: string; group_id?: string }

export class ZepGraphClient implements MemoryGraphClient {
  private base: string
  constructor(private cfg: ZepConfig, private fetcher: typeof fetch = fetch) {
    this.base = (cfg.baseUrl ?? 'https://api.getzep.com').replace(/\/$/, '')
  }

  private headers(): Record<string, string> {
    return {
      authorization: `Api-Key ${this.cfg.apiKey}`,
      'content-type': 'application/json',
    }
  }

  async addEpisode(ep: MemoryEpisode): Promise<{ uuid: string }> {
    const res = await this.fetcher(`${this.base}/api/v2/graph/episode`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        data: ep.content,
        type: ep.source === 'web' ? 'text' : 'message',
        source: ep.source,
        group_id: ep.group_id,
        reference_time: ep.reference_time,
        metadata: ep.metadata,
      }),
    })
    if (!res.ok) throw new Error(`zep episode ${res.status}: ${await safeText(res)}`)
    const json = (await res.json()) as { uuid?: string }
    return { uuid: json.uuid ?? '' }
  }

  async searchNodes(opts: GraphSearchOpts): Promise<Entity[]> {
    const res = await this.fetcher(`${this.base}/api/v2/graph/search`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ query: opts.query, group_id: opts.group_id, limit: opts.limit ?? 10, scope: 'nodes' }),
    })
    if (!res.ok) throw new Error(`zep search nodes ${res.status}: ${await safeText(res)}`)
    const json = (await res.json()) as { nodes?: ZepNode[] }
    return (json.nodes ?? []).map((n) => ({
      uuid: n.uuid,
      name: n.name,
      labels: n.labels ?? [],
      summary: n.summary,
      group_id: n.group_id,
    }))
  }

  async searchEdges(opts: GraphSearchOpts): Promise<Relation[]> {
    const res = await this.fetcher(`${this.base}/api/v2/graph/search`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ query: opts.query, group_id: opts.group_id, limit: opts.limit ?? 10, scope: 'edges' }),
    })
    if (!res.ok) throw new Error(`zep search edges ${res.status}: ${await safeText(res)}`)
    const json = (await res.json()) as { edges?: ZepEdge[] }
    return (json.edges ?? []).map((e) => ({
      uuid: e.uuid,
      source_uuid: e.source_node_uuid,
      target_uuid: e.target_node_uuid,
      fact: e.fact,
      valid_from: e.valid_at,
      valid_to: e.invalid_at,
      group_id: e.group_id,
    }))
  }

  async recall(group_id: string, query: string, limit = 10) {
    const [entities, relations] = await Promise.all([
      this.searchNodes({ query, group_id, limit }),
      this.searchEdges({ query, group_id, limit }),
    ])
    return { entities, relations }
  }
}

async function safeText(res: Response): Promise<string> {
  try { return await res.text() } catch { return '' }
}
