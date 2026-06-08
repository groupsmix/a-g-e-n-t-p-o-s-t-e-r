// ============================================================
// NEXUS ProductWorkflow — 15-step AI product creation pipeline
// ============================================================
//
// Runs asynchronously after /workflow/start via ctx.waitUntil().
// Each step is persisted to `workflow_steps` before + after execution so the
// UI can poll `/api/workflow/:id` and watch progress live.
//
// Every AI call goes through the nexus-ai service binding, which wraps the
// 25+ model failover engine. Each step gets its own TaskType so the registry
// picks the best provider for the job.

import type { Env } from '../env'
import type { TaskType, AIRunTaskResponse } from '@nexus/types'
import { callAI as sharedCallAI, safeJson } from './shared'
import { checkPostBuild } from './quality-gate'

interface StepDef {
  name: string
  taskType: TaskType
  outputFormat: 'text' | 'json'
  buildPrompt: (ctx: WorkflowContext) => string
  apply: (ctx: WorkflowContext, raw: string) => void
  // Optional: skip the step (no AI call) when it has nothing to do.
  skip?: (ctx: WorkflowContext) => boolean
}

interface WorkflowContext {
  runId: string
  productId: string
  domainSlug: string
  categorySlug: string
  userInput: Record<string, unknown>
  // Accumulated outputs from earlier steps — later steps can reference them.
  data: Record<string, any>
}

// ------------------------------------------------------------
// Shared quality directives — injected into the writing steps so
// the output is specific and human, not generic AI filler.
// ------------------------------------------------------------

// Phrases that scream "written by AI" — banned outright.
const BANNED_PHRASES = [
  'in today\'s fast-paced world', 'in the digital age', 'in this day and age',
  'unlock', 'unleash', 'elevate', 'embark', 'embark on a journey', 'dive in',
  'delve', 'navigate the', 'in conclusion', 'in summary', 'last but not least',
  'game-changer', 'game changer', 'revolutionize', 'revolutionary', 'cutting-edge',
  'seamless', 'seamlessly', 'robust', 'leverage', 'harness', 'tapestry',
  'realm', 'landscape of', 'when it comes to', 'at the end of the day',
  'it is important to note', 'it\'s worth noting', 'rest assured',
  'look no further', 'whether you\'re a', 'take your ... to the next level',
  'as an ai', 'i cannot', 'supercharge', 'turbocharge', 'a myriad of',
  'plethora', 'ever-evolving', 'ever-changing', 'fast-paced', 'bustling',
]

// Reusable rules for any prose-writing step.
const HUMAN_VOICE = `WRITE LIKE A SHARP HUMAN EXPERT, NOT AN AI:
- Be specific. Use concrete examples, real numbers, named tools/situations — never vague generalities.
- Vary sentence length. Mix short punchy lines with longer ones. Read it aloud in your head; if it sounds robotic, rewrite it.
- Active voice. Talk directly to the reader ("you"). No corporate hedging.
- Earn every sentence. Cut filler, throat-clearing intros, and summaries that just restate.
- No clichés or hype. NEVER use these phrases: ${BANNED_PHRASES.join('; ')}.
- Don't open with "In today's..." or any scene-setting platitude — start with the most useful thing immediately.
- Sound like one knowledgeable person wrote it on a good day: confident, plain, a little opinionated.`

// ------------------------------------------------------------
// The 15 canonical steps (NEXUS-ARCHITECTURE-V4 §9)
// ------------------------------------------------------------

const STEPS: StepDef[] = [
  {
    name: 'research_market',
    taskType: 'research_market',
    outputFormat: 'json',
    buildPrompt: (ctx) =>
      `You are a sharp market researcher who knows this exact niche. Be concrete — name real-style competitor products and realistic prices, not placeholders.
Niche: "${ctx.userInput.niche ?? 'general'}" (${ctx.domainSlug} / ${ctx.categorySlug}). Seed keywords: ${ctx.userInput.keywords ?? '—'}.
Return ONLY JSON: {demand_signal:string (one specific sentence on who buys this and why now), top_competitors:[{name,price}] (3-5, plausible real names + prices), price_range:{low,high,avg} (numbers), hooks:[string] (4 specific angles a buyer would actually click — no generic "best ever" lines)}.`,
    apply: (ctx, raw) => {
      ctx.data.market = safeJson(raw)
    },
  },
  {
    name: 'research_psychology',
    taskType: 'research_psychology',
    outputFormat: 'json',
    buildPrompt: (ctx) =>
      `Profile the real buyer of "${ctx.userInput.niche ?? 'general'}" (${ctx.domainSlug}/${ctx.categorySlug}). Be specific to THIS buyer — concrete frustrations and moments, not generic "saves time / easy to use".
Return ONLY JSON {pains:[string] (4, specific situations), desires:[string] (4, concrete outcomes), emotional_triggers:[string] (3), voice:{tone:string, style:string} (how to talk to them)}.`,
    apply: (ctx, raw) => {
      ctx.data.psychology = safeJson(raw)
    },
  },
  {
    name: 'research_keywords',
    taskType: 'research_keywords',
    outputFormat: 'json',
    buildPrompt: (ctx) =>
      `Return JSON {primary:[string], long_tail:[string], question_keywords:[string]} for ${ctx.domainSlug}/${ctx.categorySlug}. Seed: ${ctx.userInput.keywords ?? '—'}.`,
    apply: (ctx, raw) => {
      ctx.data.keywords = safeJson(raw)
    },
  },
  {
    name: 'generate_content',
    taskType: 'generate_long_form',
    outputFormat: 'text',
    buildPrompt: (ctx) =>
      `Write the main product content (800-1400 words) for "${ctx.userInput.niche ?? 'general'}" (${ctx.domainSlug} ${ctx.categorySlug}).

${HUMAN_VOICE}

This specific buyer's real pains: ${JSON.stringify(ctx.data.psychology?.pains ?? []).slice(0, 400)}. Their desired outcomes: ${JSON.stringify(ctx.data.psychology?.desires ?? []).slice(0, 300)}. Tone: ${ctx.data.psychology?.voice?.tone ?? 'confident, plain'}.
Requirements: open with a concrete hook tied to one real pain (no "in today's..."); use clear markdown headings and short paragraphs; include at least one concrete example or mini-walkthrough; weave in these phrases naturally where they fit, never stuffed: ${JSON.stringify(ctx.data.keywords?.long_tail ?? []).slice(0, 400)}; end with a direct, non-cheesy call to action. Language: ${ctx.userInput.language ?? 'en'}. Return the content only.`,
    apply: (ctx, raw) => {
      ctx.data.content = raw
    },
  },
  {
    name: 'generate_assets',
    taskType: 'generate_image_prompt',
    outputFormat: 'text',
    buildPrompt: (ctx) =>
      `Write ONE image generation prompt (≤80 words) for a ${ctx.domainSlug} ${ctx.categorySlug} product in the niche "${ctx.userInput.niche ?? 'general'}". Mood derived from: ${JSON.stringify(ctx.data.psychology?.emotional_triggers ?? []).slice(0, 200)}. Output the prompt only, no preamble.`,
    apply: (ctx, raw) => {
      ctx.data.image_prompt = raw.trim()
    },
  },
  {
    name: 'generate_seo',
    taskType: 'generate_seo_tags',
    outputFormat: 'json',
    buildPrompt: (ctx) =>
      `Write SEO metadata for "${ctx.userInput.niche ?? 'general'}" (${ctx.domainSlug} ${ctx.categorySlug}). The meta_description must be a real, specific, click-worthy sentence (≤155 chars) — concrete benefit, no clichés like "elevate/unlock/seamless". Tags should be terms a buyer actually searches, not generic filler.\nPrimary keywords: ${JSON.stringify(ctx.data.keywords?.primary ?? []).slice(0, 200)}. Content excerpt: "${String(ctx.data.content ?? '').slice(0, 400)}".\nReturn ONLY JSON {meta_title, meta_description, tags:[string] (13 items)}.`,
    apply: (ctx, raw) => {
      const j = safeJson(raw)
      ctx.data.seo = j
      ctx.data.tags = Array.isArray(j?.tags) ? j.tags : []
    },
  },
  {
    name: 'generate_title_variants',
    taskType: 'generate_short_copy',
    outputFormat: 'json',
    buildPrompt: (ctx) =>
      `Write 3 product titles for "${ctx.userInput.niche ?? 'general'}" (${ctx.domainSlug} ${ctx.categorySlug}). Each 60-80 chars, benefit-led and specific to this buyer — no clickbait, no "Ultimate/Best Ever", no banned clichés (${BANNED_PHRASES.slice(0, 12).join(', ')}...). Use these keywords where natural: ${JSON.stringify(ctx.data.keywords?.primary ?? []).slice(0, 160)}.
Return ONLY JSON {titles:[string] (exactly 3)}.`,
    apply: (ctx, raw) => {
      const j = safeJson(raw)
      ctx.data.title_variants = Array.isArray(j?.titles) ? j.titles : []
    },
  },
  {
    name: 'quality_editor',
    taskType: 'quality_editor',
    outputFormat: 'text',
    buildPrompt: (ctx) =>
      `You are a ruthless editor. Tighten this copy: cut filler and throat-clearing, fix flow and grammar, vary sentence length, and delete any cliché or hype. Keep all substance, examples, and keywords. Do NOT pad it back out. ${HUMAN_VOICE}
Return the edited copy only.

${String(ctx.data.content ?? '').slice(0, 4000)}`,
    apply: (ctx, raw) => {
      ctx.data.content = raw
    },
  },
  {
    name: 'quality_buyer_sim',
    taskType: 'quality_buyer_sim',
    outputFormat: 'json',
    buildPrompt: (ctx) =>
      `You are the target buyer (pains: ${JSON.stringify(ctx.data.psychology?.pains ?? []).slice(0, 200)}). Return JSON {would_buy:boolean, objections:[string], score:number (0-10)} for the product "${ctx.data.title_variants?.[0] ?? ''}" with copy: "${String(ctx.data.content ?? '').slice(0, 600)}".`,
    apply: (ctx, raw) => {
      ctx.data.buyer_sim = safeJson(raw)
    },
  },
  {
    name: 'quality_competitor',
    taskType: 'quality_competitor',
    outputFormat: 'json',
    buildPrompt: (ctx) =>
      `Compare our product against competitors ${JSON.stringify(ctx.data.market?.top_competitors ?? []).slice(0, 300)}. Return JSON {gap_detected:boolean, summary:string, score:number (0-10)}.`,
    apply: (ctx, raw) => {
      ctx.data.competitor = safeJson(raw)
    },
  },
  {
    name: 'humanize',
    taskType: 'humanize',
    outputFormat: 'text',
    buildPrompt: (ctx) =>
      `Rewrite this so no one could tell an AI wrote it. Keep all substance, structure, and keywords.
${HUMAN_VOICE}
Specifically: break up any uniform paragraph rhythm, replace any abstract sentence with a concrete one, remove every banned phrase above, and add the small imperfections of real writing (a short fragment, a direct aside) where natural. Don't add new fluff. Return the rewritten copy only.

${String(ctx.data.content ?? '').slice(0, 4000)}`,
    apply: (ctx, raw) => {
      ctx.data.content = raw
    },
  },
  {
    name: 'revenue_estimate',
    taskType: 'revenue_estimate',
    outputFormat: 'json',
    buildPrompt: (ctx) =>
      `Return JSON {min:number, max:number, currency:string, confidence:"low"|"medium"|"high", reasoning:string} estimating 90-day revenue for a ${ctx.domainSlug} ${ctx.categorySlug} with market ${JSON.stringify(ctx.data.market?.price_range ?? {}).slice(0, 160)}.`,
    apply: (ctx, raw) => {
      ctx.data.revenue = safeJson(raw)
    },
  },
  {
    name: 'generate_platform_variants',
    taskType: 'platform_variation',
    outputFormat: 'json',
    buildPrompt: (ctx) =>
      `Return JSON {variants:[{platform_slug:string, title:string, description:string, tags:[string], price:number}]} for a "${ctx.userInput.niche ?? 'general'}" ${ctx.categorySlug} for each of these platform slugs: ${JSON.stringify(ctx.userInput.selected_platform_ids ?? []).slice(0, 200)}. Base copy: "${String(ctx.data.content ?? '').slice(0, 600)}".`,
    apply: (ctx, raw) => {
      const j = safeJson(raw)
      ctx.data.platform_variants = Array.isArray(j?.variants) ? j.variants : []
    },
    skip: (ctx) => !Array.isArray(ctx.userInput.selected_platform_ids) || (ctx.userInput.selected_platform_ids as unknown[]).length === 0,
  },
  {
    name: 'generate_social_content',
    taskType: 'social_adaptation',
    outputFormat: 'json',
    buildPrompt: (ctx) =>
      `Write social posts for "${ctx.userInput.niche ?? 'general'}" (${ctx.categorySlug}) for these channels: ${JSON.stringify(ctx.userInput.selected_social_channel_ids ?? []).slice(0, 200)}.\nEach caption must sound native to its platform and like a real person posted it — a strong first-line hook, one concrete benefit or example, no hashtag soup, no clichés (no "unlock/elevate/game-changer/in today's"). Hashtags: 3-5 relevant ones only.\nBase copy: "${String(ctx.data.content ?? '').slice(0, 400)}".\nReturn ONLY JSON {variants:[{channel_slug:string, caption:string, hashtags:[string], hook:string}]}.`,
    apply: (ctx, raw) => {
      const j = safeJson(raw)
      ctx.data.social_variants = Array.isArray(j?.variants) ? j.variants : []
    },
    skip: (ctx) => !Array.isArray(ctx.userInput.selected_social_channel_ids) || (ctx.userInput.selected_social_channel_ids as unknown[]).length === 0,
  },
  {
    name: 'quality_ceo',
    taskType: 'quality_ceo',
    outputFormat: 'json',
    buildPrompt: (ctx) =>
      `Final CEO review. Return JSON {overall_score:number (0-10), approved:boolean, scores:{title,description,seo,price,platform_fit,human_quality,competitive_position}, issues:[{section,problem,fix}], competitor_gap:string|null, strongest_element:string}. Product: title "${ctx.data.title_variants?.[0] ?? ''}", copy "${String(ctx.data.content ?? '').slice(0, 400)}", competitor ${JSON.stringify(ctx.data.competitor ?? {}).slice(0, 200)}.`,
    apply: (ctx, raw) => {
      ctx.data.ceo = safeJson(raw)
    },
  },
]

// ------------------------------------------------------------
// The agent team: each step is a specialized role, and steps are grouped
// into "waves". Steps in the same wave have no data dependency on each
// other, so they run IN PARALLEL — many models working at once, each on
// the job it's strongest at. Waves run in order. Every role's model comes
// from the failover registry, so a role auto-falls-back to its next-best
// model if the primary is unavailable.
// ------------------------------------------------------------

interface RoleMeta {
  role: string
  wave: number
}

export const STEP_META: Record<string, RoleMeta> = {
  research_market: { role: 'Market Researcher', wave: 0 },
  research_psychology: { role: 'Buyer Psychologist', wave: 0 },
  research_keywords: { role: 'Keyword/SEO Analyst', wave: 0 },
  generate_content: { role: 'Copywriter', wave: 1 },
  generate_assets: { role: 'Designer', wave: 1 },
  generate_seo: { role: 'SEO Editor', wave: 2 },
  generate_title_variants: { role: 'Headline Writer', wave: 2 },
  quality_competitor: { role: 'Competitor Analyst', wave: 2 },
  revenue_estimate: { role: 'Revenue Forecaster', wave: 2 },
  quality_editor: { role: 'Editor', wave: 3 },
  quality_buyer_sim: { role: 'Buyer Simulator (QA)', wave: 4 },
  humanize: { role: 'Humanizer', wave: 5 },
  generate_platform_variants: { role: 'Platform Specialist', wave: 6 },
  generate_social_content: { role: 'Social Media Writer', wave: 6 },
  quality_ceo: { role: 'CEO Reviewer', wave: 7 },
}

// The canonical team line-up (role, the task type it runs, and its wave),
// in pipeline order. Used by GET /api/team to show who does what.
export const TEAM_ROLES = STEPS.map((s) => ({
  step: s.name,
  role: STEP_META[s.name]?.role || s.name,
  wave: STEP_META[s.name]?.wave ?? 0,
  taskType: s.taskType as string,
}))

// ------------------------------------------------------------
// Engine
// ------------------------------------------------------------

export class ProductWorkflow {
  constructor(private env: Env) {}

  /**
   * Run the full 15-step pipeline. Errors in an individual step don't abort
   * the run — we mark the step failed, use a fallback, and continue, so the
   * user still gets a (partial) product to review.
   */
  async run(
    runId: string,
    productId: string,
    domainSlug: string,
    categorySlug: string,
    userInput: Record<string, unknown>,
  ): Promise<void> {
    const now = () => new Date().toISOString()
    const ctx: WorkflowContext = {
      runId,
      productId,
      domainSlug,
      categorySlug,
      userInput,
      data: {},
    }

    try {
      // Mark run running
      await this.env.DB.prepare(
        `UPDATE workflow_runs SET status = 'running', started_at = ?, total_steps = ? WHERE id = ?`
      ).bind(now(), STEPS.length, runId).run()

      // Group steps into dependency-safe waves; steps in a wave run in
      // parallel (many models working at once), waves run in order.
      const waves = new Map<number, { step: StepDef; index: number }[]>()
      for (let i = 0; i < STEPS.length; i++) {
        const step = STEPS[i]
        const wave = STEP_META[step.name]?.wave ?? i
        if (!waves.has(wave)) waves.set(wave, [])
        waves.get(wave)!.push({ step, index: i })
      }

      for (const waveNo of [...waves.keys()].sort((a, b) => a - b)) {
        const group = waves.get(waveNo)!
        await this.env.DB.prepare(
          `UPDATE workflow_runs SET current_step = ? WHERE id = ?`
        ).bind(group.map((g) => STEP_META[g.step.name]?.role || g.step.name).join(', '), runId).run()

        // Run the wave in parallel but cap concurrency so a burst of
        // simultaneous calls doesn't trip the free-tier rate limit.
        await this.runWithConcurrency(group, 3, ({ step, index }) => this.runStep(ctx, runId, step, index))
      }

      // Generate the real hero image from the prompt (no-op if no image
      // provider is configured) before persisting.
      await this.generateAndStoreImage(ctx)

      await this.persistResults(ctx)

      // Quality gate: post-build check
      const postBuildProduct = {
        name: ctx.data.title_variants?.[0] ?? null,
        description: ctx.data.content ?? null,
        deliverable_url: ctx.data.image_url ?? null,
        price: ctx.data.revenue?.avg ?? ctx.data.market?.price_range?.avg ?? null,
        tags: ctx.data.tags ?? null,
        image_url: ctx.data.image_url ?? null,
      }
      const postBuildResult = checkPostBuild(postBuildProduct)
      ctx.data.quality_gate = {
        post_build: {
          pass: postBuildResult.pass,
          issues: postBuildResult.issues,
          score: postBuildResult.score,
        },
      }

      // Store quality gate result in the workflow run
      await this.env.DB.prepare(
        `UPDATE workflow_runs SET quality_gate_json = ? WHERE id = ?`
      ).bind(JSON.stringify(ctx.data.quality_gate), runId).run().catch(() => void 0)

      // Audit step outcomes before declaring the run terminal. A run where
      // every non-skipped step failed should not be reported as `completed`
      // — that's the BUG-208 case (history shows `COMPLETED 0/15 (15 failed)`).
      // Status policy:
      //   - any successful step  → 'completed'
      //   - no successes, ≥1 failure → 'failed'
      //   - no successes, no failures (all skipped) → 'completed' (no-op run)
      const stepStats = await this.env.DB
        .prepare(
          `SELECT
             SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS completed,
             SUM(CASE WHEN status='failed'    THEN 1 ELSE 0 END) AS failed
           FROM workflow_steps WHERE run_id=?`
        )
        .bind(runId)
        .first<{ completed: number | null; failed: number | null }>()
        .catch(() => null)

      const completedSteps = Number(stepStats?.completed ?? 0)
      const failedSteps = Number(stepStats?.failed ?? 0)
      const terminalStatus = completedSteps > 0
        ? 'completed'
        : failedSteps > 0
          ? 'failed'
          : 'completed' // pure no-op (all skipped)

      const terminalError = terminalStatus === 'failed'
        ? `all ${failedSteps} step(s) failed — see workflow_steps for details`
        : null

      await this.env.DB.prepare(
        `UPDATE workflow_runs
            SET status=?, completed_at=?, current_step=NULL,
                error = COALESCE(error, ?)
          WHERE id=?`
      ).bind(terminalStatus, now(), terminalError, runId).run()

      // Gate on CEO review toggle (stored as key/value)
      const ceoSetting = await this.env.DB
        .prepare(`SELECT value FROM settings WHERE key = 'ceo_review_required' LIMIT 1`)
        .first<{ value: string }>()
        .catch(() => null)
      const ceoRequired = ceoSetting?.value !== 'false'

      // Reject runs that produced unusable output instead of dumping them in
      // the human review queue as "Untitled / 0.0" (BUG-206). The post-build
      // quality gate already scores the run; combine it with title + score
      // sanity checks. If the run is failed (BUG-208 detection above), reject
      // the product too — a failed run can't have produced anything reviewable.
      const titleStr = String(
        ctx.data.title_variants?.[0] ?? ctx.data.seo?.meta_title ?? '',
      ).trim()
      const overallScore = Number(ctx.data.ceo?.overall_score ?? 0) || 0
      const qualityFailed = postBuildResult.pass === false
      const runFailed = terminalStatus === 'failed'
      const productUnusable = runFailed || qualityFailed || !titleStr || overallScore <= 0

      const nextStatus = productUnusable
        ? 'rejected'
        : (ceoRequired ? 'pending_review' : 'approved')

      await this.env.DB.prepare(
        `UPDATE products SET status=?, ai_score=?, updated_at=? WHERE id=?`
      ).bind(
        nextStatus,
        overallScore,
        now(),
        productId,
      ).run()

      // The real deliverable (downloadable PDF) is generated in a separate
      // worker invocation — fire-and-forget so it doesn't extend this run's
      // time budget. A cron backfill + manual button cover any that miss.
      if (this.env.SELF) {
        this.env.SELF.fetch(
          new Request(`https://nexus-api/api/products/${productId}/generate-deliverable`, {
            method: 'POST',
          }),
        ).catch(() => void 0)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[workflow:${runId}] FATAL:`, message)
      await this.env.DB.prepare(
        `UPDATE workflow_runs SET status='failed', completed_at=?, error=? WHERE id=?`
      ).bind(now(), message, runId).run()
      await this.env.DB.prepare(
        `UPDATE products SET status='rejected', updated_at=? WHERE id=?`
      ).bind(now(), productId).run()
    }
  }

  // Run `items` through `worker` with at most `limit` running at once.
  // Uses a queue that hands out items one-at-a-time to avoid the race
  // where two runners both read the same `cursor` before either increments.
  private async runWithConcurrency<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
    const queue = items.slice() // defensive copy
    const next = (): T | undefined => queue.shift()
    const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
      let item: T | undefined
      while ((item = next()) !== undefined) {
        await worker(item)
      }
    })
    await Promise.all(runners)
  }

  // Run a single role/step: record start, call its specialized model (with
  // failover), apply the output, and record the result. A failure here is
  // isolated — the run continues with whatever data we have.
  private async runStep(ctx: WorkflowContext, runId: string, step: StepDef, index: number): Promise<void> {
    const now = () => new Date().toISOString()
    const stepId = crypto.randomUUID()
    // Skip cleanly (no AI call) when the step has nothing to do — e.g. no
    // platforms/channels selected. Avoids wasted calls and stalled runs.
    if (step.skip?.(ctx)) {
      await this.env.DB.prepare(
        `INSERT INTO workflow_steps (id, run_id, step_name, step_type, step_order, status, started_at, completed_at)
         VALUES (?, ?, ?, ?, ?, 'skipped', ?, ?)`
      ).bind(stepId, runId, step.name, step.taskType, index, now(), now()).run()
      return
    }
    await this.env.DB.prepare(
      `INSERT INTO workflow_steps (id, run_id, step_name, step_type, step_order, status, started_at)
       VALUES (?, ?, ?, ?, ?, 'running', ?)`
    ).bind(stepId, runId, step.name, step.taskType, index, now()).run()

    try {
      const prompt = step.buildPrompt(ctx)
      const result = await this.callAI(step.taskType, prompt, step.outputFormat)
      step.apply(ctx, result.output)
      if (result.model_used === 'offline-template') ctx.data.usedOffline = true

      await this.env.DB.prepare(
        `UPDATE workflow_steps
           SET status='completed', completed_at=?, ai_model_used=?, ai_models_tried=?,
               tokens_used=?, cost_usd=?, output_data=?
         WHERE id=?`
      ).bind(
        now(),
        result.model_used,
        JSON.stringify(result.models_tried),
        result.tokens_used ?? 0,
        result.cost_usd ?? 0,
        JSON.stringify({ preview: String(result.output).slice(0, 500) }),
        stepId,
      ).run()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[workflow:${runId}] step ${step.name} failed:`, message)
      await this.env.DB.prepare(
        `UPDATE workflow_steps SET status='failed', completed_at=?, error=? WHERE id=?`
      ).bind(now(), message, stepId).run()
    }
  }

  // Generate the real hero image from ctx.data.image_prompt and store it to
  // R2. Sets ctx.data.image_url to a path served by GET /api/assets/:key.
  // Silently no-ops when no image provider is configured or on any error.
  private async generateAndStoreImage(ctx: WorkflowContext): Promise<void> {
    const prompt = String(ctx.data.image_prompt || '').trim()
    if (!prompt) return
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), 60000)
    try {
      const req = new Request('https://nexus-ai/image', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt }),
        signal: ctl.signal,
      })
      const res = await this.env.AI_WORKER.fetch(req)
      if (res.status !== 200) return // 204 = no provider configured
      const img = (await res.json()) as { base64: string; contentType: string }
      const bytes = Uint8Array.from(atob(img.base64), (ch) => ch.charCodeAt(0))
      const ext = img.contentType.includes('jpeg') ? 'jpg' : 'png'
      const key = `products/${ctx.productId}.${ext}`
      await this.env.ASSETS.put(key, bytes, { httpMetadata: { contentType: img.contentType } })
      ctx.data.image_url = `/api/assets/r2/${key}`
    } catch (err) {
      console.error(`[workflow:${ctx.runId}] image generation failed:`, err)
    } finally {
      clearTimeout(timer)
    }
  }

  private async callAI(
    taskType: TaskType,
    prompt: string,
    outputFormat: 'text' | 'json',
  ): Promise<AIRunTaskResponse> {
    return sharedCallAI(this.env, prompt, { taskType, outputFormat })
  }

  // Persist AI outputs into the right tables so the review screen + listings
  // can render them.
  private async persistResults(ctx: WorkflowContext): Promise<void> {
    const now = new Date().toISOString()
    const productId = ctx.productId

    const title =
      (Array.isArray(ctx.data.title_variants) && ctx.data.title_variants[0]) ||
      ctx.data.seo?.meta_title ||
      null

    const description: string = ctx.data.content || ctx.data.seo?.meta_description || ''
    const tagsCsv = Array.isArray(ctx.data.tags) ? ctx.data.tags.join(',') : null
    const price = typeof ctx.data.revenue?.avg === 'number'
      ? ctx.data.revenue.avg
      : (typeof ctx.data.market?.price_range?.avg === 'number' ? ctx.data.market.price_range.avg : null)
    const currency = ctx.data.revenue?.currency || 'USD'

    // Snapshot the build context so the (separately-invoked) deliverable
    // generator can write specific, on-brand content instead of generic filler.
    const briefJson = JSON.stringify({
      niche: ctx.userInput.niche ?? null,
      psychology: ctx.data.psychology ?? null,
      market: ctx.data.market ?? null,
      keywords: ctx.data.keywords ?? ctx.data.tags ?? null,
    })

    await this.env.DB.prepare(
      `UPDATE products
         SET name = COALESCE(?, name),
             description = ?,
             tags = ?,
             price = ?,
             currency = ?,
             revenue_estimate = ?,
             image_url = COALESCE(?, image_url),
             brief_json = ?,
             generated_offline = ?,
             updated_at = ?
       WHERE id = ?`
    ).bind(
      title,
      description || null,
      tagsCsv,
      price,
      currency,
      ctx.data.revenue ? JSON.stringify(ctx.data.revenue) : null,
      ctx.data.image_url ?? null,
      briefJson,
      ctx.data.usedOffline ? 1 : 0,
      now,
      productId,
    ).run()

    // Title variants
    if (Array.isArray(ctx.data.title_variants) && ctx.data.title_variants.length >= 1) {
      await this.env.DB.prepare(
        `INSERT INTO title_variants (id, product_id, variant_a, variant_b, variant_c, selected, created_at)
         VALUES (?, ?, ?, ?, ?, 'a', ?)`
      ).bind(
        crypto.randomUUID(),
        productId,
        ctx.data.title_variants[0] ?? null,
        ctx.data.title_variants[1] ?? null,
        ctx.data.title_variants[2] ?? null,
        now,
      ).run().catch(() => void 0)
    }

    // Platform variants — match platform slugs → platform IDs.
    if (Array.isArray(ctx.data.platform_variants)) {
      for (const v of ctx.data.platform_variants) {
        if (!v?.platform_slug) continue
        const platform = await this.env.DB.prepare(
          `SELECT id FROM platforms WHERE slug = ?1 OR id = ?1 LIMIT 1`
        ).bind(v.platform_slug).first<{ id: string }>()
        if (!platform) continue
        await this.env.DB.prepare(
          `INSERT INTO platform_variants
             (id, product_id, platform_id, title, description, tags, price, currency, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'USD', 'draft', ?, ?)`
        ).bind(
          crypto.randomUUID(),
          productId,
          platform.id,
          v.title ?? null,
          v.description ?? null,
          Array.isArray(v.tags) ? v.tags.join(',') : null,
          typeof v.price === 'number' ? v.price : null,
          now,
          now,
        ).run().catch(() => void 0)
      }
    }

    // Social variants
    if (Array.isArray(ctx.data.social_variants)) {
      for (const v of ctx.data.social_variants) {
        if (!v?.channel_slug) continue
        const chan = await this.env.DB.prepare(
          `SELECT id FROM social_channels WHERE slug = ?1 OR id = ?1 LIMIT 1`
        ).bind(v.channel_slug).first<{ id: string }>()
        if (!chan) continue
        await this.env.DB.prepare(
          `INSERT INTO social_variants
             (id, product_id, channel_id, content, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'draft', ?, ?)`
        ).bind(
          crypto.randomUUID(),
          productId,
          chan.id,
          JSON.stringify({
            caption: v.caption ?? '',
            hashtags: Array.isArray(v.hashtags) ? v.hashtags : [],
            hook: v.hook ?? null,
          }),
          now,
          now,
        ).run().catch(() => void 0)
      }
    }

    // CEO review row
    if (ctx.data.ceo) {
      await this.env.DB.prepare(
        `INSERT INTO reviews (id, product_id, run_id, version, ai_score, section_scores, reviewed_at)
         VALUES (?, ?, ?, 1, ?, ?, ?)`
      ).bind(
        crypto.randomUUID(),
        productId,
        ctx.runId,
        Number(ctx.data.ceo?.overall_score ?? 0) || 0,
        JSON.stringify(ctx.data.ceo?.scores ?? {}),
        now,
      ).run().catch(() => void 0)
    }
  }
}


