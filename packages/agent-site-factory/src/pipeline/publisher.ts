/**
 * Stage 3 — push seed articles into the CMS bucket.  Per-article errors
 * are isolated so one bad upload doesn't lose the whole batch.
 */

import type { CmsClient, PublishedArticle, SeedArticle } from '../types.js'

export async function publishArticles(
  cms: CmsClient,
  bucketSlug: string,
  articles: SeedArticle[],
): Promise<{ published: PublishedArticle[]; failures: Array<{ slug: string; error: string }> }> {
  const published: PublishedArticle[] = []
  const failures: Array<{ slug: string; error: string }> = []
  const now = new Date().toISOString()
  for (const a of articles) {
    try {
      const r = await cms.createArticle(bucketSlug, a)
      published.push({ ...a, id: r.id, url: r.url, publishedAt: now })
    } catch (err) {
      failures.push({ slug: a.slug, error: err instanceof Error ? err.message : String(err) })
    }
  }
  return { published, failures }
}
