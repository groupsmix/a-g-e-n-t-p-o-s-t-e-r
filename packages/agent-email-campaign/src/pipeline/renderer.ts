/**
 * Renderer — turns Campaign + Recipient + step → RenderedEmail.
 *
 * Template syntax is intentionally tiny:
 *   {{var}}   — recipient.vars[var] or empty string
 *   {{name}}  — recipient.name with sensible fallbacks (vars.first_name,
 *               then the local-part of the email).
 *
 * Tracking pixel is appended to the HTML body unless it already
 * contains a {{TRACKING_PIXEL}} sentinel. Click links wrapped via
 * {{CLICK url='https://x'}} get rewritten to redirect URLs (the
 * sender supplies the redirect base).
 */

import type {
  Campaign,
  CampaignStep,
  EmailTemplate,
  PersonaliseAdapter,
  Recipient,
  RenderedEmail,
} from '../types'

const MUSTACHE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g

function nameFor(recipient: Recipient): string {
  if (recipient.name) return recipient.name
  if (recipient.vars?.first_name) return recipient.vars.first_name
  const local = recipient.email.split('@')[0]!
  return local.replace(/[._-]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase())
}

export function mustache(input: string, recipient: Recipient): string {
  return input.replace(MUSTACHE, (_, key: string) => {
    if (key === 'name') return nameFor(recipient)
    if (key === 'email') return recipient.email
    return recipient.vars?.[key] ?? ''
  })
}

/** FNV-1a hash — stable, no crypto dep. */
function trackingId(campaignId: string, stepId: string, email: string): string {
  const s = `${campaignId}|${stepId}|${email}`
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = (h * 16777619) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

function wrapClicks(html: string, trackBase: string, tid: string): string {
  return html.replace(
    /\{\{\s*CLICK\s+url=['"]([^'"]+)['"]\s*\}\}/g,
    (_, url: string) =>
      `${trackBase}/c/${encodeURIComponent(tid)}?u=${encodeURIComponent(url)}`,
  )
}

function ensurePixel(html: string, trackBase: string, tid: string): string {
  const pixel = `<img src="${trackBase}/o/${encodeURIComponent(tid)}.gif" width="1" height="1" alt="" />`
  if (html.includes('{{TRACKING_PIXEL}}')) return html.replace('{{TRACKING_PIXEL}}', pixel)
  return `${html}\n${pixel}`
}

function bodyToHtml(text: string): string {
  return text
    .split(/\n\n+/)
    .map((p) => `<p>${p.replace(/\n/g, '<br/>')}</p>`)
    .join('\n')
}

export interface RenderInput {
  campaign: Campaign
  step: CampaignStep
  recipient: Recipient
  trackingBaseUrl: string
  personalise?: PersonaliseAdapter
}

export async function renderEmail(input: RenderInput): Promise<RenderedEmail> {
  const { campaign, step, recipient, trackingBaseUrl } = input
  let template: Pick<EmailTemplate, 'subject' | 'body' | 'html'> = step.template
  if (step.template.personalise && input.personalise) {
    try {
      const rewritten = await input.personalise.rewrite({
        subject: step.template.subject,
        body: step.template.body,
        recipient,
      })
      template = { subject: rewritten.subject, body: rewritten.body, html: step.template.html }
    } catch {
      // fall through to the static template
    }
  }
  const subject = mustache(template.subject, recipient)
  const text = mustache(template.body, recipient)
  const tid = trackingId(campaign.id, step.id, recipient.email)
  const rawHtml = template.html ? mustache(template.html, recipient) : bodyToHtml(text)
  const html = ensurePixel(wrapClicks(rawHtml, trackingBaseUrl, tid), trackingBaseUrl, tid)
  return {
    to: recipient.email,
    to_name: recipient.name,
    from_email: campaign.from.email,
    from_name: campaign.from.name,
    subject,
    text,
    html,
    tracking_id: tid,
    step_id: step.id,
    campaign_id: campaign.id,
  }
}
