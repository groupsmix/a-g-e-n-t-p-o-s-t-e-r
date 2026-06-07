/**
 * LinkedIn UGC posts via /v2/ugcPosts.
 * job.meta.authorUrn must be set (e.g. "urn:li:person:...").
 */

import type { PublishAdapter, PublishJob, PublishResult } from '../types.js'

export interface LinkedInConfig {
  accessToken: string
  fetch?: typeof fetch
}

export function createLinkedInAdapter(config: LinkedInConfig): PublishAdapter {
  const f = config.fetch ?? fetch
  return {
    platform: 'linkedin',
    async publish(job: PublishJob): Promise<PublishResult> {
      const authorUrn = (job.meta?.authorUrn as string | undefined)
      if (!authorUrn) return { ok: false, platform: 'linkedin', error: 'meta.authorUrn required' }
      const text = job.parts.join('\n\n').slice(0, 2900)
      try {
        const res = await f('https://api.linkedin.com/v2/ugcPosts', {
          method: 'POST',
          headers: {
            authorization: `Bearer ${config.accessToken}`,
            'content-type': 'application/json',
            'x-restli-protocol-version': '2.0.0',
          },
          body: JSON.stringify({
            author: authorUrn,
            lifecycleState: 'PUBLISHED',
            specificContent: {
              'com.linkedin.ugc.ShareContent': {
                shareCommentary: { text },
                shareMediaCategory: 'NONE',
              },
            },
            visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
          }),
        })
        if (!res.ok) {
          const txt = await res.text().catch(() => '')
          return { ok: false, platform: 'linkedin', error: `HTTP ${res.status}: ${txt.slice(0, 200)}` }
        }
        const id = res.headers.get('x-restli-id') ?? undefined
        return {
          ok: true,
          platform: 'linkedin',
          postId: id ?? undefined,
          url: id ? `https://www.linkedin.com/feed/update/${encodeURIComponent(id)}` : undefined,
        }
      } catch (err) {
        return { ok: false, platform: 'linkedin', error: err instanceof Error ? err.message : String(err) }
      }
    },
  }
}
