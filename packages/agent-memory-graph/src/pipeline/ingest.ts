/**
 * Convenience pipeline — common agent operations that mostly delegate
 * to a MemoryGraphClient.
 *
 *   ingestNote(client, group_id, text)        — quick text capture
 *   ingestLead(client, group_id, lead)        — structured fact about a lead
 *   ingestSale(client, group_id, sale)        — structured fact about a sale
 *   contextFor(client, group_id, query)       — recall, formatted for prompts
 */

import type { Lead, RevenueEvent } from '@posteragent/types'
import type { MemoryEpisode, MemoryGraphClient } from '../types'

export async function ingestNote(client: MemoryGraphClient, group_id: string, text: string) {
  return client.addEpisode({ content: text, source: 'note', group_id, reference_time: new Date().toISOString() })
}

export async function ingestLead(client: MemoryGraphClient, group_id: string, lead: Lead) {
  const summary = [
    `Lead ${lead.handle} on ${lead.platform}.`,
    lead.name ? `Name: ${lead.name}.` : '',
    `Context: ${lead.context}.`,
    `Score ${lead.score}/100, status ${lead.status}.`,
    `Source: ${lead.sourceUrl}.`,
  ].filter(Boolean).join(' ')
  return client.addEpisode({
    content: summary,
    source: 'lead',
    group_id,
    metadata: { handle: lead.handle, platform: lead.platform, score: lead.score },
  })
}

export async function ingestSale(client: MemoryGraphClient, group_id: string, ev: RevenueEvent) {
  const summary = `Sale: $${(ev.amountUsd).toFixed(2)} from ${ev.source}${
    ev.productId ? ` for ${ev.productId}` : ''
  } on ${ev.occurredAt.toISOString?.() ?? ev.occurredAt}.`
  return client.addEpisode({
    content: summary,
    source: 'sale',
    group_id,
    reference_time: typeof ev.occurredAt === 'string' ? ev.occurredAt : ev.occurredAt.toISOString(),
    metadata: { source: ev.source, amount_usd: ev.amountUsd, product_id: ev.productId },
  })
}

export async function contextFor(client: MemoryGraphClient, group_id: string, query: string, limit = 8): Promise<string> {
  const { entities, relations } = await client.recall(group_id, query, limit)
  if (entities.length === 0 && relations.length === 0) return ''
  const lines: string[] = []
  lines.push('Known context:')
  for (const e of entities.slice(0, limit)) {
    lines.push(`- ${e.name}${e.summary ? `: ${e.summary}` : ''}`)
  }
  for (const r of relations.slice(0, limit)) {
    lines.push(`- ${r.source_uuid} —[${r.fact}]→ ${r.target_uuid}`)
  }
  return lines.join('\n')
}

export const _internal = { kind: 'memory-graph-ingest' as const }
export type MemoryEpisodeIngest = MemoryEpisode
