import { Hono } from 'hono'
import type { Env } from '../env'

export const observabilityRoutes = new Hono<{ Bindings: Env }>()

interface WorkflowRow {
  id: string
  status: string
  domain_slug: string | null
  category_slug: string | null
  created_at: string
  updated_at: string | null
}

interface StepRow {
  run_id: string
  step_name: string
  status: string
  model_used: string | null
  error: string | null
  started_at: string | null
  completed_at: string | null
}

interface ProductRow {
  id: string
  title: string
  status: string
  domain_slug: string | null
  gumroad_url: string | null
  created_at: string
}

// BUG-FIX (D1_ERROR: no such column: domain_slug):
//
// The `products` and `workflow_runs` tables do not store `domain_slug` /
// `category_slug` directly — they store `domain_id` / `category_id` and the
// slug lives on the `domains` / `categories` tables. The previous queries
// referenced `domain_slug`/`category_slug`/`updated_at` columns that don't
// exist on those tables, which caused the dashboard's /observability page to
// throw "D1_ERROR: no such column: domain_slug at offset 19". We now JOIN
// through `products → domains → categories` to derive the slugs, and use
// `completed_at` (which does exist) instead of the non-existent
// `workflow_runs.updated_at`. Products use `name AS title` because the
// table has a `name` column (no `title`).
observabilityRoutes.get('/', async (c) => {
  try {
    const [
      recentRuns,
      failedSteps,
      publishResults,
      productCounts,
      aiSpend,
    ] = await Promise.all([
      c.env.DB.prepare(
        `SELECT wr.id, wr.status,
                d.slug AS domain_slug,
                c.slug AS category_slug,
                wr.created_at,
                COALESCE(wr.completed_at, wr.started_at, wr.created_at) AS updated_at
           FROM workflow_runs wr
           JOIN products p   ON wr.product_id = p.id
           LEFT JOIN domains    d ON p.domain_id    = d.id
           LEFT JOIN categories c ON p.category_id  = c.id
          ORDER BY wr.created_at DESC LIMIT 20`,
      ).all<WorkflowRow>(),

      c.env.DB.prepare(
        // SCHEMA DRIFT FIX: the column on workflow_steps is `ai_model_used`,
        // not `model_used`. Selecting `model_used` threw
        // "D1_ERROR: no such column: model_used" and broke the entire
        // /observability page. Alias back to `model_used` to keep the
        // StepRow shape + JSON response unchanged. Guarded by the new
        // schema-drift CI check (scripts/check-schema-drift.mjs).
        `SELECT run_id, step_name, status, ai_model_used AS model_used, error, started_at, completed_at
         FROM workflow_steps WHERE status = 'failed'
         ORDER BY started_at DESC LIMIT 20`,
      ).all<StepRow>(),

      c.env.DB.prepare(
        `SELECT p.id,
                p.name AS title,
                p.status,
                d.slug AS domain_slug,
                p.gumroad_url,
                p.created_at
           FROM products p
           LEFT JOIN domains d ON p.domain_id = d.id
          WHERE p.status IN ('published', 'failed', 'rejected')
          ORDER BY p.created_at DESC LIMIT 20`,
      ).all<ProductRow>(),

      c.env.DB.prepare(
        `SELECT status, COUNT(*) as count FROM products GROUP BY status`,
      ).all<{ status: string; count: number }>(),

      fetchAiSpend(c.env),
    ])

    const failedWorkflows = (recentRuns.results ?? []).filter((r) => r.status === 'failed')
    const successWorkflows = (recentRuns.results ?? []).filter((r) => r.status === 'completed')

    return c.json({
      summary: {
        recent_workflows: recentRuns.results?.length ?? 0,
        failed_workflows: failedWorkflows.length,
        success_workflows: successWorkflows.length,
        failed_ai_steps: failedSteps.results?.length ?? 0,
        product_counts: Object.fromEntries(
          (productCounts.results ?? []).map((r) => [r.status, r.count]),
        ),
        ai_spend_today: aiSpend.today,
        ai_spend_cap: aiSpend.cap,
        ai_cap_reached: aiSpend.cap_reached,
      },
      failed_steps: failedSteps.results ?? [],
      recent_workflows: recentRuns.results ?? [],
      publish_results: publishResults.results ?? [],
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return c.json({ error: message }, 500)
  }
})

async function fetchAiSpend(
  env: Env,
): Promise<{ today: number; cap: number; cap_reached: boolean }> {
  try {
    const res = await env.AI_WORKER.fetch(
      new Request('https://nexus-ai/spend', { method: 'GET' }),
    )
    if (res.ok) {
      return (await res.json()) as { today: number; cap: number; cap_reached: boolean }
    }
  } catch {
    /* AI worker unreachable */
  }
  return { today: 0, cap: 0, cap_reached: false }
}
