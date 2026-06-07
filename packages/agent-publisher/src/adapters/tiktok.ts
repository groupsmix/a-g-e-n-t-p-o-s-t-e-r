/**
 * TikTok Content Posting API — POST /v2/post/publish/video/init/
 * with PULL_FROM_URL source. Requires job.media[video] URL.
 */

import type { PublishAdapter, PublishJob, PublishResult } from '../types.js'

export interface TikTokConfig {
  accessToken: string
  fetch?: typeof fetch
}

export function createTikTokAdapter(config: TikTokConfig): PublishAdapter {
  const f = config.fetch ?? fetch
  return {
    platform: 'tiktok',
    async publish(job: PublishJob): Promise<PublishResult> {
      const videoUrl = job.media?.find((m) => m.mime.startsWith('video/'))?.url
      if (!videoUrl) return { ok: false, platform: 'tiktok', error: 'media[video] required' }
      const title = job.title.slice(0, 90)
      try {
        const res = await f('https://open.tiktokapis.com/v2/post/publish/video/init/', {
          method: 'POST',
          headers: {
            authorization: `Bearer ${config.accessToken}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            post_info: { title, privacy_level: 'PUBLIC_TO_EVERYONE' },
            source_info: { source: 'PULL_FROM_URL', video_url: videoUrl },
          }),
        })
        const data = (await res.json().catch(() => ({}))) as {
          data?: { publish_id?: string }
          error?: { message?: string; code?: string }
        }
        if (!res.ok || !data.data?.publish_id) {
          return { ok: false, platform: 'tiktok', error: data.error?.message ?? `HTTP ${res.status}` }
        }
        return { ok: true, platform: 'tiktok', postId: data.data.publish_id }
      } catch (err) {
        return { ok: false, platform: 'tiktok', error: err instanceof Error ? err.message : String(err) }
      }
    },
  }
}
