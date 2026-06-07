/**
 * Handler — registers under AgentTaskType 'email-campaign'.
 * Payload shape:
 *   { campaign: Campaign, recipients: Recipient[],
 *     provider: EmailProvider, store?: CampaignStore,
 *     trackingBaseUrl: string, personalise?: PersonaliseAdapter,
 *     /** which step to send right now; default 0 *\/
 *     stepIndex?: number }
 *
 * Renders + sends one step for every recipient. Returns the
 * batch result + a plan for the remaining steps so the orchestrator
 * can enqueue follow-ups.
 */

import { renderEmail } from './pipeline/renderer'
import { sendBatch } from './pipeline/sender'
import { planSchedule, type ScheduledStep } from './pipeline/scheduler'
import { InMemoryCampaignStore } from './pipeline/storage'
import type {
  Campaign,
  CampaignStore,
  EmailProvider,
  PersonaliseAdapter,
  Recipient,
  RenderedEmail,
  SendReceipt,
} from './types'

export interface EmailCampaignHandlerInput {
  campaign: Campaign
  recipients: Recipient[]
  provider: EmailProvider
  store?: CampaignStore
  trackingBaseUrl: string
  personalise?: PersonaliseAdapter
  stepIndex?: number
  now?: () => Date
}

export interface EmailCampaignHandlerResult {
  step_id: string
  attempted: number
  sent: number
  failed: number
  skipped_window: number
  skipped_cap: number
  receipts: SendReceipt[]
  follow_ups: Array<{ recipient_email: string; schedule: ScheduledStep[] }>
}

export async function runEmailCampaign(
  input: EmailCampaignHandlerInput,
): Promise<EmailCampaignHandlerResult> {
  const store = input.store ?? new InMemoryCampaignStore()
  const stepIndex = input.stepIndex ?? 0
  const step = input.campaign.steps[stepIndex]
  if (!step) throw new Error(`stepIndex ${stepIndex} out of range`)
  const now = input.now?.() ?? new Date()

  const rendered: RenderedEmail[] = []
  for (const recipient of input.recipients) {
    const email = await renderEmail({
      campaign: input.campaign,
      step,
      recipient,
      trackingBaseUrl: input.trackingBaseUrl,
      personalise: input.personalise,
    })
    rendered.push(email)
  }

  const batch = await sendBatch({
    campaign: input.campaign,
    emails: rendered,
    provider: input.provider,
    store,
    now: input.now,
  })

  const remainingSteps = input.campaign.steps.slice(stepIndex + 1)
  const follow_ups = input.recipients.map((r) => ({
    recipient_email: r.email,
    schedule: planSchedule({ ...input.campaign, steps: remainingSteps }, r, now),
  }))

  return {
    step_id: step.id,
    attempted: batch.attempted,
    sent: batch.sent,
    failed: batch.failed,
    skipped_window: batch.skipped_window,
    skipped_cap: batch.skipped_cap,
    receipts: batch.receipts,
    follow_ups,
  }
}
