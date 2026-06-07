/**
 * Gumroad — webhook-driven. The HTTP route owns receiving the
 * webhook; this adapter is a thin parser that converts the raw
 * payload into a RevenueEvent. Cursors are unused for Gumroad because
 * webhooks are pushed; we leave fetchSince empty so the run loop
 * still calls setCursor and the source shows up in the run summary.
 */

import { resolveAttribution } from '../pipeline/attribution'
import { revenueId } from '../pipeline/fingerprint'
import type { RevenueAdapter, RevenueEvent } from '../types'

interface GumroadSaleWebhook {
  sale_id: string
  product_id?: string
  product_name?: string
  price?: string | number
  email?: string
  referrer?: string
  url_params?: Record<string, string>
  sale_timestamp?: string
}

export function parseGumroadSale(payload: GumroadSaleWebhook): RevenueEvent {
  const amount = typeof payload.price === 'string' ? Number(payload.price) : (payload.price ?? 0)
  return {
    id: revenueId('gumroad', payload.sale_id),
    source: 'gumroad',
    external_id: payload.sale_id,
    amount_usd_cents: Math.round(amount * 100),
    currency: 'USD',
    product_id: payload.product_id ?? null,
    buyer_email: payload.email ?? null,
    description: payload.product_name ?? null,
    occurred_at: payload.sale_timestamp ?? new Date().toISOString(),
    attribution: resolveAttribution({
      referring_url: payload.referrer,
      utm: payload.url_params,
    }),
    raw: payload as unknown as Record<string, unknown>,
  }
}

export class GumroadAdapter implements RevenueAdapter {
  source = 'gumroad' as const
  async fetchSince(): Promise<RevenueEvent[]> {
    // Webhook-driven; nothing to pull.
    return []
  }
}
