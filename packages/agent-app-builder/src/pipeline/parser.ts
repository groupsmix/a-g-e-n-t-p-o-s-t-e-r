/**
 * Stage 1 — parse a free-form prompt into a structured AppSpec.
 *
 * Strategy: prompt the LLM to output JSON matching the AppSpec shape.
 * If the LLM is unavailable or the call fails, fall back to a heuristic
 * parser that scans the prompt for known keywords (next, hono, react,
 * auth, db, payments, etc.). The heuristic mode is always safe to call
 * during tests.
 */

import type { AppSpec, AppTemplate, AppFeature, LLMClient } from '../types.js'

const TEMPLATE_KEYWORDS: Record<AppTemplate, RegExp> = {
  'next-app': /\bnext(\.?js)?\b|\bapp router\b/i,
  'hono-api': /\bhono\b|\bworker\b|\bapi\b/i,
  'static-site': /\bstatic\b|\blanding page\b/i,
  'react-spa': /\breact\b|\bspa\b|\bsingle[- ]page\b|\bvite\b/i,
}

const FEATURE_KEYWORDS: Record<AppFeature, RegExp> = {
  auth: /\b(auth|login|signup|sign[- ]in|clerk|next-auth)\b/i,
  db: /\b(db|database|d1|postgres|sqlite|drizzle|prisma)\b/i,
  payments: /\b(stripe|payment|checkout|gumroad)\b/i,
  email: /\b(email|resend|postmark|newsletter)\b/i,
  cron: /\b(cron|scheduled|recurring|hourly|daily)\b/i,
  ai: /\b(ai|llm|gpt|claude|openai|anthropic)\b/i,
  analytics: /\b(analytics|posthog|plausible|tracking)\b/i,
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'app'
}

export function heuristicParse(prompt: string): AppSpec {
  // pick the first matching template, default to next-app
  let template: AppTemplate = 'next-app'
  for (const [t, rx] of Object.entries(TEMPLATE_KEYWORDS)) {
    if (rx.test(prompt)) {
      template = t as AppTemplate
      break
    }
  }
  const features: AppFeature[] = []
  for (const [f, rx] of Object.entries(FEATURE_KEYWORDS)) {
    if (rx.test(prompt)) features.push(f as AppFeature)
  }

  // crude name extraction: take first quoted phrase or first 3-4 words
  const quoted = prompt.match(/["']([^"']{3,40})["']/)
  const name = slugify(quoted?.[1] ?? prompt.split(/\s+/).slice(0, 4).join(' '))

  return {
    name,
    pitch: prompt.slice(0, 160).trim(),
    template,
    pages:
      template === 'hono-api'
        ? [
            { path: '/health', purpose: 'health check' },
            { path: '/api/echo', purpose: 'echo request body' },
          ]
        : [
            { path: '/', purpose: 'landing page' },
            { path: '/about', purpose: 'about the app' },
          ],
    features,
  }
}

const SYSTEM_PROMPT = `You translate a user's plain-English app idea into a strict JSON AppSpec.
Reply with ONLY a JSON object (no markdown fences) matching this TypeScript:

{
  name: string                 // kebab-case slug, <= 40 chars
  pitch: string                // one sentence
  template: "next-app" | "hono-api" | "static-site" | "react-spa"
  pages: Array<{ path: string, purpose: string }>
  features: Array<"auth"|"db"|"payments"|"email"|"cron"|"ai"|"analytics">
  notes: string                // extra context for codegen
}

Pick the simplest template that fits. Pages should be 2–5 entries.`

export async function parseSpec(
  prompt: string,
  llm?: LLMClient,
): Promise<AppSpec> {
  if (!llm) return heuristicParse(prompt)
  try {
    const res = await llm.complete({
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
      json: true,
      maxTokens: 600,
      temperature: 0.2,
    })
    const parsed = JSON.parse(res.content) as Partial<AppSpec>
    // Defensive merge with heuristic defaults — never trust LLM JSON shape blindly.
    const fallback = heuristicParse(prompt)
    return {
      name: parsed.name ?? fallback.name,
      pitch: parsed.pitch ?? fallback.pitch,
      template: (parsed.template as AppTemplate) ?? fallback.template,
      pages: Array.isArray(parsed.pages) && parsed.pages.length ? parsed.pages : fallback.pages,
      features: Array.isArray(parsed.features) ? parsed.features : fallback.features,
      notes: typeof parsed.notes === 'string' ? parsed.notes : undefined,
    }
  } catch {
    return heuristicParse(prompt)
  }
}
