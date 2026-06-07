/**
 * Handler — wires the monitor + writer. Returns alerts + drafts +
 * nextActions queuing a 'write' task per draft so the publisher can
 * ship it.
 */

import { runMonitor, type MonitorResult } from './pipeline/monitor'
import { InMemoryHistory } from './pipeline/storage'
import { draftReview } from './pipeline/writer'
import type {
  Network,
  ProductFetcher,
  ReviewDraft,
  ReviewWriterAdapter,
  SnapshotHistory,
  TrackedProduct,
} from './types'

export interface AffiliateHandlerInput {
  products: TrackedProduct[]
  fetchers: Partial<Record<Network, ProductFetcher>>
  history?: SnapshotHistory
  writer?: ReviewWriterAdapter
  now?: () => Date
}

export interface AffiliateHandlerResult {
  monitor: MonitorResult
  drafts: ReviewDraft[]
  nextActions: Array<{ type: string; payload: Record<string, unknown> }>
}

export async function runAffiliateMonitor(
  input: AffiliateHandlerInput,
): Promise<AffiliateHandlerResult> {
  const history = input.history ?? new InMemoryHistory()
  const monitor = await runMonitor({
    products: input.products,
    fetchers: input.fetchers,
    history,
    now: input.now,
  })
  const drafts: ReviewDraft[] = []
  for (const alert of monitor.alerts) {
    drafts.push(await draftReview(alert.product, alert, input.writer))
  }
  const nextActions = drafts.map((d) => ({
    type: 'write',
    payload: {
      kind: 'affiliate-review',
      product_id: d.product_id,
      title: d.title,
      body: d.body,
      affiliate_url: d.affiliate_url,
    },
  }))
  return { monitor, drafts, nextActions }
}
