/**
 * Newsletter publisher — generic ESP via webhook contract.
 * Works for ConvertKit, Beehiiv, EmailOctopus by mapping fields.
 *
 * Required job.meta:
 *   subject?: string (defaults to job.title)
 *   preview?: string
 *   audienceId?: string
 */

import type { PublishAdapter, PublishJob, PublishResult } from '../types.js'

export interface NewsletterConfig {
  baseUrl: string
  apiKey: string
  /** Header name for auth, default Authorization. */
  authHeader?: string
  authPrefix?: string
  fetch?: typeof fetch
}

export function createNewsletterAdapter(config: NewsletterConfig): PublishAdapter {
  const f = config.fetch ?? fetch
  return {
    platform: 'newsletter',
    async publish(job: PublishJob): Promise<PublishResult> {
      const subject = (job.meta?.subject as string | undefined) ?? job.title
      const preview = job.meta?.preview as string | undefined
      const audienceId = job.meta?.audienceId as string | undefined
      const body = job.parts.join('\n\n')
      try {
        const res = await f(`${config.baseUrl.replace(/\/$/, '')}/broadcasts`, {
          method: 'POST',
          headers: {
            [config.authHeader ?? 'authorization']: `${config.authPrefix ?? 'Bearer '}${config.apiKey}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ subject, preview, body, audienceId }),
        })
        const data = (await res.json().catch(() => ({}))) as { id?: string; url?: string; error?: string }
        if (!res.ok) {
          return { ok: false, platform: 'newsletter', error: data.error ?? `HTTP ${res.status}` }
        }
        return { ok: true, platform: 'newsletter', postId: data.id, url: data.url }
      } catch (err) {
        return { ok: false, platform: 'newsletter', error: err instanceof Error ? err.message : String(err) }
      }
    },
  }
}
