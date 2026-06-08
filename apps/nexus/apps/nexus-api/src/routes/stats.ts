import { Hono } from 'hono'
import type { Env } from '../env'
import { getSetting } from '../services/shared'

// ============================================================
// /api/stats — the single consolidated counts endpoint (T3).
//
// Before this, the dashboard home page fired SIX requests to assemble its
// count widgets (pipeline summary + autopilot + spend + learning + revenue +
// digest), and other pages re-derived the same numbers with their own
// queries — so counts could disagree between surfaces. This endpoint returns
// every dashboard count in ONE round trip, from ONE set of D1 queries, so the
// widgets always agree.
//
// Design notes:
//  - Every query is wrapped so a missing/empty table degrades to 0 instead of
//    500-ing the whole endpoint.
//  - Sales/revenue come from the `gumroad_sales` webhook mirror in D1 (fast,
//    no external Gumroad call) — the live per-product breakdown still lives on
//    /api/revenue.
//  - The "pending review" count uses the SAME usable-row filter as
//    /api/pipeline/summary and the /review queue, so the number matches
//    everywhere (BUG-P1-4 parity).
// ============================================================

export const statsRoutes = new Hono<{ Bindings: Env }>()

// Usable-row filter for "needs human eyes" — kept in sync with
// pipeline.ts so every surface shows the same pending count.
const PENDING_REVIEW_SQL = `
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
`

statsRoutes.get('/', async (c) => {
  const db = c.env.DB

  const firstN = async (sql: string): Promise<number> => {
    try {
      const r = await db.prepare(sql).first<{ n: number }>()
      return r?.n ?? 0
    } catch {
      return 0
    }
  }
  const allRows = async <T>(sql: string): Promise<T[]> => {
    try {
      return (await db.prepare(sql).all<T>()).results ?? []
    } catch {
      return []
    }
  }

  const [
    productCounts,
    builtToday,
    builtTotal,
    pendingReview,
    patterns,
    blogPosts,
    subscribers,
    campaigns,
    competitors,
    sales,
    autopilotEnabled,
    killSwitch,
  ] = await Promise.all([
    // Product counts by status (exclude graveyard rows so the janitor's
    // stragglers don't inflate any number).
    allRows<{ status: string; n: number }>(
      `SELECT status, COUNT(*) AS n FROM products WHERE graveyard_at IS NULL GROUP BY status`,
    ),
    firstN(`SELECT COUNT(*) AS n FROM autopilot_log WHERE action = 'build' AND created_at >= date('now')`),
    firstN(`SELECT COUNT(*) AS n FROM autopilot_log WHERE action = 'build'`),
    firstN(PENDING_REVIEW_SQL),
    firstN(`SELECT COUNT(*) AS n FROM winner_patterns`),
    firstN(`SELECT COUNT(*) AS n FROM blog_posts`),
    firstN(`SELECT COUNT(*) AS n FROM subscribers`),
    firstN(`SELECT COUNT(*) AS n FROM email_campaigns`),
    firstN(`SELECT COUNT(*) AS n FROM tracked_competitors`),
    (async () => {
      try {
        const r = await db
          .prepare(`SELECT COUNT(*) AS sales, COALESCE(SUM(amount_usd_cents), 0) AS cents FROM gumroad_sales`)
          .first<{ sales: number; cents: number }>()
        return { total_sales: r?.sales ?? 0, total_revenue: (r?.cents ?? 0) / 100 }
      } catch {
        return { total_sales: 0, total_revenue: 0 }
      }
    })(),
    getSetting(c.env, 'autopilot_enabled').catch(() => 'false'),
    getSetting(c.env, 'kill_switch_active').catch(() => 'false'),
  ])

  const pc = Object.fromEntries(productCounts.map((r) => [r.status, r.n]))
  const total = productCounts.reduce((s, r) => s + r.n, 0)

  // Each build ≈ $0.10 in AI calls (matches pipeline.ts's estimate).
  const spendTodayUsd = Math.round((builtToday ?? 0) * 10) / 100

  return c.json({
    products: {
      total,
      draft: pc['draft'] ?? 0,
      running: pc['running'] ?? 0,
      pending_review: pc['pending_review'] ?? 0,
      approved: pc['approved'] ?? 0,
      published: pc['published'] ?? 0,
      rejected: pc['rejected'] ?? 0,
      failed: pc['failed'] ?? 0,
      built_today: builtToday,
    },
    review: {
      // Canonical "needs review" count — matches /review and pipeline/summary.
      pending: pendingReview,
      approved: pc['approved'] ?? 0,
      rejected: pc['rejected'] ?? 0,
    },
    publish: {
      published: pc['published'] ?? 0,
      failed: pc['failed'] ?? 0,
    },
    sales: {
      total_sales: sales.total_sales,
      total_revenue: sales.total_revenue,
    },
    autopilot: {
      enabled: autopilotEnabled === 'true',
      built_total: builtTotal,
    },
    learning: {
      patterns,
    },
    content: {
      blog_posts: blogPosts,
      subscribers,
      email_campaigns: campaigns,
      competitors,
    },
    spend_today_usd: spendTodayUsd,
    kill_switch_active: killSwitch === 'true',
  })
})
