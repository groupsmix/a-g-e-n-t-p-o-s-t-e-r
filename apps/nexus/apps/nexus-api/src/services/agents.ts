// ============================================================
// Agent Roles — Phase 4
//
// 9 specialized agents, each with:
//  - A clear single job
//  - One AI call (no back-and-forth)
//  - Structured JSON output
//  - DB persistence via saveAgentOutput
//
// Agents communicate through the database, never directly.
// ============================================================

import type { Env } from '../env'
import { callAISimple, safeJson } from './shared'
import { saveAgentOutput, complete, fail } from './job-queue'
import type { Job } from './job-queue'

// ── Output type definitions ───────────────────────────────────────────────

export interface ResearcherOutput extends Record<string, unknown> {
  niche:            string
  demand_signal:    string
  top_competitors:  Array<{ name: string; price: number; weakness: string }>
  price_range:      { low: number; high: number; avg: number; currency: string }
  hooks:            string[]
  buyer_profile:    { age_range: string; pain_point: string; buying_trigger: string }
  keyword_angles:   string[]
}

export interface ScorerOutput extends Record<string, unknown> {
  score_buying_intent:       number   // 0–100
  score_pain_level:          number
  score_competition:         number   // higher = less competition = better
  score_creation_difficulty: number   // higher = easier to build = better
  score_product_clarity:     number
  score_platform_fit:        number
  score_risk_level:          number   // higher = safer
  score_uniqueness:          number
  total_score:               number   // weighted
  recommendation:            'build' | 'refine' | 'skip'
  reasoning: {
    buying_intent:       string
    pain_level:          string
    competition:         string
    creation_difficulty: string
    product_clarity:     string
    platform_fit:        string
    risk_level:          string
    uniqueness:          string
    verdict:             string
  }
}

export interface BuilderOutput extends Record<string, unknown> {
  product_type:    string
  outline:         string[]       // chapter/section titles
  deliverable:     string         // full product content (markdown)
  page_count:      number         // estimated
  format:          string         // 'pdf' | 'markdown' | 'template' | 'spreadsheet'
  usp:             string         // unique selling proposition (one sentence)
}

export interface CopywriterOutput extends Record<string, unknown> {
  title:           string         // final product title
  tagline:         string         // one line hook
  description:     string         // full sales description (300–500 words)
  bullet_benefits: string[]       // 5–7 benefit bullets
  cta:             string         // call-to-action text
  seo_title:       string
  seo_description: string         // 155 char max
  tags:            string[]       // 10–15 platform tags
}

export interface DesignerOutput extends Record<string, unknown> {
  cover_style:     string         // 'minimal' | 'bold' | 'editorial' | 'data'
  color_palette:   string[]       // hex codes
  typography:      string         // font pairing description
  cover_prompt:    string         // image generation prompt
  thumbnail_text:  string         // text overlay for the cover
  visual_direction: string        // overall visual concept
}

export interface InspectorOutput extends Record<string, unknown> {
  pass:            boolean
  score:           number          // 0–100
  issues:          string[]        // list of specific problems
  warnings:        string[]        // non-blocking concerns
  verdict:         'approve' | 'reject' | 'revise'
  rejection_reason?: string
}

export interface PublisherOutput extends Record<string, unknown> {
  published:       boolean
  platform:        string
  listing_url:     string | null
  listing_id:      string | null
  price:           number
  error?:          string
}

export interface MarketerOutput extends Record<string, unknown> {
  twitter_thread:  string[]       // 5 tweet thread
  instagram_caption: string
  email_subject:   string
  email_body:      string
  pinterest_pin:   { title: string; description: string; board: string }
  seo_blog_outline: string[]      // 5 blog section titles
  reddit_pitch:    string         // short community pitch
}

export interface AnalystOutput extends Record<string, unknown> {
  product_id:      string
  revenue_30d:     number
  units_sold:      number
  conversion_rate: number         // views → sales, 0–1
  verdict:         'winner' | 'mediocre' | 'loser'
  key_insight:     string
  next_action:     'double_down' | 'improve' | 'graveyard' | 'wait'
  improvement_suggestions: string[]
}

// ── Shared AI caller ──────────────────────────────────────────────────────

async function aiJson<T>(env: Env, taskType: string, prompt: string, timeoutMs = 60000): Promise<T | null> {
  try {
    const raw = await callAISimple(env, prompt, { taskType, outputFormat: 'json', timeoutMs })
    return safeJson<T>(raw)
  } catch {
    return null
  }
}

// ── Agent runner ──────────────────────────────────────────────────────────

export async function runJob(env: Env, job: Job): Promise<void> {
  const payload = safeJson<Record<string, unknown>>(job.payload) ?? {}

  try {
    let output: Record<string, unknown>

    switch (job.step_name) {
      case 'research_job':        output = await runResearcher(env, payload);  break
      case 'score_idea_job':      output = await runScorer(env, payload);      break
      case 'build_product_job':   output = await runBuilder(env, payload);     break
      case 'quality_check_job':   output = await runInspector(env, payload);   break
      case 'publish_job':         output = await runPublisher(env, payload);   break
      case 'marketing_job':       output = await runMarketer(env, payload);    break
      case 'revenue_sync_job':    output = await runAnalyst(env, payload);     break
      case 'winner_analysis_job': output = await runAnalyst(env, payload);     break
      case 'graveyard_analysis_job': output = await runAnalyst(env, payload);  break
      default:
        throw new Error(`Unknown job type: ${job.step_name}`)
    }

    await saveAgentOutput(env, agentNameFor(job.step_name), job.job_id, job.product_id, output)
    await complete(env, job.job_id, output)
    await updateProductFromAgent(env, job, output)

  } catch (err) {
    await fail(env, job.job_id, err instanceof Error ? err.message : String(err))
  }
}

function agentNameFor(stepName: string): string {
  const map: Record<string, string> = {
    research_job:          'researcher',
    score_idea_job:        'scorer',
    build_product_job:     'builder',
    quality_check_job:     'inspector',
    publish_job:           'publisher',
    marketing_job:         'marketer',
    revenue_sync_job:      'analyst',
    winner_analysis_job:   'analyst',
    graveyard_analysis_job:'analyst',
  }
  return map[stepName] ?? 'unknown'
}

// ── Agent 1: Researcher ───────────────────────────────────────────────────

async function runResearcher(env: Env, payload: Record<string, unknown>): Promise<ResearcherOutput> {
  const niche = String(payload.niche ?? 'general digital product')
  const domain = String(payload.domain ?? 'digital_product')

  const result = await aiJson<ResearcherOutput>(env, 'research_market', `
You are a sharp product researcher. Analyse this niche for a digital product.
Niche: "${niche}" (domain: ${domain})

Return ONLY valid JSON matching this exact schema:
{
  "niche": "${niche}",
  "demand_signal": "one specific sentence on who buys this and why now — concrete, not generic",
  "top_competitors": [{"name": "...", "price": 29, "weakness": "..."}, ...],
  "price_range": {"low": 9, "high": 79, "avg": 27, "currency": "USD"},
  "hooks": ["hook 1", "hook 2", "hook 3", "hook 4"],
  "buyer_profile": {"age_range": "25-40", "pain_point": "...", "buying_trigger": "..."},
  "keyword_angles": ["angle 1", "angle 2", "angle 3"]
}

Rules: 3–5 competitors, 4 hooks that are specific and clickable (no clichés), price range in USD.
`)

  if (!result) throw new Error('Researcher got no valid JSON from AI')
  return result
}

// ── Agent 2: Scoring Agent ────────────────────────────────────────────────

async function runScorer(env: Env, payload: Record<string, unknown>): Promise<ScorerOutput> {
  const niche = String(payload.niche ?? '')
  const research = payload.research_output as ResearcherOutput | undefined

  const context = research
    ? `Competitor prices: $${research.price_range?.low}–$${research.price_range?.high}. Demand: ${research.demand_signal}.`
    : ''

  const result = await aiJson<ScorerOutput>(env, 'score_idea', `
You are a product investment analyst. Score this digital product idea on 8 dimensions.
Niche: "${niche}"
${context}

Score each dimension 0–100 where 100 is best. For competition and risk: 100 = very low competition / very safe.
For creation_difficulty: 100 = very easy to build with AI.

Return ONLY valid JSON:
{
  "score_buying_intent": 0-100,
  "score_pain_level": 0-100,
  "score_competition": 0-100,
  "score_creation_difficulty": 0-100,
  "score_product_clarity": 0-100,
  "score_platform_fit": 0-100,
  "score_risk_level": 0-100,
  "score_uniqueness": 0-100,
  "total_score": 0-100,
  "recommendation": "build" | "refine" | "skip",
  "reasoning": {
    "buying_intent": "why this score",
    "pain_level": "why this score",
    "competition": "why this score",
    "creation_difficulty": "why this score",
    "product_clarity": "why this score",
    "platform_fit": "why this score",
    "risk_level": "why this score",
    "uniqueness": "why this score",
    "verdict": "one-sentence summary"
  }
}

Weights for total: buying_intent×0.20, pain_level×0.15, competition×0.15,
creation_difficulty×0.10, product_clarity×0.10, platform_fit×0.10, risk_level×0.10, uniqueness×0.10.
Build if total ≥ 70. Refine if 50–69. Skip if < 50.
`)

  if (!result) throw new Error('Scorer got no valid JSON from AI')

  // Persist to product_scores table
  if (payload.product_id || payload.opportunity_id) {
    await env.DB.prepare(`
      INSERT INTO product_scores
        (product_id, opportunity_id, niche,
         score_buying_intent, score_pain_level, score_competition,
         score_creation_difficulty, score_product_clarity, score_platform_fit,
         score_risk_level, score_uniqueness, total_score, reasoning, recommendation)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      payload.product_id    ?? null,
      payload.opportunity_id ?? null,
      niche,
      result.score_buying_intent, result.score_pain_level, result.score_competition,
      result.score_creation_difficulty, result.score_product_clarity, result.score_platform_fit,
      result.score_risk_level, result.score_uniqueness,
      Math.round(
        result.score_buying_intent       * 0.20 +
        result.score_pain_level          * 0.15 +
        result.score_competition         * 0.15 +
        result.score_creation_difficulty * 0.10 +
        result.score_product_clarity     * 0.10 +
        result.score_platform_fit        * 0.10 +
        result.score_risk_level          * 0.10 +
        result.score_uniqueness          * 0.10,
      ),
      JSON.stringify(result.reasoning),
      result.recommendation,
    ).run().catch(() => void 0)
  }

  return result
}

// ── Agent 3: Product Builder ──────────────────────────────────────────────

async function runBuilder(env: Env, payload: Record<string, unknown>): Promise<BuilderOutput> {
  const niche    = String(payload.niche ?? '')
  const research = payload.research_output as ResearcherOutput | undefined
  const scoring  = payload.scorer_output  as ScorerOutput      | undefined

  const context = [
    research ? `Demand: ${research.demand_signal}` : '',
    research?.buyer_profile ? `Buyer: ${research.buyer_profile.pain_point}` : '',
    scoring  ? `USP angle: ${scoring.reasoning?.verdict ?? ''}` : '',
  ].filter(Boolean).join('. ')

  const result = await aiJson<BuilderOutput>(env, 'build_product', `
You are a world-class digital product creator. Build a complete, sellable product.
Niche: "${niche}"
Context: ${context}

Return ONLY valid JSON:
{
  "product_type": "pdf_guide | template | spreadsheet | checklist | workbook | toolkit",
  "outline": ["Section 1: ...", "Section 2: ...", "..."],
  "deliverable": "# Product Title\\n\\nFull product content in markdown. At least 1500 words. Real, specific, useful content — not filler.",
  "page_count": 12,
  "format": "pdf",
  "usp": "One sentence that explains exactly what makes this different and valuable"
}

Rules: deliverable must be complete and ready to sell, not an outline. Write for the buyer.
`, 120000)

  if (!result) throw new Error('Builder got no valid JSON from AI')

  // Persist deliverable to products table
  if (payload.product_id) {
    await env.DB.prepare(`
      UPDATE products SET
        deliverable_content = ?,
        status = 'built',
        updated_at = datetime('now')
      WHERE id = ?
    `).bind(result.deliverable, payload.product_id as string).run().catch(() => void 0)
  }

  return result
}

// ── Agent 4: Copywriter ───────────────────────────────────────────────────
// NOTE: Copywriter + Designer are enqueued by the builder pipeline but live
// as separate job types using 'build_product_job' step with a sub-type field.
// Simplified here to the two most-used agents for the queue system.

// ── Agent 5: Quality Inspector ────────────────────────────────────────────

async function runInspector(env: Env, payload: Record<string, unknown>): Promise<InspectorOutput> {
  const niche    = String(payload.niche ?? '')
  const builder  = payload.builder_output  as BuilderOutput  | undefined
  const scorer   = payload.scorer_output   as ScorerOutput   | undefined

  const contentSnippet = builder?.deliverable?.slice(0, 800) ?? ''
  const totalScore     = scorer?.total_score ?? 0

  const result = await aiJson<InspectorOutput>(env, 'quality_check', `
You are a strict quality inspector for digital products. Be honest and specific — never vague.
Niche: "${niche}"
Opportunity score: ${totalScore}/100
Product content preview: "${contentSnippet.replace(/"/g, "'")}"

Check for: usefulness, originality, false/risky claims, weak title, thin content, copyright risk, policy violations.

Return ONLY valid JSON:
{
  "pass": true | false,
  "score": 0-100,
  "issues": ["specific issue 1", "..."],
  "warnings": ["non-blocking concern 1", "..."],
  "verdict": "approve" | "reject" | "revise",
  "rejection_reason": "only if reject"
}

Reject if: plagiarism, medical/legal/financial advice without disclaimer, score < 40, less than 500 words.
`)

  if (!result) throw new Error('Inspector got no valid JSON from AI')

  // Update product status based on verdict
  if (payload.product_id && result.verdict !== 'approve') {
    const newStatus = result.verdict === 'reject' ? 'rejected' : 'pending_review'
    await env.DB.prepare(`
      UPDATE products SET status = ?, updated_at = datetime('now') WHERE id = ?
    `).bind(newStatus, payload.product_id as string).run().catch(() => void 0)
  }
  if (payload.product_id && result.verdict === 'approve') {
    await env.DB.prepare(`
      UPDATE products SET status = 'approved', updated_at = datetime('now') WHERE id = ?
    `).bind(payload.product_id as string).run().catch(() => void 0)
  }

  return result
}

// ── Agent 6: Publisher ────────────────────────────────────────────────────

async function runPublisher(env: Env, payload: Record<string, unknown>): Promise<PublisherOutput> {
  // The publisher checks rules before publishing (allowed platforms, auto_publish setting).
  const { getSetting } = await import('./shared')
  const autoPublish     = (await getSetting(env, 'autopilot_auto_publish').catch(() => 'false')) === 'true'
  const killSwitch      = (await getSetting(env, 'kill_switch_active').catch(() => 'false'))     === 'true'

  if (killSwitch) throw new Error('Kill switch is ON — publishing blocked')
  if (!autoPublish) throw new Error('Auto-publish is OFF — manual publish required from Publish center')

  // Delegate to the existing Gumroad publisher service
  const productId = String(payload.product_id ?? '')
  if (!productId) throw new Error('publish_job requires product_id')

  const { publishProductToGumroad } = await import('./gumroad-publisher')
  const result = await publishProductToGumroad(env, productId)

  return {
    published:   result.ok,
    platform:    'gumroad',
    listing_url: result.gumroad_url ?? null,
    listing_id:  result.gumroad_product_id ?? null,
    price:       0, // Price is stored in product table, not in publish result
    error:       result.ok ? undefined : result.error,
  }
}

// ── Agent 7: Marketing Agent ──────────────────────────────────────────────

async function runMarketer(env: Env, payload: Record<string, unknown>): Promise<MarketerOutput> {
  const niche    = String(payload.niche ?? '')
  const title    = String(payload.title ?? niche)
  const desc     = String(payload.description ?? '')
  const url      = String(payload.listing_url ?? '')

  const result = await aiJson<MarketerOutput>(env, 'marketing', `
You are a conversion-focused marketing copywriter. Create a full promotional pack.
Product: "${title}"
Niche: "${niche}"
Description: "${desc.slice(0, 300)}"
URL: ${url || '(not published yet)'}

Return ONLY valid JSON:
{
  "twitter_thread": ["Tweet 1 (hook)", "Tweet 2", "Tweet 3", "Tweet 4", "Tweet 5 (CTA + link)"],
  "instagram_caption": "full caption with 15–20 hashtags at the end",
  "email_subject": "subject line",
  "email_body": "full plain-text email, 200–300 words",
  "pinterest_pin": {"title": "...", "description": "...", "board": "suggested board name"},
  "seo_blog_outline": ["Intro: ...", "Section 2: ...", "Section 3: ...", "Section 4: ...", "Conclusion: ..."],
  "reddit_pitch": "friendly 3-sentence community pitch (not salesy)"
}

Rules: No clichés. Twitter thread must have a story arc. Instagram caption hook in first line.
`)

  if (!result) throw new Error('Marketer got no valid JSON from AI')
  return result
}

// ── Agent 8 & 9: Analyst (Revenue / Winner / Graveyard) ──────────────────

async function runAnalyst(env: Env, payload: Record<string, unknown>): Promise<AnalystOutput> {
  const productId = String(payload.product_id ?? '')
  if (!productId) throw new Error('analyst job requires product_id')

  // Fetch real data from DB
  const product = await env.DB.prepare(`
    SELECT name, niche, ai_score, revenue_estimate, status FROM products WHERE id = ?
  `).bind(productId).first<{
    name: string | null; niche: string | null; ai_score: number | null;
    revenue_estimate: string | null; status: string | null;
  }>().catch(() => null)

  const revEst = product?.revenue_estimate
    ? (() => { try { return JSON.parse(product.revenue_estimate!) } catch { return null } })()
    : null

  const result = await aiJson<AnalystOutput>(env, 'analyze_winner', `
You are a data-driven product analyst. Evaluate this product's performance.
Product name: "${product?.name ?? 'Unknown'}"
Niche: "${product?.niche ?? 'Unknown'}"
AI score when built: ${product?.ai_score ?? 0}/10
Current status: ${product?.status ?? 'unknown'}
Revenue estimate: ${revEst ? `$${revEst.min}–$${revEst.max}/mo` : 'not available'}

Return ONLY valid JSON:
{
  "product_id": "${productId}",
  "revenue_30d": estimated USD revenue in last 30 days as a number,
  "units_sold": estimated units,
  "conversion_rate": 0.0 to 1.0,
  "verdict": "winner" | "mediocre" | "loser",
  "key_insight": "one specific insight about why it performs this way",
  "next_action": "double_down" | "improve" | "graveyard" | "wait",
  "improvement_suggestions": ["specific suggestion 1", "suggestion 2", "suggestion 3"]
}
`)

  if (!result) throw new Error('Analyst got no valid JSON from AI')
  return result
}

// ── Product update hook ───────────────────────────────────────────────────

async function updateProductFromAgent(env: Env, job: Job, output: Record<string, unknown>): Promise<void> {
  if (!job.product_id) return
  const now = new Date().toISOString()

  if (job.step_name === 'research_job') {
    const r = output as unknown as ResearcherOutput
    await env.DB.prepare(`
      UPDATE products SET niche = COALESCE(niche, ?), updated_at = ? WHERE id = ?
    `).bind(r.niche ?? null, now, job.product_id).run().catch(() => void 0)
  }

  if (job.step_name === 'score_idea_job') {
    const s = output as unknown as ScorerOutput
    await env.DB.prepare(`
      UPDATE products SET ai_score = ?, updated_at = ? WHERE id = ?
    `).bind(s.total_score / 10, now, job.product_id).run().catch(() => void 0)
  }

  if (job.step_name === 'winner_analysis_job') {
    const a = output as unknown as AnalystOutput
    if (a.next_action === 'graveyard') {
      await env.DB.prepare(`
        UPDATE products SET status = 'archived', updated_at = ? WHERE id = ?
      `).bind(now, job.product_id).run().catch(() => void 0)
    }
  }
}
