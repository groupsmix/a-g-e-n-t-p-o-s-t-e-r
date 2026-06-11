import { Hono } from 'hono'
import type { Env } from '../env'
import type { D1PreparedStatement } from '@cloudflare/workers-types'
import { getSetting } from '../services/shared'

// ============================================================
// Pipeline summary — one endpoint that powers the Money Workflow
// dashboard. Runs all DB counts in parallel so the page only
// needs one network round-trip.
// ============================================================

export const pipelineRoutes = new Hono<{ Bindings: Env }>()

  .get('/summary', async (c) => {
  const db = c.env.DB

  const safeFirst = async <T>(stmt: D1PreparedStatement, fallback: T): Promise<T> => {
    try { return (await stmt.first<T>()) ?? fallback } catch { return fallback }
  }
  const safeAll = async <T>(stmt: D1PreparedStatement): Promise<T[]> => {
    try { return (await stmt.all<T>()).results ?? [] } catch { return [] }
  }

  const [
    trendCounts,
    opportunityCounts,
    productCounts,
    recentBuilds,
    marketingCounts,
    learningStats,
    spendToday,
    autopilotEnabled,
    killSwitch,
  ] = await Promise.all([
    // Stage 1: Trend Radar
    safeAll<{ status: string; n: number }>(
      db.prepare(`SELECT status, COUNT(*) as n FROM trend_alerts GROUP BY status`),
    ),

    // Stage 2: Opportunity scoring
    safeAll<{ status: string; n: number }>(
      db.prepare(`SELECT status, COUNT(*) as n FROM opportunities GROUP BY status`),
    ),

    // Stage 3 + 4 + 5: Product pipeline. Exclude graveyard rows from every
    // count so the "Untitled / score 0" janitor's stragglers don't inflate
    // any stage. BUG-P1-4: this is the canonical source the dashboard,
    // money-workflow, and the review page now all read from.
    safeAll<{ status: string; n: number }>(
      db.prepare(`SELECT status, COUNT(*) as n FROM products WHERE graveyard_at IS NULL GROUP BY status`),
    ),

    // Stage 3: Recent builds (last 24 h)
    safeFirst<{ n: number }>(
      db.prepare(
        `SELECT COUNT(*) as n FROM autopilot_log WHERE action = 'build' AND created_at >= datetime('now', '-1 day')`,
      ),
      { n: 0 },
    ),

    // Stage 6: Marketing — products that have a marketing pack vs not
    safeFirst<{ with_marketing: number; without_marketing: number }>(
      db.prepare(`
        SELECT
          SUM(CASE WHEN marketing_pack IS NOT NULL THEN 1 ELSE 0 END) as with_marketing,
          SUM(CASE WHEN marketing_pack IS NULL AND status = 'published' THEN 1 ELSE 0 END) as without_marketing
        FROM products WHERE status = 'published'
      `),
      { with_marketing: 0, without_marketing: 0 },
    ),

    // Stage 8: Learning loop
    safeFirst<{ patterns: number; last_sync: string | null }>(
      db.prepare(`
        SELECT COUNT(*) as patterns,
               MAX(created_at) as last_sync
        FROM learning_patterns
      `),
      { patterns: 0, last_sync: null },
    ),

    // Spend today (builds × $0.10 estimate)
    safeFirst<{ n: number }>(
      db.prepare(
        `SELECT COUNT(*) as n FROM autopilot_log WHERE action = 'build' AND created_at >= date('now')`,
      ),
      { n: 0 },
    ),

    // Autopilot state
    getSetting(c.env, 'autopilot_enabled').catch(() => 'false'),
    getSetting(c.env, 'kill_switch_active').catch(() => 'false'),
  ])

  // BUG-P1-4: the "pending review" number on the dashboard, the /review
  // header, and this endpoint must all agree. Apply the same usable-row
  // filter (real name + score ≥ 1) the products listing now uses, and
  // expose ONE canonical number. The raw count is kept around as
  // `pending_raw` for diagnostics.
  const reviewablePending = await safeFirst<{ n: number }>(
    db.prepare(`
      SELECT COUNT(*) AS n FROM products
        WHERE graveyard_at IS NULL
          AND status = 'pending_review'
          AND name IS NOT NULL
          AND TRIM(name) != ''
          AND LOWER(TRIM(name)) NOT IN (
            'untitled','untitled product','untitled draft',
            '(unnamed)','(unnamed product)','unnamed','draft',
            'new product','tbd','n/a','-','—'
          )
          AND COALESCE(ai_score, 0) >= 1
    `),
    { n: 0 },
  )

  // Product counts by status
  const pc = Object.fromEntries(productCounts.map((r) => [r.status, r.n]))
  const trendsByStatus = Object.fromEntries(trendCounts.map((r) => [r.status, r.n]))
  const oppByStatus = Object.fromEntries(opportunityCounts.map((r) => [r.status, r.n]))

  // Estimated spend: each build ≈ $0.10 in AI calls
  const spendEstimate = Math.round((spendToday?.n ?? 0) * 10) / 100

  return c.json({
    meta: {
      autopilot_enabled: autopilotEnabled === 'true',
      kill_switch_active: killSwitch === 'true',
    },
    stages: {
      trends: {
        new:   trendsByStatus['new']      ?? 0,
        acted: trendsByStatus['acted']    ?? 0,
        total: trendCounts.reduce((s, r) => s + r.n, 0),
      },
      opportunities: {
        new:      oppByStatus['new']      ?? 0,
        scored:   oppByStatus['scored']   ?? 0,
        approved: oppByStatus['approved'] ?? 0,
        rejected: oppByStatus['rejected'] ?? 0,
        total:    opportunityCounts.reduce((s, r) => s + r.n, 0),
      },
      building: {
        running:  pc['running']  ?? 0,
        built_today: recentBuilds?.n ?? 0,
      },
      review: {
        // `pending` is the canonical "needs human eyes" count — filtered
        // to usable rows so it matches the /review queue exactly.
        pending:     reviewablePending?.n ?? 0,
        // `pending_raw` is the unfiltered status='pending_review' count,
        // surfaced for diagnostics / parity with the raw status table.
        pending_raw: pc['pending_review'] ?? 0,
        approved:    pc['approved']       ?? 0,
        rejected:    pc['rejected']       ?? 0,
      },
      publish: {
        ready:     pc['approved']   ?? 0,
        published: pc['published']  ?? 0,
        failed:    pc['failed']     ?? 0,
      },
      marketing: {
        packaged:  marketingCounts?.with_marketing    ?? 0,
        missing:   marketingCounts?.without_marketing ?? 0,
      },
      revenue: {
        // Revenue data comes from /api/revenue (Gumroad). We surface
        // the product counts here; the page fetches real revenue separately.
        total_products: (pc['published'] ?? 0),
      },
      learning: {
        patterns_discovered: learningStats?.patterns  ?? 0,
        last_sync:           learningStats?.last_sync ?? null,
      },
    },
    spend_today_usd: spendEstimate,
    total_products: productCounts.reduce((s, r) => s + r.n, 0),
  })
})


// Seed recommended starting settings for a safe first night.
// POST /api/pipeline/seed-defaults
// Call this once after setup to apply conservative starting values.
  .post('/seed-defaults', async (c) => {
  const { setSetting } = await import('../services/shared')
  const defaults: [string, string][] = [
    ['autopilot_enabled',      'true'],
    ['autopilot_auto_approve', 'true'],
    ['autopilot_auto_publish', 'false'],   // build, don't publish yet
    ['autopilot_min_score',    '8'],
    ['autopilot_per_run',      '1'],
    ['autopilot_max_spend_usd', '2'],      // ~20 builds max per day at $0.10 each
    ['kill_switch_active',     'false'],
  ]
  for (const [k, v] of defaults) {
    await setSetting(c.env, k, v).catch(() => void 0)
  }
  return c.json({ ok: true, applied: defaults.map(([k]) => k) })
})
