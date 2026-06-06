/**
 * Stage 2 — generate N seed articles.
 *
 * We first ask the LLM for a list of titles tuned to the niche, then
 * fan out per-title to draft each article body.  Two-step keeps each
 * call small + makes partial failures (a single bad article) survivable.
 *
 * Without an LLM we still return N stub articles so the rest of the
 * pipeline can be exercised in tests.
 */

import type { LLMClient, SeedArticle, SiteBrief } from '../types.js'

const TITLE_PROMPT = `Generate {N} SEO-friendly blog post titles for a site about "{NICHE}".
Audience: {AUDIENCE}. Voice: {VOICE}.

Reply with ONLY a JSON array of strings — no commentary.`

const ARTICLE_PROMPT = `Write a 400–500 word blog post in markdown.
Title: {TITLE}
Niche: {NICHE}
Audience: {AUDIENCE}
Voice: {VOICE}

Sections: short intro, 3 H2 sections, brief conclusion. No emoji.
Reply with ONLY the markdown body (no front-matter, no title heading).`

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
}

function stubArticle(niche: string, idx: number): SeedArticle {
  const title = `${niche} starter post ${idx + 1}`
  return {
    slug: slugify(title),
    title,
    excerpt: `An introductory piece on ${niche}.`,
    markdown: `## Introduction\n\nA placeholder article about ${niche}.\n\n## Why it matters\n\nMore detail to come.\n\n## Next steps\n\nWrite real copy.\n`,
    tags: [slugify(niche)],
  }
}

export interface SeederUsage {
  inputTokens: number
  outputTokens: number
  articles: number
}

export async function generateSeedArticles(
  brief: SiteBrief,
  llm?: LLMClient,
): Promise<{ articles: SeedArticle[]; usage: SeederUsage }> {
  const n = Math.max(1, Math.min(brief.seedCount ?? 10, 20))
  const niche = brief.niche
  const audience = brief.audience ?? 'general'
  const voice = brief.voice ?? 'clear, friendly, expert'
  const usage: SeederUsage = { inputTokens: 0, outputTokens: 0, articles: 0 }

  if (!llm) {
    const stubs = Array.from({ length: n }, (_, i) => stubArticle(niche, i))
    usage.articles = stubs.length
    return { articles: stubs, usage }
  }

  // 1. titles
  let titles: string[] = []
  try {
    const res = await llm.complete({
      system: 'You write blog post titles.',
      messages: [
        {
          role: 'user',
          content: TITLE_PROMPT
            .replace('{N}', String(n))
            .replace('{NICHE}', niche)
            .replace('{AUDIENCE}', audience)
            .replace('{VOICE}', voice),
        },
      ],
      json: true,
      maxTokens: 500,
      temperature: 0.7,
    })
    usage.inputTokens += res.inputTokens ?? 0
    usage.outputTokens += res.outputTokens ?? 0
    const parsed = JSON.parse(res.content) as unknown
    if (Array.isArray(parsed)) titles = parsed.filter((s): s is string => typeof s === 'string')
  } catch {
    /* fall back to stubs below */
  }
  if (titles.length === 0) {
    return {
      articles: Array.from({ length: n }, (_, i) => stubArticle(niche, i)),
      usage,
    }
  }

  // 2. bodies
  const articles: SeedArticle[] = []
  for (let i = 0; i < Math.min(n, titles.length); i++) {
    const title = titles[i]!
    try {
      const res = await llm.complete({
        system: 'You write blog post bodies in markdown.',
        messages: [
          {
            role: 'user',
            content: ARTICLE_PROMPT
              .replace('{TITLE}', title)
              .replace('{NICHE}', niche)
              .replace('{AUDIENCE}', audience)
              .replace('{VOICE}', voice),
          },
        ],
        maxTokens: 1200,
        temperature: 0.6,
      })
      usage.inputTokens += res.inputTokens ?? 0
      usage.outputTokens += res.outputTokens ?? 0
      const body = res.content.trim()
      articles.push({
        slug: slugify(title),
        title,
        excerpt: body.split(/\n+/)[0]?.replace(/^#+\s*/, '').slice(0, 160) ?? '',
        markdown: body,
        tags: [slugify(niche)],
      })
      usage.articles += 1
    } catch {
      articles.push(stubArticle(niche, i))
    }
  }
  return { articles, usage }
}
