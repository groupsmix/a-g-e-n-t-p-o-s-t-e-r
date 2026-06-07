/**
 * ESP adapters. Resend + Postmark cover ~95% of indie inboxes;
 * WebhookEmailProvider is the fall-back for any other ESP that
 * accepts a POST.
 */

import type { EmailProvider, RenderedEmail, SendReceipt } from '../types'

export class ResendProvider implements EmailProvider {
  readonly name = 'resend' as const
  constructor(private apiKey: string) {}
  async send(email: RenderedEmail): Promise<SendReceipt> {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: email.from_name ? `${email.from_name} <${email.from_email}>` : email.from_email,
        to: [email.to],
        subject: email.subject,
        text: email.text,
        html: email.html,
        headers: { 'X-Tracking-Id': email.tracking_id },
      }),
    })
    if (!r.ok) {
      return {
        provider: this.name,
        provider_id: null,
        ok: false,
        error: `resend ${r.status} ${await r.text().catch(() => '')}`,
      }
    }
    const json = (await r.json()) as { id?: string }
    return { provider: this.name, provider_id: json.id ?? null, ok: true }
  }
}

export class PostmarkProvider implements EmailProvider {
  readonly name = 'postmark' as const
  constructor(private serverToken: string) {}
  async send(email: RenderedEmail): Promise<SendReceipt> {
    const r = await fetch('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'x-postmark-server-token': this.serverToken,
      },
      body: JSON.stringify({
        From: email.from_name ? `${email.from_name} <${email.from_email}>` : email.from_email,
        To: email.to,
        Subject: email.subject,
        TextBody: email.text,
        HtmlBody: email.html,
        Metadata: { tracking_id: email.tracking_id },
        MessageStream: 'outbound',
      }),
    })
    if (!r.ok) {
      return {
        provider: this.name,
        provider_id: null,
        ok: false,
        error: `postmark ${r.status} ${await r.text().catch(() => '')}`,
      }
    }
    const json = (await r.json()) as { MessageID?: string }
    return { provider: this.name, provider_id: json.MessageID ?? null, ok: true }
  }
}

export class WebhookEmailProvider implements EmailProvider {
  readonly name = 'webhook' as const
  constructor(private url: string, private extraHeaders: Record<string, string> = {}) {}
  async send(email: RenderedEmail): Promise<SendReceipt> {
    const r = await fetch(this.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...this.extraHeaders },
      body: JSON.stringify(email),
    })
    if (!r.ok) {
      return { provider: this.name, provider_id: null, ok: false, error: `webhook ${r.status}` }
    }
    return { provider: this.name, provider_id: null, ok: true }
  }
}

/** Personalisation adapter that calls Anthropic to rewrite cold-email steps. */
export class AnthropicPersonaliser {
  constructor(
    private apiKey: string,
    private model = 'claude-sonnet-4-20250514',
  ) {}
  async rewrite(input: {
    subject: string
    body: string
    recipient: { email: string; name?: string; vars?: Record<string, string> }
  }): Promise<{ subject: string; body: string }> {
    const prompt = [
      'Rewrite this cold email for the recipient below. Keep it short (<=120 words), warm, and concrete.',
      'Output JSON {"subject":"...","body":"..."} with no markdown.',
      '',
      `RECIPIENT: ${JSON.stringify(input.recipient)}`,
      '',
      'SUBJECT:',
      input.subject,
      '',
      'BODY:',
      input.body,
    ].join('\n')
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 600,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!r.ok) throw new Error(`anthropic ${r.status}`)
    const json = (await r.json()) as { content?: Array<{ text?: string }> }
    const text = json.content?.[0]?.text ?? ''
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('no json in personaliser response')
    const parsed = JSON.parse(match[0]) as { subject?: string; body?: string }
    return {
      subject: parsed.subject ?? input.subject,
      body: parsed.body ?? input.body,
    }
  }
}
