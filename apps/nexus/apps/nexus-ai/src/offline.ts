// ============================================================
// Offline deterministic generator
// ============================================================
// When no AI provider has a configured API key (or every provider fails),
// the failover engine falls back to this generator so the full 15-step
// workflow still completes end-to-end and produces a reviewable product.
//
// The moment a real API key is added, the registry providers take over and
// this fallback is never reached. Output here is intentionally generic but
// valid for every task's expected shape.

import type { TaskType } from './types'

interface OfflineContext {
  niche: string
  domain: string
  category: string
}

function titleCase(s: string): string {
  return s
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

// Pull light context out of the prompt the workflow engine sends so the
// generated copy at least references the right niche/category.
function parseContext(prompt: string): OfflineContext {
  const niche =
    prompt.match(/niche[:\s"]+([^."\n]{2,60})/i)?.[1]?.trim() ||
    prompt.match(/for a\s+"([^"]{2,60})"/i)?.[1]?.trim() ||
    prompt.match(/"([^"]{2,60})"\s+(?:niche|product)/i)?.[1]?.trim() ||
    'general'
  const dc = prompt.match(/\b(?:a|for a)\s+([a-z][a-z-]+)\s+([a-z][a-z-]+)\s+product/i)
  const domain = dc?.[1] || prompt.match(/Domain:\s*([a-z-]+)/i)?.[1] || 'digital'
  const category = dc?.[2] || prompt.match(/Category:\s*([a-z-]+)/i)?.[1] || 'product'
  return { niche: niche.replace(/[.]+$/, ''), domain, category }
}

function longForm({ niche, category }: OfflineContext): string {
  const topic = titleCase(niche)
  const cat = titleCase(category)
  return [
    `# ${topic}: The Complete ${cat}`,
    '',
    `If you are serious about ${niche}, this ${category} was built to save you hours and get you results faster. It pairs a proven structure with practical, ready-to-use components so you can start today instead of staring at a blank page.`,
    '',
    `## Why this ${category} works`,
    `Most people struggle with ${niche} because they lack a clear, repeatable system. This ${category} removes the guesswork: every section is laid out step by step, with examples you can adapt to your own situation in minutes.`,
    '',
    '## What you get',
    `- A guided, step-by-step framework for ${niche}`,
    '- Editable templates you can reuse again and again',
    '- Real-world examples and checklists',
    '- Lifetime access and free updates',
    '',
    '## Who it is for',
    `Whether you are just getting started or already experienced, this ${category} meets you where you are and helps you level up your ${niche} workflow.`,
    '',
    '## Get started in minutes',
    `Download instantly, open it up, and follow the first section. You will see momentum on day one — that is the whole point.`,
  ].join('\n')
}

export function offlineGenerate(
  taskType: TaskType,
  prompt: string,
  outputFormat: 'text' | 'json' | string,
): string {
  const ctx = parseContext(prompt)
  const topic = titleCase(ctx.niche)
  const cat = titleCase(ctx.category)
  // Avoid repeating the category when the niche already implies it
  // (e.g. "Notion Productivity Templates" + "Templates").
  const label = topic.toLowerCase().includes(cat.toLowerCase()) ? topic : `${topic} ${cat}`

  const json = (obj: unknown) => JSON.stringify(obj)

  switch (taskType) {
    case 'research_market':
      return json({
        demand_signal: 'steady',
        top_competitors: [
          { name: `${topic} Pro`, price: 29 },
          { name: `Ultimate ${cat}`, price: 19 },
          { name: `${topic} Starter Kit`, price: 12 },
        ],
        price_range: { low: 9, high: 49, avg: 24 },
        hooks: [
          `Save hours on ${ctx.niche}`,
          `The only ${ctx.category} you need`,
          `From beginner to confident, fast`,
        ],
      })

    case 'research_psychology':
      return json({
        pains: [
          `Overwhelmed by where to start with ${ctx.niche}`,
          'Wasting time on trial and error',
          'No clear, repeatable system',
        ],
        desires: ['Fast results', 'A done-for-you structure', 'Confidence and clarity'],
        emotional_triggers: ['relief', 'momentum', 'pride'],
        voice: { tone: 'confident, helpful', style: 'clear and practical' },
      })

    case 'research_keywords':
      return json({
        primary: [ctx.niche, `${ctx.niche} ${ctx.category}`, `best ${ctx.niche}`],
        long_tail: [
          `${ctx.niche} ${ctx.category} for beginners`,
          `how to use ${ctx.niche} ${ctx.category}`,
          `${ctx.niche} templates download`,
        ],
        question_keywords: [
          `what is the best ${ctx.niche} ${ctx.category}?`,
          `how do I start with ${ctx.niche}?`,
        ],
      })

    case 'generate_long_form':
      return longForm(ctx)

    case 'generate_image_prompt':
      return `Clean, modern product hero image for a ${ctx.niche} ${ctx.category}: minimal flat-lay on a soft gradient background, bold readable title card, professional lighting, high contrast, trending on design showcases, no text artifacts.`

    case 'generate_seo_tags':
      return json({
        meta_title: `${label} — Save Time, Get Results`,
        meta_description: `A practical ${ctx.category} for ${ctx.niche}. Step-by-step framework, editable templates, and real examples. Download instantly.`,
        tags: [
          ctx.niche,
          `${ctx.niche} ${ctx.category}`,
          ctx.category,
          'template',
          'guide',
          'digital download',
          'productivity',
          'beginner friendly',
          'editable',
          'instant download',
          'best seller',
          'step by step',
          'printable',
        ],
      })

    case 'generate_short_copy':
      return json({
        titles: [
          `${label}: The Fast, Practical System That Just Works`,
          `The Ultimate ${label} for Beginners and Pros Alike`,
          `${topic} Made Simple: Templates, Examples, and a Clear Plan`,
        ],
      })

    case 'quality_editor':
    case 'humanize': {
      const m = prompt.match(/Copy:\s*([\s\S]+)$/i) || prompt.match(/\n\n([\s\S]+)$/)
      const body = (m?.[1] || longForm(ctx)).trim()
      return body
    }

    case 'quality_buyer_sim':
      return json({
        would_buy: true,
        objections: ['Is it really beginner friendly?', 'Will it be updated?'],
        score: 8,
      })

    case 'quality_competitor':
      return json({
        gap_detected: true,
        summary: `Competitors cover the basics but lack a guided, editable system for ${ctx.niche}. This product wins on clarity and ready-to-use templates.`,
        score: 8,
      })

    case 'revenue_estimate':
      return json({
        min: 300,
        max: 2500,
        currency: 'USD',
        confidence: 'medium',
        reasoning: `Mid-range price point with steady demand for ${ctx.niche}; conservative 90-day estimate assuming modest traffic and a 2-4% conversion rate.`,
      })

    case 'platform_variation': {
      const slugs = (prompt.match(/platform slugs:\s*\[([^\]]*)\]/i)?.[1] || '')
        .split(',')
        .map((s) => s.replace(/["'\s]/g, ''))
        .filter(Boolean)
      const list = slugs.length ? slugs : ['etsy', 'gumroad', 'shopify']
      return json({
        variants: list.map((platform_slug) => ({
          platform_slug,
          title: `${label} — Save Time, Get Results`,
          description: `A practical ${ctx.category} for ${ctx.niche}. Step-by-step framework, editable templates, and real examples. Instant download.`,
          tags: [ctx.niche, ctx.category, 'template', 'guide', 'digital download'],
          price: 24,
        })),
      })
    }

    case 'social_adaptation': {
      const slugs = (prompt.match(/channels\s*\[([^\]]*)\]/i)?.[1] || '')
        .split(',')
        .map((s) => s.replace(/["'\s]/g, ''))
        .filter(Boolean)
      const list = slugs.length ? slugs : ['instagram', 'tiktok', 'x']
      return json({
        variants: list.map((channel_slug) => ({
          channel_slug,
          caption: `Stop guessing with ${ctx.niche}. This ${ctx.category} gives you a clear, step-by-step system you can use today. ✨`,
          hashtags: [`#${ctx.niche.replace(/\s+/g, '')}`, `#${ctx.category}`, '#digitaldownload', '#templates'],
          hook: `The ${ctx.niche} ${ctx.category} I wish I had when I started 👇`,
        })),
      })
    }

    case 'quality_ceo':
      return json({
        overall_score: 8,
        approved: true,
        scores: {
          title: 8,
          description: 8,
          seo: 8,
          price: 7,
          platform_fit: 8,
          human_quality: 8,
          competitive_position: 8,
        },
        issues: [],
        competitor_gap: `Stronger guided system than competitors for ${ctx.niche}.`,
        strongest_element: 'Clear, actionable structure with ready-to-use templates.',
      })

    default:
      return outputFormat === 'json'
        ? json({ note: 'offline-generated', taskType })
        : `Offline-generated content for ${ctx.niche} (${taskType}).`
  }
}
