import type { Env } from '../env'
import { pickRecipe, getRecipe } from './recipes'
import { buildDeliverableHtml, renderPdf, type Deliverable } from './pdf'
import { callAISimple, safeJson } from './shared'

// Same human-voice directive used by the workflow writers, kept local so the
// deliverable reads like the rest of the product.
const HUMAN_VOICE = `Write like a sharp human expert talking to one person. Be specific and concrete. Never use clichés ("in today's fast-paced world", "unlock", "game-changer", "dive in", "elevate", "seamless", "robust") or AI throat-clearing. Vary sentence length. No filler.`

async function callAI(env: Env, prompt: string): Promise<string> {
  return callAISimple(env, prompt, { taskType: 'generate_long_form', outputFormat: 'json', timeoutMs: 120000 })
}

interface ProductRow {
  id: string
  name: string | null
  niche: string | null
  description: string | null
  deliverable_url: string | null
  brief_json: string | null
  domain_slug: string | null
  category_slug: string | null
}

interface Brief {
  niche?: string | null
  psychology?: {
    pains?: string[]
    desires?: string[]
    emotional_triggers?: string[]
    voice?: { tone?: string; style?: string }
  } | null
  market?: { competitors?: unknown; price_range?: { avg?: number } } | null
  keywords?: unknown
}

function list(arr: unknown, n: number): string {
  return Array.isArray(arr) ? arr.slice(0, n).map((x) => `- ${String(x)}`).join('\n') : ''
}

// Heuristic: does the draft read like lazy filler (bracket placeholders, vague
// "this section explains…" meta text, generic titles)? Used to trigger a single
// rewrite pass on the free model's weaker outputs.
function looksGeneric(d: Deliverable, format: string): boolean {
  const text = JSON.stringify(d).toLowerCase()
  const metaPhrases = [
    'this section explains',
    'this template provides',
    'replace the placeholder',
    'add your content here',
    'simply paste this block',
    'your own information',
    'general template',
    'sample text',
    'lorem ipsum',
    'insert your',
  ].filter((p) => text.includes(p)).length
  // Brackets are legitimate fill-in fields for Template/Planner formats, so only
  // count them as "generic filler" for the prose formats that shouldn't use them.
  const fillIn = /template|planner|workbook/i.test(format)
  const placeholders = fillIn ? 0 : (text.match(/\[[a-z0-9_ ]{2,30}\]/g) || []).length
  return placeholders >= 4 || metaPhrases >= 2
}

// Generate the real downloadable deliverable for a single product and attach
// it (PDF in R2 + products.deliverable_url). Runs in its own worker invocation
// so it gets a full time budget instead of riding the tail of a long workflow.
// Returns the deliverable URL, or null when it couldn't be produced.
export async function generateDeliverableForProduct(
  env: Env,
  productId: string,
  opts: { force?: boolean; format?: string } = {},
): Promise<{ url: string; format: string } | null> {
  if (!env.BROWSER) return null // PDF needs Browser Rendering.

  const product = await env.DB.prepare(
    `SELECT p.id, p.name, p.niche, p.description, p.deliverable_url, p.brief_json,
            d.slug AS domain_slug, c.slug AS category_slug
       FROM products p
       LEFT JOIN domains d ON p.domain_id = d.id
       LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.id = ?`,
  ).bind(productId).first<ProductRow>()
  if (!product) return null
  if (product.deliverable_url && !opts.force) {
    return { url: product.deliverable_url, format: '' }
  }

  let brief: Brief = {}
  try {
    brief = (product.brief_json ? JSON.parse(product.brief_json) : {}) as Brief
  } catch {
    brief = {}
  }
  const niche = product.niche || brief.niche || product.name || 'general'
  const recipe =
    getRecipe(opts.format) ?? pickRecipe(product.domain_slug || '', product.category_slug || '', niche)
  const psy = brief.psychology || {}
  const context = (product.description || '').slice(0, 2000)
  const tone = psy.voice?.tone || 'confident, plain-spoken expert'

  const buyerBlock = [
    psy.pains?.length ? `Their real pains:\n${list(psy.pains, 5)}` : '',
    psy.desires?.length ? `The outcomes they want:\n${list(psy.desires, 5)}` : '',
    psy.emotional_triggers?.length ? `Emotional triggers:\n${list(psy.emotional_triggers, 4)}` : '',
  ].filter(Boolean).join('\n\n')

  const prompt = `You are creating the ACTUAL downloadable product a buyer pays for — the real file they open and use, NOT marketing copy and NOT a sample/outline. This is a ${recipe.format} for "${niche}".
${recipe.instruction}

${HUMAN_VOICE}
Write in this voice: ${tone}.

${buyerBlock || `Product context:\n${context}`}
${buyerBlock && context ? `\nProduct angle / promise:\n${context}` : ''}

HARD RULES — this is what makes it worth paying for:
- Be SPECIFIC to "${niche}". Use real, concrete examples, numbers, names, and steps a buyer in this niche would recognise.
- Do NOT output generic [PLACEHOLDER] / [BRACKET] filler as the content. The ONLY acceptable brackets are genuine fill-in fields in a Template/Planner (e.g. a labelled blank a user writes into) — and even then the surrounding instructions must be specific.
- No "this section explains…" meta text. Write the actual content, not a description of it.
- Every section must give the buyer something they can use immediately.

8-10 sections of real, usable substance. Return ONLY JSON:
{"cover_title":string,"cover_subtitle":string,"intro":string,"sections":[{"heading":string,"content":string (optional),"checklist":[string] (optional),"table":{"headers":[string],"rows":[[string]]} (optional)}],"closing":string}
Use checklist/table where they fit a ${recipe.format}. Keep it under ~1100 words. JSON only.`

  // The free model is occasionally lazy/invalid; try twice before giving up.
  let d: Deliverable | null = null
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      d = safeJson<Deliverable>(await callAI(env, prompt))
    } catch (err) {
      console.error(`[deliverable] generation failed for ${productId} (attempt ${attempt}):`, err)
      d = null
    }
    if (d && typeof d === 'object' && Array.isArray(d.sections) && d.sections.length > 0) break
    d = null
  }
  if (!d) return null

  // Self-critique pass: if the first draft is generic, rewrite it once. Cheap
  // insurance against the free model's placeholder-filler habit. Best-effort.
  if (looksGeneric(d, recipe.format)) {
    const refinePrompt = `This ${recipe.format} for "${niche}" is too generic — it uses placeholder/bracket filler or vague "this section explains" text instead of real, specific content.
Rewrite it so every section is concrete and specific to "${niche}": real examples, numbers, names, steps. Keep genuine fill-in fields only where a ${recipe.format} truly needs them. Same JSON shape, same keys. JSON only.

Current draft:
${JSON.stringify(d).slice(0, 3500)}`
    try {
      const refined = safeJson<Deliverable>(await callAI(env, refinePrompt))
      if (refined && Array.isArray(refined.sections) && refined.sections.length > 0 && !looksGeneric(refined, recipe.format)) {
        d = refined
      }
    } catch (err) {
      console.error(`[deliverable] refine pass failed for ${productId}:`, err)
    }
  }

  try {
    const pdf = await renderPdf(env, buildDeliverableHtml(d, recipe.format))
    if (!pdf) return null
    const key = `products/${productId}-deliverable.pdf`
    await env.ASSETS.put(key, pdf, { httpMetadata: { contentType: 'application/pdf' } })
    const url = `/api/assets/r2/${key}`
    await env.DB.prepare(
      `UPDATE products SET deliverable_url=?, deliverable_format=?, updated_at=? WHERE id=?`,
    ).bind(url, recipe.format, new Date().toISOString(), productId).run()
    await env.DB.prepare(
      `INSERT INTO assets (id, product_id, asset_type, r2_key, filename, mime_type)
       VALUES (?, ?, 'deliverable_pdf', ?, ?, 'application/pdf')`,
    ).bind(crypto.randomUUID(), productId, key, 'deliverable.pdf').run().catch(() => void 0)
    return { url, format: recipe.format }
  } catch (err) {
    console.error(`[deliverable] render failed for ${productId}:`, err)
    return null
  }
}

// Nightly safety net: attach deliverables to recently-built products that
// don't have one yet (e.g. the inline self-invoke was evicted). Processed a
// few at a time to stay within the cron's time budget.
export async function backfillDeliverables(env: Env, limit = 3): Promise<void> {
  if (!env.BROWSER) return
  const rows = await env.DB.prepare(
    `SELECT id FROM products
      WHERE deliverable_url IS NULL
        AND status IN ('approved','pending_review','published')
      ORDER BY updated_at DESC
      LIMIT ?`,
  ).bind(limit).all<{ id: string }>().catch(() => null)
  for (const row of rows?.results ?? []) {
    await generateDeliverableForProduct(env, row.id).catch((err) =>
      console.error(`[deliverable] backfill failed for ${row.id}:`, err),
    )
  }
}
