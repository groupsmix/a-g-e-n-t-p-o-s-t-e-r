/**
 * Stage 1 — design the CMS bucket from the brief.
 * Heuristic only; the LLM path is optional sugar that names the
 * bucket more cleanly than slugifying the niche.
 */

import type { BucketSpec, LLMClient, SiteBrief } from '../types.js'

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32)
}

export async function planBucket(brief: SiteBrief, llm?: LLMClient): Promise<BucketSpec> {
  const niche = brief.niche.trim()
  const baseSlug = slug(niche) || 'site'
  const fallback: BucketSpec = {
    slug: baseSlug,
    title: niche.replace(/\b\w/g, (c) => c.toUpperCase()),
    description: `Content site about ${niche}${brief.audience ? ` for ${brief.audience}` : ''}.`,
    objectTypes: [
      { slug: 'articles', title: 'Articles' },
      { slug: 'authors', title: 'Authors' },
      { slug: 'tags', title: 'Tags' },
    ],
  }
  if (!llm) return fallback
  try {
    const res = await llm.complete({
      system: 'Return JSON: { slug, title, description }. Slug kebab-case, <=32 chars.',
      messages: [
        {
          role: 'user',
          content: `Brief: ${JSON.stringify(brief)}`,
        },
      ],
      json: true,
      maxTokens: 200,
      temperature: 0.3,
    })
    const j = JSON.parse(res.content) as Partial<BucketSpec>
    return {
      slug: typeof j.slug === 'string' ? slug(j.slug) : fallback.slug,
      title: typeof j.title === 'string' ? j.title : fallback.title,
      description: typeof j.description === 'string' ? j.description : fallback.description,
      objectTypes: fallback.objectTypes,
    }
  } catch {
    return fallback
  }
}
