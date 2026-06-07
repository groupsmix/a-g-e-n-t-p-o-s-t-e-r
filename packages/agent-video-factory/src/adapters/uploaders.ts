/**
 * Two upload targets:
 *  - R2 / S3-compatible storage (private link the publisher pulls from).
 *  - Direct YouTube upload (videos.insert, resumable).
 *
 * Both fail soft and return UploadResult.ok=false rather than throw,
 * so a failed upload doesn't lose the render artefact.
 */

import type { VideoUploader, UploadResult } from '../types.js'

export interface R2UploaderConfig {
  /** R2/S3 endpoint, e.g. https://<acct>.r2.cloudflarestorage.com */
  endpoint: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  publicBaseUrl?: string
  fetch?: typeof fetch
}

/**
 * Minimal R2 PUT uploader (presumes already-signed key/secret via
 * env-injected signer; the worker can swap this for the AWS SDK).
 * This implementation expects the caller to pass videoBase64 and
 * uploads it as a single PUT — works fine for ≤ 25 MB short-form video.
 */
export function createR2Uploader(config: R2UploaderConfig): VideoUploader {
  const f = config.fetch ?? fetch
  return {
    async upload({ title, videoBase64, aspect }): Promise<UploadResult> {
      if (!videoBase64 || videoBase64 === 'dryrun') {
        return { ok: false, provider: 'r2', error: 'no videoBase64' }
      }
      const key = `videos/${Date.now()}_${title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}_${aspect.replace(':', 'x')}.mp4`
      const body = typeof Buffer !== 'undefined'
        ? Buffer.from(videoBase64, 'base64')
        : Uint8Array.from(atob(videoBase64), (c) => c.charCodeAt(0))
      const url = `${config.endpoint.replace(/\/$/, '')}/${config.bucket}/${key}`
      try {
        const res = await f(url, {
          method: 'PUT',
          headers: {
            'content-type': 'video/mp4',
            // assume the runtime layer signs; otherwise add Authorization here
            'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
          },
          body,
        })
        if (!res.ok) return { ok: false, provider: 'r2', error: `HTTP ${res.status}` }
        const publicUrl = config.publicBaseUrl
          ? `${config.publicBaseUrl.replace(/\/$/, '')}/${key}`
          : url
        return { ok: true, provider: 'r2', id: key, url: publicUrl }
      } catch (err) {
        return { ok: false, provider: 'r2', error: err instanceof Error ? err.message : String(err) }
      }
    },
  }
}

export interface YouTubeUploaderConfig {
  accessToken: string
  /** 22 = People & Blogs default. */
  categoryId?: string
  privacyStatus?: 'private' | 'unlisted' | 'public'
  fetch?: typeof fetch
}

/**
 * YouTube resumable upload (simplified single-POST).  Real impl
 * should chunk for ≥ 100 MB; we keep this simple for short-form.
 */
export function createYouTubeUploader(config: YouTubeUploaderConfig): VideoUploader {
  const f = config.fetch ?? fetch
  return {
    async upload({ title, description, videoBase64 }): Promise<UploadResult> {
      if (!videoBase64 || videoBase64 === 'dryrun') {
        return { ok: false, provider: 'youtube', error: 'no videoBase64' }
      }
      const meta = {
        snippet: { title: title.slice(0, 100), description, categoryId: config.categoryId ?? '22' },
        status: { privacyStatus: config.privacyStatus ?? 'unlisted' },
      }
      const body = typeof Buffer !== 'undefined'
        ? Buffer.from(videoBase64, 'base64')
        : Uint8Array.from(atob(videoBase64), (c) => c.charCodeAt(0))

      try {
        // multipart body — boundary-delimited metadata + video
        const boundary = `----posteragent_${Date.now()}`
        const enc = new TextEncoder()
        const head = enc.encode(
          `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
          `--${boundary}\r\nContent-Type: video/mp4\r\n\r\n`,
        )
        const tail = enc.encode(`\r\n--${boundary}--`)
        const merged = new Uint8Array(head.length + body.length + tail.length)
        merged.set(head, 0)
        merged.set(body, head.length)
        merged.set(tail, head.length + body.length)
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
          return { ok: false, provider: 'youtube', error: data.error?.message ?? `HTTP ${res.status}` }
        }
        return {
          ok: true,
          provider: 'youtube',
          id: data.id,
          url: `https://youtu.be/${data.id}`,
        }
      } catch (err) {
        return { ok: false, provider: 'youtube', error: err instanceof Error ? err.message : String(err) }
      }
    },
  }
}
