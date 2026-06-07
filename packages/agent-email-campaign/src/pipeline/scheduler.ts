/**
 * Sequencer — given a campaign, the recipient and a 'started_at'
 * timestamp, return the list of (step, due_at) tuples. The orchestrator
 * uses this to enqueue future sends rather than blocking on a long
 * sleep.
 *
 * Also handles 'stop_on_reply': if the store records a 'reply' event
 * for any prior step's tracking_id, the remaining steps are pruned.
 */

import type { Campaign, CampaignStep, CampaignStore, Recipient } from '../types'
import { mustache } from './renderer'

export interface ScheduledStep {
  step: CampaignStep
  due_at: string
  /** Stable per-recipient identifier for the step. */
  tracking_id_preview: string
}

function trackingPreview(campaignId: string, stepId: string, email: string): string {
  let h = 2166136261
  const s = `${campaignId}|${stepId}|${email}`
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = (h * 16777619) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

export function planSchedule(
  campaign: Campaign,
  recipient: Recipient,
  startedAt: Date,
): ScheduledStep[] {
  return campaign.steps.map((step) => {
    const due = new Date(startedAt.getTime() + step.delay_hours * 3_600_000)
    return {
      step,
      due_at: due.toISOString(),
      tracking_id_preview: trackingPreview(campaign.id, step.id, recipient.email),
    }
  })
}

export async function pruneRepliedSteps(
  steps: ScheduledStep[],
  store: CampaignStore,
): Promise<ScheduledStep[]> {
  const survivors: ScheduledStep[] = []
  let replied = false
  for (const s of steps) {
    if (replied) {
      if (!s.step.stop_on_reply) survivors.push(s)
      continue
    }
    const evts = await store.events(s.tracking_id_preview)
    survivors.push(s)
    if (evts.some((e) => e.kind === 'reply')) replied = true
  }
  return survivors
}

/** Light reflective preview useful for the UI. */
export function previewStep(campaign: Campaign, step: CampaignStep, recipient: Recipient): {
  subject: string
  body: string
} {
  return {
    subject: mustache(step.template.subject, recipient),
    body: mustache(step.template.body, recipient),
  }
}
