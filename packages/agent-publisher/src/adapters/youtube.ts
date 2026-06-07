/**
 * YouTube publish — reuses agent-video-factory's uploader shape but
 * driven by a PublishJob whose media[video] URL points to the
 * already-rendered/uploaded MP4. For direct upload from base64 use
 * agent-video-factory's createYouTubeUploader.
 */

import type { PublishAdapter, PublishJob, PublishResult } from '../types.js'

export interface YouTubeConfig {
  accessToken: string
  privacyStatus?: 'private' | 'unlisted' | 'public'
  categoryId?: string
  fetch?: typeof fetch
}

export function createYouTubeAdapter(config: YouTubeConfig): PublishAdapter {
  const f = config.fetch ?? fetch
  return {
    platform: 'youtube',
    async publish(job: PublishJob): Promise<PublishResult> {
      const videoUrl = job.media?.find((m) => m.mime.startsWith('video/'))?.url
      if (!videoUrl) return { ok: false, platform: 'youtube', error: 'media[video] required' }
      try {
        // First fetch the bytes (works for our R2/dashboard signed URLs).
        const vid = await f(videoUrl)
        if (!vid.ok) return { ok: false, platform: 'youtube', error: `media fetch HTTP ${vid.status}` }
        const buf = new Uint8Array(await vid.arrayBuffer())

        const meta = {
          snippet: {
            title: job.title.slice(0, 100),
            description: job.parts.join('\n\n').slice(0, 5000),
            categoryId: config.categoryId ?? '22',
          },
          status: { privacyStatus: config.privacyStatus ?? 'unlisted' },
        }
        const boundary = `----posteragent_${Date.now()}`
        const enc = new TextEncoder()
        const head = enc.encode(
          `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
          `--${boundary}\r\nContent-Type: video/mp4\r\n\r\n`,
        )
        const tail = enc.encode(`\r\n--${boundary}--`)
        const merged = new Uint8Array(head.length + buf.length + tail.length)
        merged.set(head, 0)
        merged.set(buf, head.length)
        merged.set(tail, head.length + buf.length)
        const res = await f(
          'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status',
          {
            method: 'POST',
            headers: {
              authorization: `Bearer ${config.accessToken}`,
              'content-type': `multipart/related; boundary=${boundary}`,
            },
            body: merged,
          },
        )
        const data = (await res.json().catch(() => ({}))) as { id?: string; error?: { message?: string } }
        if (!res.ok || !data.id) {
          return { ok: false, platform: 'youtube', error: data.error?.message ?? `HTTP ${res.status}` }
        }
        return {
          ok: true,
          platform: 'youtube',
          postId: data.id,
          url: `https://youtu.be/${data.id}`,
        }
      } catch (err) {
        return { ok: false, platform: 'youtube', error: err instanceof Error ? err.message : String(err) }
      }
    },
  }
}
