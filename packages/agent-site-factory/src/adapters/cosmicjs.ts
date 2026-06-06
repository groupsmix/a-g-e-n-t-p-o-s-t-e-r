/**
 * CosmicJS CMS adapter.
 *
 * - ensureBucket: Cosmic doesn't expose a programmatic bucket-create REST
 *   endpoint on the free tier, so we treat ensureBucket as a precondition
 *   check: if the bucket already exists, succeed; otherwise return the
 *   slug and let the caller surface the missing-bucket error.
 * - createArticle: POST /v3/buckets/{slug}/objects with type "articles".
 *
 * Keys: COSMIC_BUCKET_SLUG, COSMIC_WRITE_KEY (server).
 */

import type { CmsClient, SeedArticle } from '../types.js'

export interface CosmicConfig {
  bucketSlug: string
  writeKey: string
  baseUrl?: string
  fetch?: typeof fetch
}

interface CosmicObjectResponse {
  object?: { id?: string; slug?: string }
  message?: string
  status?: number
}

export function createCosmicCms(config: CosmicConfig): CmsClient {
  const base = (config.baseUrl ?? 'https://api.cosmicjs.com').replace(/\/$/, '')
  const f = config.fetch ?? fetch
  return {
    async ensureBucket() {
      // Cosmic buckets are created via the dashboard; we assume the
      // configured slug already exists. Validate with a HEAD-ish read.
      const res = await f(`${base}/v3/buckets/${config.bucketSlug}/object-types`, {
        method: 'GET',
        headers: { authorization: `Bearer ${config.writeKey}` },
      })
      if (!res.ok) {
        throw new Error(
          `Cosmic bucket "${config.bucketSlug}" inaccessible (HTTP ${res.status}). ` +
            `Create it manually first.`,
        )
      }
      return { slug: config.bucketSlug }
    },

    async createArticle(_bucketSlug, article: SeedArticle) {
      const body = {
        type: 'articles',
        title: article.title,
        slug: article.slug,
        status: 'published',
        metadata: {
          excerpt: article.excerpt,
          body: article.markdown,
          tags: article.tags.join(','),
        },
      }
      const res = await f(`${base}/v3/buckets/${config.bucketSlug}/objects`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${config.writeKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      })
      const data = (await res.json().catch(() => ({}))) as CosmicObjectResponse
      if (!res.ok || !data.object?.id) {
        throw new Error(data.message ?? `Cosmic create failed: HTTP ${res.status}`)
      }
      return {
        id: data.object.id,
        url: `https://app.cosmicjs.com/${config.bucketSlug}/object/${data.object.slug ?? article.slug}`,
      }
    },
  }
}
