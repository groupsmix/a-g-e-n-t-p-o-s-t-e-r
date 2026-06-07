/**
 * Blog publisher — CosmicJS REST adapter.
 * Mirrors agent-site-factory's CosmicJS adapter shape so credentials
 * are shared between site bootstrap and ongoing posting.
 */

import type { PublishAdapter, PublishJob, PublishResult } from '../types.js'

export interface BlogConfig {
  /** "your-bucket-slug" */
  bucketSlug: string
  /** "your-read-key" */
  readKey: string
  /** "your-write-key" */
  writeKey: string
  /** Object type slug, default 'posts' */
  typeSlug?: string
  fetch?: typeof fetch
}

export function createBlogAdapter(config: BlogConfig): PublishAdapter {
  const f = config.fetch ?? fetch
  const typeSlug = config.typeSlug ?? 'posts'
  return {
    platform: 'blog',
    async publish(job: PublishJob): Promise<PublishResult> {
      const content = job.parts.join('\n\n')
      try {
        const res = await f(
          `https://api.cosmicjs.com/v3/buckets/${config.bucketSlug}/objects`,
          {
            method: 'POST',
            headers: {
              authorization: `Bearer ${config.writeKey}`,
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              type: typeSlug,
              title: job.title,
              content,
              status: 'published',
              metadata: job.meta ?? {},
            }),
          },
        )
        const data = (await res.json().catch(() => ({}))) as {
          object?: { id?: string; slug?: string }
          error?: string
        }
        if (!res.ok || !data.object?.id) {
          return { ok: false, platform: 'blog', error: data.error ?? `HTTP ${res.status}` }
        }
        return {
          ok: true,
          platform: 'blog',
          postId: data.object.id,
          url: data.object.slug ? `/${typeSlug}/${data.object.slug}` : undefined,
        }
      } catch (err) {
        return { ok: false, platform: 'blog', error: err instanceof Error ? err.message : String(err) }
      }
    },
  }
}
