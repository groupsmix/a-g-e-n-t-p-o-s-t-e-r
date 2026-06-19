// ============================================================
// Winner Learning Loop — service layer
// Pulls real sales from Gumroad, extracts winner patterns from
// sales data, and feeds patterns back into product generation.
// ============================================================

import type { Env } from '../env'
import { getSecret } from './publishers'
import { getSetting, setSetting } from './shared'

// ----- Types -----

interface GumroadSale {
  id: string
  product_name: string
  product_id: string
  price: number // cents
  quantity: number
  created_at: string
  email?: string
}

interface GumroadSalesResponse {
  success: boolean
  sales: GumroadSale[]
  next_page_url?: string | null
}

export interface LearningPattern {
  id: string
  pattern_type: string
  pattern_value: string
  times_seen: number
  times_sold: number
  total_revenue: number
  confidence_score: number
  confidence: number
  sample_count: number
  domain_id: string | null
  category_id: string | null
  source: string
  last_seen_at: string | null
  updated_at: string
}

export interface LearningStats {
  total_sales_synced: number
  total_revenue: number
  patterns_extracted: number
  top_patterns: LearningPattern[]
  last_sync_at: string | null
  last_analysis_at: string | null
  improvement_trend: { period: string; revenue: number }[]
}

// ----- Gumroad Sales Sync -----

export async function syncGumroadSales(env: Env): Promise<{
  synced: number
  total_revenue: number
  error?: string
}> {
  const token = await getSecret(env, 'GUMROAD_ACCESS_TOKEN')
  if (!token) {
    return { synced: 0, total_revenue: 0, error: 'GUMROAD_ACCESS_TOKEN not configured' }
  }

  let synced = 0
  let totalRevenue = 0
  // Audit #5: token moved from query string to Authorization header.
  let pageUrl: string | null = 'https://api.gumroad.com/v2/sales'

  // Pull the last sync date to only fetch new sales
  const lastSync = await getSetting(env, 'learning_last_sync_at')
  if (lastSync) {
    pageUrl += `?after=${encodeURIComponent(lastSync)}`
  }

  try {
    while (pageUrl) {
      const res = await fetch(pageUrl, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = (await res.json().catch(() => ({}))) as GumroadSalesResponse

      if (!res.ok || !data.success) {
        return { synced, total_revenue: totalRevenue, error: `Gumroad API error: ${res.status}` }
      }

      for (const sale of data.sales || []) {
        const revenueCents = sale.price ?? 0
        const existing = await env.DB
          .prepare('SELECT id FROM sales WHERE external_id = ? AND source = ?')
          .bind(sale.id, 'gumroad')
          .first()
          .catch(() => null)

        if (!existing) {
          await env.DB
            .prepare(
              `INSERT INTO sales (id, external_id, source, product_name, product_id, quantity, revenue_cents, currency, sale_date, synced_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            )
            .bind(
              crypto.randomUUID(),
              sale.id,
              'gumroad',
              sale.product_name || null,
              sale.product_id || null,
              sale.quantity ?? 1,
              revenueCents,
              'USD',
              sale.created_at || new Date().toISOString(),
              new Date().toISOString()
            )
            .run()
            .catch(() => void 0)

          synced++
          totalRevenue += revenueCents / 100
        }
      }

      // Gumroad returns next_page_url as a relative path (e.g. "/v2/sales?page_key=...").
      // Resolve it against the API origin and never follow off-origin URLs.
      if (data.next_page_url) {
        const next = new URL(data.next_page_url, 'https://api.gumroad.com')
        pageUrl = next.origin === 'https://api.gumroad.com' ? next.toString() : null
      } else {
        pageUrl = null
      }
    }

    await setSetting(env, 'learning_last_sync_at', new Date().toISOString())
    return { synced, total_revenue: Math.round(totalRevenue * 100) / 100 }
  } catch (err) {
    console.error('[learning] Gumroad sync error:', err)
    return { synced, total_revenue: totalRevenue, error: 'Failed to sync Gumroad sales' }
  }
}

// ----- Pattern Extraction -----

interface SalesAggregate {
  product_name: string
  product_id: string | null
  total_quantity: number
  total_revenue_cents: number
}

export async function extractPatterns(env: Env): Promise<{
  patterns_created: number
  patterns_updated: number
}> {
  let created = 0
  let updated = 0
  const now = new Date().toISOString()

  // Aggregate sales by product
  const salesRows = await env.DB
    .prepare(
      `SELECT product_name, product_id,
              SUM(quantity) AS total_quantity,
              SUM(revenue_cents) AS total_revenue_cents
       FROM sales
       GROUP BY product_name
       ORDER BY total_revenue_cents DESC
       LIMIT 100`
    )
    .all<SalesAggregate>()
    .catch(() => ({ results: [] as SalesAggregate[] }))

  const aggregates = salesRows.results ?? []
  if (aggregates.length === 0) {
    return { patterns_created: 0, patterns_updated: 0 }
  }

  // Match sold products to our product DB for richer analysis
  const matchedProducts = await env.DB
    .prepare(
      `SELECT p.id, p.name, p.niche, p.domain_id, p.category_id, p.ai_score,
              pv.title, pv.tags, pv.price
       FROM products p
       LEFT JOIN platform_variants pv ON pv.product_id = p.id
       WHERE p.status IN ('approved', 'published')
       LIMIT 200`
    )
    .all<{
      id: string; name: string | null; niche: string | null;
      domain_id: string; category_id: string; ai_score: number | null;
      title: string | null; tags: string | null; price: number | null;
    }>()
    .catch(() => ({ results: [] as Array<{
      id: string; name: string | null; niche: string | null;
      domain_id: string; category_id: string; ai_score: number | null;
      title: string | null; tags: string | null; price: number | null;
    }> }))

  // Build a lookup of product names to domain/category
  const productMap = new Map<string, {
    domain_id: string; category_id: string; niche: string | null;
    title: string | null; tags: string | null; price: number | null;
  }>()
  for (const p of matchedProducts.results ?? []) {
    if (p.name) productMap.set(p.name.toLowerCase(), p)
  }

  // Extract patterns from top sellers
  for (const agg of aggregates) {
    const revenue = agg.total_revenue_cents / 100
    const matched = productMap.get((agg.product_name || '').toLowerCase())
    const domainId = matched?.domain_id ?? null
    const categoryId = matched?.category_id ?? null

    // Pattern: niche that sells
    if (matched?.niche) {
      const r = await upsertPattern(env, {
        pattern_type: 'niche',
        pattern_value: matched.niche,
        domain_id: domainId,
        category_id: categoryId,
        times_sold: agg.total_quantity,
        revenue,
        now,
      })
      if (r === 'created') created++
      else updated++
    }

    // Pattern: price range
    if (matched?.price && matched.price > 0) {
      const priceRange = getPriceRange(matched.price)
      const r = await upsertPattern(env, {
        pattern_type: 'price_range',
        pattern_value: priceRange,
        domain_id: domainId,
        category_id: categoryId,
        times_sold: agg.total_quantity,
        revenue,
        now,
      })
      if (r === 'created') created++
      else updated++
    }

    // Pattern: title keywords (extract significant words)
    const title = matched?.title || agg.product_name
    if (title) {
      const keywords = extractKeywords(title)
      if (keywords.length > 0) {
        const r = await upsertPattern(env, {
          pattern_type: 'title_structure',
          pattern_value: keywords.join(', '),
          domain_id: domainId,
          category_id: categoryId,
          times_sold: agg.total_quantity,
          revenue,
          now,
        })
        if (r === 'created') created++
        else updated++
      }
    }

    // Pattern: tags that sell
    if (matched?.tags) {
      const r = await upsertPattern(env, {
        pattern_type: 'top_tags',
        pattern_value: matched.tags,
        domain_id: domainId,
        category_id: categoryId,
        times_sold: agg.total_quantity,
        revenue,
        now,
      })
      if (r === 'created') created++
      else updated++
    }
  }

  await setSetting(env, 'learning_last_analysis_at', now)
  return { patterns_created: created, patterns_updated: updated }
}

// ----- Apply Patterns to Generation -----

export interface GenerationWeights {
  preferred_niches: string[]
  preferred_price_range: string | null
  title_keywords: string[]
  top_tags: string[]
  prompt_injection: string
}

export async function applyPatterns(env: Env): Promise<GenerationWeights> {
  const rows = await env.DB
    .prepare(
      `SELECT pattern_type, pattern_value, confidence_score, times_sold, total_revenue
       FROM winner_patterns
       WHERE confidence_score > 0 OR times_sold > 0
       ORDER BY total_revenue DESC, confidence_score DESC
       LIMIT 50`
    )
    .all<{
      pattern_type: string; pattern_value: string;
      confidence_score: number; times_sold: number; total_revenue: number;
    }>()
    .catch(() => ({ results: [] as Array<{
      pattern_type: string; pattern_value: string;
      confidence_score: number; times_sold: number; total_revenue: number;
    }> }))

  const patterns = rows.results ?? []

  const niches: string[] = []
  let priceRange: string | null = null
  const titleKw: string[] = []
  const tags: string[] = []

  for (const p of patterns) {
    switch (p.pattern_type) {
      case 'niche':
        niches.push(p.pattern_value)
        break
      case 'price_range':
        if (!priceRange) priceRange = p.pattern_value
        break
      case 'title_structure':
        titleKw.push(p.pattern_value)
        break
      case 'top_tags':
        tags.push(p.pattern_value)
        break
    }
  }

  // Build a prompt injection string that the autopilot can prepend
  const lines: string[] = []
  if (niches.length > 0) {
    lines.push(`Winning niches (prioritize these): ${niches.slice(0, 5).join('; ')}`)
  }
  if (priceRange) {
    lines.push(`Best-selling price range: ${priceRange}`)
  }
  if (titleKw.length > 0) {
    lines.push(`Winning title keywords: ${titleKw.slice(0, 10).join(', ')}`)
  }
  if (tags.length > 0) {
    lines.push(`Top-performing tags: ${tags.slice(0, 5).join('; ')}`)
  }

  return {
    preferred_niches: niches.slice(0, 10),
    preferred_price_range: priceRange,
    title_keywords: titleKw.slice(0, 15),
    top_tags: tags.slice(0, 10),
    prompt_injection: lines.length > 0
      ? `[WINNER PATTERNS FROM REAL SALES DATA]\n${lines.join('\n')}\n[END WINNER PATTERNS]`
      : '',
  }
}

// ----- Stats -----

export async function getLearningStats(env: Env): Promise<LearningStats> {
  const totalSalesRow = await env.DB
    .prepare('SELECT COUNT(*) AS cnt, SUM(revenue_cents) AS rev FROM sales')
    .first<{ cnt: number; rev: number }>()
    .catch(() => ({ cnt: 0, rev: 0 }))

  const patternsRow = await env.DB
    .prepare('SELECT COUNT(*) AS cnt FROM winner_patterns')
    .first<{ cnt: number }>()
    .catch(() => ({ cnt: 0 }))

  const topPatterns = await env.DB
    .prepare(
      `SELECT * FROM winner_patterns
       ORDER BY total_revenue DESC, confidence_score DESC, confidence DESC
       LIMIT 5`
    )
    .all<LearningPattern>()
    .catch(() => ({ results: [] as LearningPattern[] }))

  const lastSync = await getSetting(env, 'learning_last_sync_at')
  const lastAnalysis = await getSetting(env, 'learning_last_analysis_at')

  // Revenue trend: group sales by month
  const trendRows = await env.DB
    .prepare(
      `SELECT strftime('%Y-%m', sale_date) AS period,
              SUM(revenue_cents) AS rev
       FROM sales
       WHERE sale_date IS NOT NULL
       GROUP BY period
       ORDER BY period DESC
       LIMIT 12`
    )
    .all<{ period: string; rev: number }>()
    .catch(() => ({ results: [] as { period: string; rev: number }[] }))

  const trend = (trendRows.results ?? []).map((r) => ({
    period: r.period,
    revenue: Math.round((r.rev ?? 0)) / 100,
  })).reverse()

  return {
    total_sales_synced: totalSalesRow?.cnt ?? 0,
    total_revenue: Math.round((totalSalesRow?.rev ?? 0)) / 100,
    patterns_extracted: patternsRow?.cnt ?? 0,
    top_patterns: topPatterns.results ?? [],
    last_sync_at: lastSync || null,
    last_analysis_at: lastAnalysis || null,
    improvement_trend: trend,
  }
}

// ----- Helpers -----

async function upsertPattern(
  env: Env,
  p: {
    pattern_type: string
    pattern_value: string
    domain_id: string | null
    category_id: string | null
    times_sold: number
    revenue: number
    now: string
  }
): Promise<'created' | 'updated'> {
  const existing = await env.DB
    .prepare(
      `SELECT id, times_sold, total_revenue, times_seen FROM winner_patterns
       WHERE pattern_type = ? AND pattern_value = ?
       LIMIT 1`
    )
    .bind(p.pattern_type, p.pattern_value)
    .first<{ id: string; times_sold: number; total_revenue: number; times_seen: number }>()
    .catch(() => null)

  if (existing) {
    const newTimesSold = (existing.times_sold ?? 0) + p.times_sold
    const newRevenue = (existing.total_revenue ?? 0) + p.revenue
    const newTimesSeen = (existing.times_seen ?? 0) + 1
    const confidence = Math.min(1, newTimesSold / 10) * 0.6 + Math.min(1, newRevenue / 500) * 0.4

    await env.DB
      .prepare(
        `UPDATE winner_patterns
         SET times_sold = ?, total_revenue = ?, times_seen = ?,
             confidence_score = ?, confidence = ?, sample_count = ?,
             last_seen_at = ?, updated_at = ?, source = 'sales'
         WHERE id = ?`
      )
      .bind(newTimesSold, newRevenue, newTimesSeen, confidence, confidence, newTimesSeen, p.now, p.now, existing.id)
      .run()
      .catch(() => void 0)

    return 'updated'
  }

  const confidence = Math.min(1, p.times_sold / 10) * 0.6 + Math.min(1, p.revenue / 500) * 0.4

  await env.DB
    .prepare(
      `INSERT INTO winner_patterns
         (id, pattern_type, pattern_value, domain_id, category_id,
          times_seen, times_sold, total_revenue, confidence_score, confidence,
          sample_count, last_seen_at, updated_at, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      crypto.randomUUID(),
      p.pattern_type,
      p.pattern_value,
      p.domain_id,
      p.category_id,
      1,
      p.times_sold,
      p.revenue,
      confidence,
      confidence,
      1,
      p.now,
      p.now,
      'sales'
    )
    .run()
    .catch(() => void 0)

  return 'created'
}

function getPriceRange(price: number): string {
  if (price < 5) return '$0-$5'
  if (price < 10) return '$5-$10'
  if (price < 25) return '$10-$25'
  if (price < 50) return '$25-$50'
  if (price < 100) return '$50-$100'
  return '$100+'
}

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'for', 'and', 'of', 'to', 'in', 'with', 'your', 'my',
  'is', 'it', 'by', 'on', 'at', 'or', 'be', 'this', 'that', 'from',
  'digital', 'product', 'template', 'download', 'instant',
])

function extractKeywords(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
    .slice(0, 5)
}


// ============================================================
// Phase 5 — Learning Loop: feed performance back into agents
// ============================================================
//
// getLearningContext() is the ONE place agents read "what works".
// Same principle as the single browser_control: one implementation,
// every agent calls it. It combines two real feedback sources:
//
//   1. Winner patterns from actual sales (applyPatterns → Gumroad data)
//   2. NEXUS approval outcomes — what the operator approved vs rejected,
//      and WHY (reviewer_notes on rejections are the strongest "avoid this"
//      signal we have, and they come from inside the pipeline itself).
//
// The output `injection` string is prepended to agent generation prompts
// so discovery hunts for proven winners and the job agent drafts toward
// what gets approved — and away from what got rejected.

export interface ApprovalOutcomeStats {
  approved: number
  rejected: number
  pending: number
  approval_rate: number | null          // approved / (approved+rejected)
  recent_rejection_reasons: string[]    // reviewer_notes from recent rejects
  recent_approved_titles: string[]      // titles of recently approved items
}

export interface LearningContext {
  has_data: boolean
  injection: string                     // ready to prepend to a prompt
  weights: GenerationWeights
  approvals: ApprovalOutcomeStats
}

async function getApprovalOutcomes(env: Env): Promise<ApprovalOutcomeStats> {
  const empty: ApprovalOutcomeStats = {
    approved: 0, rejected: 0, pending: 0, approval_rate: null,
    recent_rejection_reasons: [], recent_approved_titles: [],
  }

  // Counts by status (approval_requests exists since migration 037; the
  // pipeline_item_id + reviewer_notes columns since 045).
  const counts = await env.DB
    .prepare(
      `SELECT status, COUNT(*) AS n
       FROM approval_requests
       WHERE action_type = 'review.deliverable'
       GROUP BY status`
    )
    .all<{ status: string; n: number }>()
    .catch(() => ({ results: [] as Array<{ status: string; n: number }> }))

  for (const row of counts.results ?? []) {
    if (row.status === 'approved') empty.approved = row.n
    else if (row.status === 'rejected') empty.rejected = row.n
    else if (row.status === 'pending') empty.pending = row.n
  }

  const decided = empty.approved + empty.rejected
  empty.approval_rate = decided > 0 ? Math.round((empty.approved / decided) * 100) / 100 : null

  // Recent rejection reasons — the "what to avoid" signal.
  const rejects = await env.DB
    .prepare(
      `SELECT reviewer_notes
       FROM approval_requests
       WHERE status = 'rejected'
         AND reviewer_notes IS NOT NULL AND reviewer_notes != ''
       ORDER BY COALESCE(resolved_at, created_at) DESC
       LIMIT 5`
    )
    .all<{ reviewer_notes: string }>()
    .catch(() => ({ results: [] as Array<{ reviewer_notes: string }> }))
  empty.recent_rejection_reasons = (rejects.results ?? [])
    .map((r) => r.reviewer_notes.trim())
    .filter(Boolean)

  // Recently approved titles — the "more like this" signal.
  const approved = await env.DB
    .prepare(
      `SELECT COALESCE(p.title, a.summary) AS title
       FROM approval_requests a
       LEFT JOIN pipeline_items p ON p.id = a.pipeline_item_id
       WHERE a.status = 'approved'
       ORDER BY COALESCE(a.resolved_at, a.created_at) DESC
       LIMIT 5`
    )
    .all<{ title: string | null }>()
    .catch(() => ({ results: [] as Array<{ title: string | null }> }))
  empty.recent_approved_titles = (approved.results ?? [])
    .map((r) => (r.title ?? '').trim())
    .filter(Boolean)

  return empty
}

export async function getLearningContext(env: Env): Promise<LearningContext> {
  // Respect the same kill-switch the rest of the loop uses.
  const enabled = await getSetting(env, 'learning_loop_enabled')
  if (enabled === 'false') {
    const weights = await applyPatterns(env).catch(() => emptyWeights())
    return {
      has_data: false,
      injection: '',
      weights,
      approvals: {
        approved: 0, rejected: 0, pending: 0, approval_rate: null,
        recent_rejection_reasons: [], recent_approved_titles: [],
      },
    }
  }

  const [weights, approvals] = await Promise.all([
    applyPatterns(env).catch(() => emptyWeights()),
    getApprovalOutcomes(env),
  ])

  const lines: string[] = []

  // Sales-derived winner patterns (already formatted by applyPatterns).
  if (weights.prompt_injection) {
    lines.push(weights.prompt_injection)
  }

  // NEXUS approval outcomes.
  const outcomeLines: string[] = []
  if (approvals.recent_approved_titles.length > 0) {
    outcomeLines.push(
      `Recently APPROVED by the operator (do more like these): ` +
      approvals.recent_approved_titles.slice(0, 5).join('; ')
    )
  }
  if (approvals.recent_rejection_reasons.length > 0) {
    outcomeLines.push(
      `Recently REJECTED — avoid these mistakes: ` +
      approvals.recent_rejection_reasons.slice(0, 5).join(' | ')
    )
  }
  if (approvals.approval_rate !== null) {
    outcomeLines.push(`Current approval rate: ${Math.round(approvals.approval_rate * 100)}%.`)
  }
  if (outcomeLines.length > 0) {
    lines.push(`[OPERATOR FEEDBACK FROM THE PIPELINE]\n${outcomeLines.join('\n')}\n[END OPERATOR FEEDBACK]`)
  }

  const injection = lines.join('\n\n')

  return {
    has_data: injection.length > 0,
    injection,
    weights,
    approvals,
  }
}

function emptyWeights(): GenerationWeights {
  return {
    preferred_niches: [],
    preferred_price_range: null,
    title_keywords: [],
    top_tags: [],
    prompt_injection: '',
  }
}
