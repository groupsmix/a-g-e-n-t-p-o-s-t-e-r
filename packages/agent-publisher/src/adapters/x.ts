/**
 * X (Twitter) v2 adapter.  Single post → POST /2/tweets.
 * Multi-part jobs become a reply chain.
 */

import type { PublishAdapter, PublishJob, PublishResult } from '../types.js'

export interface XConfig {
  bearerToken: string
  fetch?: typeof fetch
}

interface CreateTweetResponse {
  data?: { id?: string; text?: string }
  errors?: Array<{ message?: string }>
}

export function createXAdapter(config: XConfig): PublishAdapter {
  const f = config.fetch ?? fetch
  return {
    platform: 'x',
    async publish(job: PublishJob): Promise<PublishResult> {
      try {
        let inReplyToId: string | undefined
        let firstId: string | undefined
        for (const part of job.parts) {
          const body: Record<string, unknown> = { text: part.slice(0, 280) }
          if (inReplyToId) body.reply = { in_reply_to_tweet_id: inReplyToId }
          const res = await f('https://api.twitter.com/2/tweets', {
            method: 'POST',
            headers: {
              authorization: `Bearer ${config.bearerToken}`,
              'content-type': 'application/json',
            },
            body: JSON.stringify(body),
          })
          const data = (await res.json().catch(() => ({}))) as CreateTweetResponse
          if (!res.ok || !data.data?.id) {
            return {
              ok: false,
              platform: 'x',
              error: data.errors?.[0]?.message ?? `HTTP ${res.status}`,
            }
          }
          inReplyToId = data.data.id
          if (!firstId) firstId = data.data.id
        }
        return {
          ok: true,
          platform: 'x',
          postId: firstId,
          url: firstId ? `https://twitter.com/i/web/status/${firstId}` : undefined,
        }
      } catch (err) {
        return { ok: false, platform: 'x', error: err instanceof Error ? err.message : String(err) }
      }
    },
  }
}
