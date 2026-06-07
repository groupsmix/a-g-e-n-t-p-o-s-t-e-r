/**
 * Email campaign contracts (TASK-801).
 *
 * A Campaign is a named sequence of Steps. Each Step is one
 * delay + one template. We render templates per Recipient (basic
 * mustache, plus optional LLM personalisation), then send via an
 * ESP adapter (Resend / Postmark / generic). Sent messages get a
 * unique tracking_id used for opens/clicks webhooks.
 */

export type CampaignKind = 'cold-sequence' | 'newsletter' | 'lead-followup' | 'transactional'

export interface Recipient {
  email: string
  name?: string
  /** Free-form merge fields. Templates can reference any key as {{name}}. */
  vars?: Record<string, string>
  /** Optional lead fingerprint when the recipient came from agent-lead-scraper. */
  lead_fingerprint?: string
}

export interface EmailTemplate {
  id: string
  subject: string
  /** Plain-text body with mustache placeholders. */
  body: string
  /** Optional HTML body. Renderer adds an <img> tracking pixel if missing. */
  html?: string
  /** If true, the personaliser runs an LLM rewrite for each recipient. */
  personalise?: boolean
}

export interface CampaignStep {
  id: string
  delay_hours: number
  template: EmailTemplate
  /** Stop the sequence for this recipient if they replied to a prior step. */
  stop_on_reply?: boolean
}

export interface Campaign {
  id: string
  kind: CampaignKind
  name: string
  from: { email: string; name?: string }
  steps: CampaignStep[]
  /** Per-day send cap so the ESP rate limit can't blow up. */
  daily_cap?: number
  /** Optional global send window in UTC hours [start, end). */
  send_window_utc?: [number, number]
}

export interface RenderedEmail {
  to: string
  to_name?: string
  from_email: string
  from_name?: string
  subject: string
  text: string
  html: string
  /** Stable id used for tracking pixels + click redirects. */
  tracking_id: string
  /** Source step id this email came from. */
  step_id: string
  /** Source campaign id. */
  campaign_id: string
}

export interface SendReceipt {
  provider: 'resend' | 'postmark' | 'webhook'
  provider_id: string | null
  ok: boolean
  error?: string
}

export interface EmailProvider {
  name: SendReceipt['provider']
  send(email: RenderedEmail): Promise<SendReceipt>
}

export type EventKind = 'sent' | 'open' | 'click' | 'bounce' | 'reply' | 'unsubscribe'

export interface CampaignEvent {
  tracking_id: string
  kind: EventKind
  at: string
  /** click target when kind === 'click', user-agent or reason for others. */
  meta?: string
}

export interface CampaignStore {
  recordSend(receipt: SendReceipt, email: RenderedEmail): Promise<void>
  recordEvent(event: CampaignEvent): Promise<void>
  /** All events for a tracking_id, oldest first. */
  events(trackingId: string): Promise<CampaignEvent[]>
  /** Aggregate counts per kind for a campaign. */
  aggregate(campaignId: string): Promise<Record<EventKind, number>>
}

export interface PersonaliseAdapter {
  rewrite(input: { subject: string; body: string; recipient: Recipient }): Promise<{
    subject: string
    body: string
  }>
}
