/**
 * Sender — pushes RenderedEmail through an EmailProvider, records
 * 'sent' (or error) events, honours per-campaign daily caps and
 * UTC send-windows.
 */

import type {
  Campaign,
  CampaignEvent,
  CampaignStore,
  EmailProvider,
  RenderedEmail,
  SendReceipt,
} from '../types'

export interface SendInput {
  campaign: Campaign
  emails: RenderedEmail[]
  provider: EmailProvider
  store: CampaignStore
  /** Override clock for tests. */
  now?: () => Date
}

export interface SendBatchResult {
  attempted: number
  sent: number
  failed: number
  skipped_window: number
  skipped_cap: number
  receipts: SendReceipt[]
}

function inWindow(campaign: Campaign, now: Date): boolean {
  const w = campaign.send_window_utc
  if (!w) return true
  const [start, end] = w
  const h = now.getUTCHours()
  return start <= end ? h >= start && h < end : h >= start || h < end
}

export async function sendBatch(input: SendInput): Promise<SendBatchResult> {
  const now = input.now?.() ?? new Date()
  const result: SendBatchResult = {
    attempted: input.emails.length,
    sent: 0,
    failed: 0,
    skipped_window: 0,
    skipped_cap: 0,
    receipts: [],
  }

  if (!inWindow(input.campaign, now)) {
    result.skipped_window = input.emails.length
    return result
  }

  const cap = input.campaign.daily_cap ?? Infinity
  let sentToday = 0
  for (const email of input.emails) {
    if (sentToday >= cap) {
      result.skipped_cap += 1
      continue
    }
    let receipt: SendReceipt
    try {
      receipt = await input.provider.send(email)
    } catch (err) {
      receipt = {
        provider: input.provider.name,
        provider_id: null,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      }
    }
    result.receipts.push(receipt)
    if (receipt.ok) result.sent += 1
    else result.failed += 1
    sentToday += 1
    await input.store.recordSend(receipt, email)
    const event: CampaignEvent = {
      tracking_id: email.tracking_id,
      kind: receipt.ok ? 'sent' : 'bounce',
      at: now.toISOString(),
      meta: receipt.ok ? receipt.provider_id ?? undefined : receipt.error,
    }
    await input.store.recordEvent(event)
  }

  return result
}
