/**
 * Instagram Graph API — two-step container/publish.
 * job.meta.igUserId required (IG business account ID).
 * Requires at least one image URL in job.media[].
 */

import type { PublishAdapter, PublishJob, PublishResult } from '../types.js'

export interface InstagramConfig {
  accessToken: string
  fetch?: typeof fetch
}

export function createInstagramAdapter(config: InstagramConfig): PublishAdapter {
  const f = config.fetch ?? fetch
  return {
    platform: 'instagram',
    async publish(job: PublishJob): Promise<PublishResult> {
      const igUserId = job.meta?.igUserId as string | undefined
      const imageUrl = job.media?.find((m) => m.mime.startsWith('image/'))?.url
      if (!igUserId) return { ok: false, platform: 'instagram', error: 'meta.igUserId required' }
      if (!imageUrl) return { ok: false, platform: 'instagram', error: 'media[image] required' }
      const caption = job.parts.join('\n\n').slice(0, 2200)
      try {
        const create = await f(
          `https://graph.facebook.com/v18.0/${igUserId}/media?image_url=${encodeURIComponent(imageUrl)}&caption=${encodeURIComponent(caption)}&access_token=${config.accessToken}`,
          { method: 'POST' },
        )
        const c = (await create.json().catch(() => ({}))) as { id?: string; error?: { message?: string } }
        if (!create.ok || !c.id) {
          return { ok: false, platform: 'instagram', error: c.error?.message ?? `HTTP ${create.status}` }
        }
        const publish = await f(
          `https://graph.facebook.com/v18.0/${igUserId}/media_publish?creation_id=${c.id}&access_token=${config.accessToken}`,
          { method: 'POST' },
        )
        const p = (await publish.json().catch(() => ({}))) as { id?: string; error?: { message?: string } }
        if (!publish.ok || !p.id) {
          return { ok: false, platform: 'instagram', error: p.error?.message ?? `HTTP ${publish.status}` }
        }
        return { ok: true, platform: 'instagram', postId: p.id }
      } catch (err) {
        return { ok: false, platform: 'instagram', error: err instanceof Error ? err.message : String(err) }
      }
    },
  }
}
