import { Hono } from 'hono'
import type { Env } from '../env'
import { ProductWorkflow } from '../services/workflow-engine'
import { buildListingPayload } from './publish'
import { publishToPlatform } from '../services/publishers'
import { getSetting, setSetting } from '../services/shared'
import { safeJson } from '../services/shared'
import { applyPatterns } from '../services/learning'
import { decidePublishTier, DEFAULT_GATE } from '../services/publish-gate'

// ============================================================
// Autopilot "money engine" — when ON, the CEO loops on its own:
// research a niche → build a real product with the agent team → log it.
// (Listing happens via Publish center / when a store token is connected.)
// A dashboard shows the pipeline, what's been built, and revenue estimates.
// ============================================================

export const autopilotRoutes = new Hono<{ Bindings: Env }>()

interface AutopilotExecCtx { waitUntil(p: Promise<unknown>): void }

// ── LLM key gate ──────────────────────────────────────────────────────────
//
// Every AI-driven step in the pipeline (research → write → quality_*) needs
// an LLM provider. Before this gate existed, the autopilot would happily
// loop on a worker with no keys configured anywhere: each step silently
// no-op'd, every run ended marked `completed` with $0.00 cost, and the
// dashboard filled up with "Untitled" / generic-titled products at score
// 26/100. Now we refuse to start a cycle (or toggle the engine ON) unless
// at least one AI provider is reachable from either the encrypted KV vault
// OR a worker secret on the env.
//
// Keep this list in sync with KEY_SPECS in routes/keys.ts (group === 'AI').
const AI_PROVIDER_ENV_VARS = [
  'GROQ_API_KEY',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'GOOGLE_API_KEY',
  'PERPLEXITY_API_KEY',
  'DEEPSEEK_API_KEY',
  'MISTRAL_API_KEY',
] as const

async function getAiProviderSource(
  env: Env,
): Promise<{ key: string; source: 'kv' | 'worker_secret' } | null> {
  for (const key of AI_PROVIDER_ENV_VARS) {
    try {
      const stored = await env.CONFIG.get(`secret:${key}`)
      if (stored) return { key, source: 'kv' }
    } catch { /* KV miss is non-fatal */ }
  }
  for (const key of AI_PROVIDER_ENV_VARS) {
    const v = (env as unknown as Record<string, unknown>)[key]
    if (typeof v === 'string' && v.length > 0) return { key, source: 'worker_secret' }
  }
  return null
}

async function log(env: Env, action: string, fields: { product_id?: string; niche?: string; domain_slug?: string; note?: string }) {
  await env.DB.prepare(
    `INSERT INTO autopilot_log (id, action, product_id, niche, domain_slug, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    crypto.randomUUID(), action,
    fields.product_id ?? null, fields.niche ?? null, fields.domain_slug ?? null, fields.note ?? null,
    new Date().toISOString(),
  ).run().catch(() => void 0)
}

// --- Status: toggle state + stats + recent activity + winners ----------
autopilotRoutes.get('/status', async (c) => {
  const enabled = (await getSetting(c.env, 'autopilot_enabled')) === 'true'
  const perRun = Number((await getSetting(c.env, 'autopilot_per_run')) || '1') || 1
  const autoApprove = (await getSetting(c.env, 'autopilot_auto_approve')) === 'true'
  const autoPublish = (await getSetting(c.env, 'autopilot_auto_publish')) === 'true'
  const minScore = Number((await getSetting(c.env, 'autopilot_min_score')) || '7') || 7
  const rejectBelow = Number((await getSetting(c.env, 'autopilot_reject_below')) || '') || DEFAULT_GATE.rejectBelow
  const publishAt = Number((await getSetting(c.env, 'autopilot_publish_at')) || '') || DEFAULT_GATE.publishAt

  const builtRow = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM autopilot_log WHERE action = 'build'`,
  ).first<{ n: number }>().catch(() => ({ n: 0 }))

  // Estimated revenue across all products that have an estimate.
  const products = await c.env.DB.prepare(
    `SELECT id, name, status, ai_score, revenue_estimate FROM products WHERE revenue_estimate IS NOT NULL`,
  ).all<{ id: string; name: string; status: string; ai_score: number; revenue_estimate: string }>()

  let estLow = 0, estHigh = 0
  const scored: { id: string; name: string; status: string; ai_score: number; est: number }[] = []
  for (const p of products.results ?? []) {
    let est = 0
    try {
      const r = JSON.parse(p.revenue_estimate)
      if (typeof r?.min === 'number') estLow += r.min
      if (typeof r?.max === 'number') estHigh += r.max
      est = typeof r?.max === 'number' ? r.max : (typeof r?.min === 'number' ? r.min : 0)
    } catch {}
    scored.push({ id: p.id, name: p.name, status: p.status, ai_score: p.ai_score, est })
  }
  const winners = scored.sort((a, b) => (b.ai_score - a.ai_score) || (b.est - a.est)).slice(0, 5)

  const recent = await c.env.DB.prepare(
    `SELECT action, product_id, niche, domain_slug, note, created_at FROM autopilot_log ORDER BY created_at DESC LIMIT 20`,
  ).all()

  const aiProvider = await getAiProviderSource(c.env)

  return c.json({
    enabled,
    per_run: perRun,
    auto_approve: autoApprove,
    auto_publish: autoPublish,
    min_score: minScore,
    reject_below: rejectBelow,
    publish_at: publishAt,
    products_built: builtRow?.n ?? 0,
    est_revenue: { low: Math.round(estLow), high: Math.round(estHigh), currency: 'USD' },
    winners,
    recent: recent.results ?? [],
    // Surfaces "who is actually generating my content" so the dashboard can
    // stop reporting `engine running` next to "no keys configured".
    ai_keys_configured: aiProvider !== null,
    ai_provider_source: aiProvider,
  })
})

// --- Toggle on/off + set throughput ------------------------------------
autopilotRoutes.post('/toggle', async (c) => {
  const b = await c.req.json().catch(() => ({})) as Record<string, unknown>
  // Refuse to flip the engine ON when no LLM provider is reachable. Without
  // this, the autopilot loops forever producing $0 "completed" runs with
  // generic titles because every AI step silently no-ops.
  if (b.enabled === true) {
    const aiProvider = await getAiProviderSource(c.env)
    if (!aiProvider) {
      return c.json(
        {
          ok: false,
          error: 'no_ai_key',
          message:
            'No LLM provider is configured. Add at least one AI key in Settings → Keys (Groq is free) before turning on the engine.',
        },
        400,
      )
    }
  }
  if (typeof b.enabled === 'boolean') await setSetting(c.env, 'autopilot_enabled', b.enabled ? 'true' : 'false')
  if (typeof b.auto_approve === 'boolean') await setSetting(c.env, 'autopilot_auto_approve', b.auto_approve ? 'true' : 'false')
  if (typeof b.auto_publish === 'boolean') await setSetting(c.env, 'autopilot_auto_publish', b.auto_publish ? 'true' : 'false')
  if (typeof b.per_run === 'number' && b.per_run >= 1 && b.per_run <= 10) {
    await setSetting(c.env, 'autopilot_per_run', String(Math.floor(b.per_run)))
  }
  if (typeof b.min_score === 'number' && b.min_score >= 0 && b.min_score <= 10) {
    await setSetting(c.env, 'autopilot_min_score', String(b.min_score))
  }
  if (typeof b.reject_below === 'number' && b.reject_below >= 0 && b.reject_below <= 10) {
    await setSetting(c.env, 'autopilot_reject_below', String(b.reject_below))
  }
  if (typeof b.publish_at === 'number' && b.publish_at >= 0 && b.publish_at <= 10) {
    await setSetting(c.env, 'autopilot_publish_at', String(b.publish_at))
  }
  const enabled = (await getSetting(c.env, 'autopilot_enabled')) === 'true'
  return c.json({ ok: true, enabled })
})

// --- Run one cycle now (test without waiting for cron) -----------------
autopilotRoutes.post('/run', async (c) => {
  const aiProvider = await getAiProviderSource(c.env)
  if (!aiProvider) {
    return c.json(
      {
        ok: false,
        error: 'no_ai_key',
        message:
          'No LLM provider is configured. Add at least one AI key in Settings → Keys before running a cycle.',
      },
      400,
    )
  }
  const built = await runCycle(c.env, c.executionCtx, 1)
  return c.json({ ok: true, built })
})

// ============================================================
// The loop
// ============================================================

async function callAIJson(env: Env, prompt: string, taskType = 'research_market'): Promise<unknown> {
  try {
    const res = await env.AI_WORKER.fetch(new Request('https://nexus-ai/task', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ taskType, prompt, outputFormat: 'json', timeoutMs: 60000 }),
    }))
    if (!res.ok) return null
    const data = (await res.json()) as { output?: string }
    return safeJson(data.output ?? '')
  } catch { return null }
}

// Normalize a niche for comparison: lowercase, strip punctuation, drop filler.
const FILLER = new Set(['the', 'a', 'an', 'for', 'and', 'of', 'to', 'in', 'with', 'your', 'my', 'digital', 'product', 'products', 'premium'])
function nicheTokens(s: string): Set<string> {
  return new Set(
    s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w && !FILLER.has(w)),
  )
}
// Treat two niches as duplicates when their significant words overlap heavily.
function isNearDuplicate(candidate: string, existing: string[]): boolean {
  const a = nicheTokens(candidate)
  if (a.size === 0) return true // empty / all-filler → reject
  for (const e of existing) {
    const b = nicheTokens(e)
    if (b.size === 0) continue
    let inter = 0
    for (const w of a) if (b.has(w)) inter++
    const union = new Set([...a, ...b]).size
    if (inter / union >= 0.6) return true
  }
  return false
}
// Reject lazy/generic niches like "<domain> essentials".
function isGeneric(s: string): boolean {
  return /\b(essentials|stuff|things|bundle|misc|general|various)\b/i.test(s) || nicheTokens(s).size < 2
}

// Research a niche (prefer a fresh trend alert, else ask the AI) and return
// {domainSlug, categorySlug, niche}. De-duplicates against niches already
// built so autopilot stops rebuilding near-identical products.
async function pickNiche(env: Env): Promise<{ domainSlug: string; categorySlug: string; niche: string } | null> {
  // What's already been made — so we can avoid repeating it.
  const existingRows = await env.DB.prepare(
    `SELECT niche FROM products WHERE niche IS NOT NULL AND niche != '' ORDER BY created_at DESC LIMIT 60`,
  ).all<{ niche: string }>().catch(() => ({ results: [] as { niche: string }[] }))
  const existing = (existingRows.results ?? []).map((r) => r.niche)

  // Prefer an unused trend alert in an active domain (these are already specific).
  const alert = await env.DB.prepare(
    `SELECT t.id AS alert_id, t.trend_keyword, t.suggested_niche, d.slug AS domain_slug
       FROM trend_alerts t JOIN domains d ON d.id = t.domain_id
      WHERE t.status = 'new' AND d.is_active = 1
      ORDER BY t.trend_score DESC LIMIT 1`,
  ).first<{ alert_id: string; trend_keyword: string; suggested_niche: string | null; domain_slug: string }>().catch(() => null)

  if (alert) {
    const niche = alert.suggested_niche || alert.trend_keyword
    if (niche && !isNearDuplicate(niche, existing)) {
      await env.DB.prepare(`UPDATE trend_alerts SET status = 'used' WHERE id = ?`).bind(alert.alert_id).run().catch(() => void 0)
      return finishPick(env, alert.domain_slug, niche)
    }
  }

  // Otherwise ask the researcher (Perplexity Sonar when a key is set, else
  // the free engine) for a specific, validated niche — and tell it what to
  // avoid so it doesn't hand back something we already built.
  const dom = await env.DB.prepare(`SELECT slug FROM domains WHERE is_active = 1 ORDER BY RANDOM() LIMIT 1`)
    .first<{ slug: string }>().catch(() => null)
  if (!dom) return null
  const domainSlug = dom.slug

  // Inject winner patterns from the learning loop to guide niche selection
  const weights = await applyPatterns(env).catch(() => ({
    preferred_niches: [] as string[],
    preferred_price_range: null as string | null,
    title_keywords: [] as string[],
    top_tags: [] as string[],
    prompt_injection: '',
  }))

  const avoid = existing.slice(0, 25)
  for (let attempt = 0; attempt < 2; attempt++) {
    const promptParts = [
      `You are a market researcher. Propose ONE specific, validated, high-demand digital-product niche for the "${domainSlug}" domain.`,
      `Requirements: name a concrete target audience AND the specific outcome/problem solved (e.g. "Notion CRM template for freelance designers", not "business templates").`,
    ]
    if (weights.prompt_injection) {
      promptParts.push(weights.prompt_injection)
      promptParts.push('Use the winning patterns above to inform your niche selection — lean toward niches similar to what already sold well.')
    }
    promptParts.push(
      `It must be DIFFERENT from everything in this avoid-list (no rephrasings, no synonyms):`,
      avoid.length ? avoid.map((n) => `- ${n}`).join('\n') : '- (none yet)',
      `Do NOT use vague words like "essentials", "bundle", "stuff" or "general".`,
      `Return strict JSON: {"niche": string, "audience": string, "rationale": string}.`,
    )
    const prompt = promptParts.join('\n')
    const j = (await callAIJson(env, prompt)) as { niche?: string } | null
    const niche = (j?.niche || '').trim()
    if (niche && !isGeneric(niche) && !isNearDuplicate(niche, existing)) {
      return finishPick(env, domainSlug, niche)
    }
  }

  // Both attempts failed → skip this slot rather than build a generic dupe.
  return null
}

async function finishPick(env: Env, domainSlug: string, niche: string) {
  const cat = await env.DB.prepare(
    `SELECT c.slug FROM categories c JOIN domains d ON d.id = c.domain_id WHERE d.slug = ? ORDER BY RANDOM() LIMIT 1`,
  ).bind(domainSlug).first<{ slug: string }>().catch(() => null)
  return { domainSlug, categorySlug: cat?.slug || 'templates', niche }
}

// Harvest finished autopilot products: auto-approve those scoring >= the
// threshold, and (if enabled + a store token exists) attempt to list them.
// Runs at the start of every cycle so each tick advances the prior batch.
async function harvest(env: Env): Promise<void> {
  if ((await getSetting(env, 'autopilot_auto_approve')) !== 'true') return
  const minScore = Number((await getSetting(env, 'autopilot_min_score')) || '7') || 7
  const autoPublish = (await getSetting(env, 'autopilot_auto_publish')) === 'true'

  // Tiered publish gate (0-10 scale). Defaults: reject < 7.5, draft 7.5-8.4,
  // publish 8.5+. Thresholds are operator-configurable.
  const rejectBelow = Number((await getSetting(env, 'autopilot_reject_below')) || '') || DEFAULT_GATE.rejectBelow
  const publishAt = Number((await getSetting(env, 'autopilot_publish_at')) || '') || DEFAULT_GATE.publishAt
  const thresholds = { rejectBelow, publishAt }

  // Pull every finished autopilot product awaiting a decision — the gate, not
  // the SQL, decides reject vs draft vs publish.
  const rows = await env.DB.prepare(
    `SELECT p.id, p.name, p.ai_score FROM products p
       JOIN autopilot_log a ON a.product_id = p.id AND a.action = 'build'
      WHERE p.status = 'pending_review'
      GROUP BY p.id LIMIT 10`,
  ).all<{ id: string; name: string; ai_score: number }>().catch(() => ({ results: [] as { id: string; name: string; ai_score: number }[] }))

  for (const p of rows.results ?? []) {
    const score = Number(p.ai_score) || 0
    const decision = decidePublishTier(score, thresholds, minScore)

    if (decision.tier === 'reject') {
      await env.DB.prepare('UPDATE products SET status = ?, updated_at = ? WHERE id = ?')
        .bind('rejected', new Date().toISOString(), p.id).run()
      await log(env, 'reject', { product_id: p.id, note: `Auto-rejected "${p.name}" — ${decision.reason}` })
      continue
    }

    await env.DB.prepare('UPDATE products SET status = ?, updated_at = ? WHERE id = ?')
      .bind('approved', new Date().toISOString(), p.id).run()
    await log(env, 'approve', { product_id: p.id, note: `Auto-approved "${p.name}" (score ${score}) — ${decision.reason}` })

    // Only the top tier (8.5+) is eligible for Sleep Mode auto-publishing.
    if (!autoPublish) continue
    if (!decision.publishEligible) {
      await log(env, 'draft', { product_id: p.id, note: `"${p.name}" held as draft — score below publish threshold (${publishAt})` })
      continue
    }
    const variants = await env.DB.prepare(
      `SELECT pv.*, pl.url as platform_url, pl.name as platform_name
         FROM platform_variants pv JOIN platforms pl ON pv.platform_id = pl.id
        WHERE pv.product_id = ? AND pv.status != 'published'`,
    ).bind(p.id).all<Record<string, unknown>>().catch(() => ({ results: [] as Record<string, unknown>[] }))
    let published = 0
    const notes: string[] = []
    for (const v of variants.results ?? []) {
      try {
        const outcome = await publishToPlatform(await buildListingPayload(env, v), env)
        if (outcome.status === 'success') {
          published++
          await env.DB.prepare(`UPDATE platform_variants SET status='published', published_at=?, published_url=? WHERE id=?`)
            .bind(new Date().toISOString(), outcome.url || '#', v.id).run()
          notes.push(`${v.platform_name}: published`)
        } else {
          notes.push(`${v.platform_name}: ${outcome.error || 'failed'}`)
        }
      } catch (err) {
        notes.push(`${v.platform_name}: ${err instanceof Error ? err.message : 'error'}`)
      }
    }
    if (published > 0 && published === (variants.results ?? []).length) {
      await env.DB.prepare(`UPDATE products SET status='published', updated_at=? WHERE id=?`)
        .bind(new Date().toISOString(), p.id).run()
    }
    await log(env, 'publish', { product_id: p.id, note: `Publish "${p.name}": ${notes.join('; ') || 'no variants yet'}` })
  }
}

// Build `count` products autonomously. Returns the number dispatched.
export async function runCycle(env: Env, ctx: AutopilotExecCtx, count: number): Promise<number> {
  await harvest(env)
  let built = 0
  for (let i = 0; i < count; i++) {
    const pick = await pickNiche(env)
    if (!pick) { await log(env, 'skip', { note: 'no active domain / niche found' }); continue }
    await log(env, 'research', { niche: pick.niche, domain_slug: pick.domainSlug, note: `Chose niche "${pick.niche}"` })

    const now = new Date().toISOString()
    const productId = crypto.randomUUID()
    const runId = crypto.randomUUID()
    const domain = await env.DB.prepare('SELECT id FROM domains WHERE slug = ? LIMIT 1').bind(pick.domainSlug).first<{ id: string }>()
    const category = await env.DB.prepare('SELECT id FROM categories WHERE slug = ? LIMIT 1').bind(pick.categorySlug).first<{ id: string }>()
    const userInput = { niche: pick.niche, let_ai_price: true }
    try {
      await env.DB.prepare(
        `INSERT INTO products (id, domain_id, category_id, name, niche, user_input, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'running', ?, ?)`,
      ).bind(productId, domain?.id ?? null, category?.id ?? null, pick.niche, pick.niche, JSON.stringify(userInput), now, now).run()
      await env.DB.prepare(`INSERT INTO workflow_runs (id, product_id, status, created_at) VALUES (?, ?, 'queued', ?)`).bind(runId, productId, now).run()
      const engine = new ProductWorkflow(env)
      ctx.waitUntil(engine.run(runId, productId, pick.domainSlug, pick.categorySlug, userInput))
      await log(env, 'build', { product_id: productId, niche: pick.niche, domain_slug: pick.domainSlug, note: `Dispatched the agent team to build "${pick.niche}"` })
      built++
    } catch (err) {
      await log(env, 'error', { niche: pick.niche, note: err instanceof Error ? err.message : 'build failed' })
    }
  }
  return built
}

// Called by the daily cron — only runs when autopilot is ON.
export async function runAutopilot(env: Env, ctx: AutopilotExecCtx): Promise<void> {
  if ((await getSetting(env, 'autopilot_enabled')) !== 'true') return
  // Belt-and-suspenders: even though we refuse to flip the engine ON without
  // a key, a user could rotate / delete every key after enabling the loop.
  // Skip the cron tick rather than burn cycles producing "Untitled" runs.
  const aiProvider = await getAiProviderSource(env)
  if (!aiProvider) {
    await log(env, 'skip', {
      note: 'autopilot tick skipped: no LLM provider configured (add a key in Settings → Keys)',
    })
    return
  }
  const perRun = Number((await getSetting(env, 'autopilot_per_run')) || '1') || 1
  await runCycle(env, ctx, perRun)
}
