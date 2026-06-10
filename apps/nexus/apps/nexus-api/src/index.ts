import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Env } from './env'
import { cfAccessMiddleware } from './middleware/cf-access'
import { isLocalDevRequest } from './local-dev'
import { sweepStaleRuns } from './services/sweep'
import { runLegacyStatsPull } from './services/legacy-stats-pull'
import { createLogger } from '@posteragent/logger/workers'

const logger = createLogger({ service: 'nexus-api' })

// Route imports
import { workflowRoutes } from './routes/workflow'
import { productRoutes } from './routes/products'
import { reviewRoutes } from './routes/review'
import { publishRoutes } from './routes/publish'
import { domainRoutes } from './routes/domains'
import { platformRoutes } from './routes/platforms'
import { socialRoutes } from './routes/social'
import { promptRoutes } from './routes/prompts'
import { aiModelRoutes } from './routes/ai-models'
import { assetRoutes } from './routes/assets'
import { trendRoutes } from './routes/trends'
import { winnerRoutes } from './routes/winners'
import { graveyardRoutes } from './routes/graveyard'
import { historyRoutes } from './routes/history'
import { settingsRoutes } from './routes/settings'
import { keyRoutes } from './routes/keys'
import { managerRoutes } from './routes/manager'
import { agentRoutes } from './routes/agent'
import { teamRoutes } from './routes/team'
import { scheduleRoutes, runDueSchedules } from './routes/schedules'
import { autopilotRoutes, runAutopilot } from './routes/autopilot'
import { authRoutes } from './routes/auth'
import { accessGate } from './middleware/access-gate'
import { marketingRoutes, runMarketing } from './routes/marketing'
import { browserRoutes } from './routes/browser'
import { backfillDeliverables } from './services/deliverable'
import { ProductWorkflow } from './services/workflow-engine'
import { digestRoutes } from './routes/digest'
import { sendDailyDigest } from './services/digest'
import { learningRoutes, runLearningSync } from './routes/learning'
import { gumroadRoutes } from './routes/gumroad'
import { scoringRoutes } from './routes/scoring'
import { podRoutes } from './routes/pod'
import { browserActionRoutes } from './routes/browser-actions'
import { browserAgentRoutes } from './routes/browser-agent'
import { hyperbeamRoutes } from './routes/hyperbeam'
import { abTestingRoutes } from './routes/ab-testing'
import { blogRoutes } from './routes/blog'
import { emailRoutes } from './routes/email'
import { leadRoutes } from './routes/leads'
import { competitorRoutes } from './routes/competitors'
import { observabilityRoutes } from './routes/observability'
import { freelanceRoutes } from './routes/freelance'
import { opportunityRoutes } from './routes/opportunities'
import { pipelineRoutes } from './routes/pipeline'
import { statsRoutes } from './routes/stats'
import { queueRoutes } from './routes/queue'
import { portfolioRoutes } from './routes/portfolio'
import { ventureRoutes } from './routes/ventures'
import { offerRoutes } from './routes/offers'
import { trackedLinkRoutes } from './routes/tracked-links'
import { eventRoutes } from './routes/events'
import { signalRoutes } from './routes/signals'
import { tasksRoutes } from './routes/tasks'
import { agentsRoutes } from './routes/agents'
import { brainRoutes } from './routes/brain'
import { metricsRoutes } from './routes/metrics'
import { publisherQueueRoutes } from './routes/publisher-queue'
import { analyticsRoutes, buildAdapters as buildAnalyticsAdapters } from './routes/analytics'
import { autonomeRoutes, runAutonomeTick } from './routes/autonome'
import { revenueRoutes, runRevenueTick } from './routes/revenue'
import { tickOrchestrator } from './services/orchestrator-bridge'
import { moneyMachineRoutes } from './routes/money-machine'
import { budgetRoutes } from './routes/budget'
import { insightsRoutes } from './routes/insights'
import {
  D1SnapshotStore,
  collectAnalytics,
  loadPublishedPostsFromD1,
} from '@posteragent/agent-analytics'

// Create the main Hono app
const app = new Hono<{ Bindings: Env }>()

// Middleware
//
// Audit #4: Cloudflare Access gate. Inert until the CF_ACCESS_AUD and
// CF_ACCESS_TEAM_DOMAIN secrets are configured (see middleware/cf-access.ts
// for the setup steps); once set, every route except the public bypass list
// requires a valid Access JWT before anything else runs.
app.use('*', cfAccessMiddleware(['/api/assets/', '/api/email/subscribe', '/health', '/api/health']))

//
// AUDIT-PR20 #7: CORS is the only protection on routes that trigger paid
// actions until the dashboard password is set. We allow-list explicitly
// when ALLOWED_ORIGINS is configured, and fall back to wildcard only for
// local development (when the env binding is unset). The allow-list is
// a comma-separated string in the Worker secret/var, e.g.
//   ALLOWED_ORIGINS="https://nexus-web-cl2.pages.dev,https://app.example.com"
app.use('*', (c, next) => {
  const raw = c.env.ALLOWED_ORIGINS
  const allowList = raw
    ? raw.split(',').map((s) => s.trim()).filter(Boolean)
    : null
  const corsMiddleware = cors({
    // When allow-list is configured, echo back only matching origins.
    // When unset (audit #2): wildcard is only acceptable for genuine local
    // dev — a deployed worker with no ALLOWED_ORIGINS now fails closed
    // instead of allowing any origin.
    origin: (origin) => {
      if (!allowList) return isLocalDevRequest(c.req.url) ? '*' : null
      if (!origin) return null
      return allowList.includes(origin) ? origin : null
    },
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    exposeHeaders: ['Content-Type'],
    maxAge: 86400,
  })
  return corsMiddleware(c, next)
})

// Request logging middleware
app.use('*', async (c, next) => {
  const start = Date.now()
  await next()
  const ms = Date.now() - start
  logger.info('Request', {
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    duration_ms: ms,
  })
})

// Health check endpoint — exposed at both /health (root convention) and
// /api/health (the dashboard's convention).  Both return the same shape.
const healthPayload = () => ({
  status: 'ok' as const,
  timestamp: new Date().toISOString(),
  version: '0.1.0',
})
app.get('/health', (c) => c.json(healthPayload()))
app.get('/api/health', (c) => c.json(healthPayload()))

// API version prefix
const api = new Hono<{ Bindings: Env }>()

// Access gate: the single choke-point in front of every /api route.
// Extracted to ./middleware/access-gate (T17) so the "every route is gated"
// invariant is unit-tested (see access-gate.test.ts) and cannot silently
// drift the day someone mounts a router outside the gate. Behaviour is
// unchanged from the previous inline middleware.
api.use('*', accessGate())

// Mount all route modules
api.route('/auth', authRoutes)
api.route('/workflow', workflowRoutes)
api.route('/products', productRoutes)
api.route('/review', reviewRoutes)
api.route('/publish', publishRoutes)
api.route('/domains', domainRoutes)
api.route('/categories', domainRoutes) // Re-use domain routes for categories
api.route('/platforms', platformRoutes)
api.route('/social', socialRoutes)
api.route('/prompts', promptRoutes)
api.route('/ai-models', aiModelRoutes)
api.route('/assets', assetRoutes)
api.route('/trends', trendRoutes)
api.route('/winners', winnerRoutes)
api.route('/graveyard', graveyardRoutes)
api.route('/history', historyRoutes)
api.route('/settings', settingsRoutes)
api.route('/keys', keyRoutes)
api.route('/manager', managerRoutes)
api.route('/agent', agentRoutes)
api.route('/team', teamRoutes)
api.route('/schedules', scheduleRoutes)
api.route('/autopilot', autopilotRoutes)
// NOTE: /revenue is mounted once, below (Phase 9 — revenue tracker, TASK-901).
// It was previously mounted twice (audit #31).
api.route('/marketing', marketingRoutes)
api.route('/browser', browserRoutes)
api.route('/digest', digestRoutes)
api.route('/learning', learningRoutes)
api.route('/gumroad', gumroadRoutes)
api.route('/niches', scoringRoutes)
api.route('/scoring', scoringRoutes)
api.route('/pod', podRoutes)
api.route('/browser-actions', browserActionRoutes)
api.route('/browser-agent', browserAgentRoutes)
api.route('/hyperbeam', hyperbeamRoutes)
api.route('/ab-tests', abTestingRoutes)
api.route('/blog', blogRoutes)
api.route('/email', emailRoutes)
api.route('/leads', leadRoutes)
api.route('/competitors', competitorRoutes)
api.route('/observability', observabilityRoutes)
api.route('/freelance', freelanceRoutes)
api.route('/opportunities', opportunityRoutes)
api.route('/pipeline', pipelineRoutes)
api.route('/stats', statsRoutes)
api.route('/queue', queueRoutes)
api.route('/portfolio', portfolioRoutes)
api.route('/ventures', ventureRoutes)
api.route('/offers', offerRoutes)
api.route('/tracked-links', trackedLinkRoutes)
api.route('/events', eventRoutes)
api.route('/signals', signalRoutes)
api.route('/tasks', tasksRoutes)
// Phase 3 — orchestrator surface + dashboard brain reads (TASK-300)
api.route('/agents', agentsRoutes)
api.route('/brain', brainRoutes)
// Phase 1 — top-bar KPIs (TASK-104)
api.route('/metrics', metricsRoutes)
// Phase 7 — publisher queue (TASK-701) backed by publish_jobs (TASK-700)
api.route('/publisher-queue', publisherQueueRoutes)
// Phase 7 — analytics aggregator (TASK-702)
api.route('/analytics', analyticsRoutes)
// Phase 9 — autonome mode (TASK-900)
api.route('/autonome', autonomeRoutes)
// Phase 9 — revenue tracker (TASK-901)
api.route('/revenue', revenueRoutes)
// Phase 9 — cost / budget guard (TASK-902)
api.route('/budget', budgetRoutes)
// Phase 10 — MindsDB-backed unified insights (TASK-1003)
api.route('/insights', insightsRoutes)
// Auto money machine — end-to-end chain (research → write → generate → publish)
// backed by the orchestrator's BaseAgent (memory + identity + journal).
api.route('/money-machine', moneyMachineRoutes)

// Mount API routes under /api
app.route('/api', api)

// Error handling middleware
app.onError((err, c) => {
  // Audit #32: never echo internal error details (err.message can leak
  // stack paths, SQL fragments, upstream API responses). Log the full error
  // under a correlation id and return only the id to the client.
  const requestId = crypto.randomUUID()
  logger.error('Unhandled error', err, {
    path: c.req.path,
    method: c.req.method,
    request_id: requestId,
  })
  return c.json({
    error: 'Internal Server Error',
    request_id: requestId,
    path: c.req.path,
  }, 500)
})

// 404 handler
app.notFound((c) => {
  return c.json({
    error: 'Not Found',
    message: `Route ${c.req.method} ${c.req.path} not found`,
  }, 404)
})

// Cron expression for the dedicated run-timeout janitor lane (T13). MUST stay
// byte-for-byte identical to the high-frequency entry in wrangler.toml —
// Cloudflare passes the matched expression back as `controller.cron`, and we
// branch on it so the every-5-min lane runs ONLY the stale-run sweep instead
// of the whole daily batch (digest, trend radar, analytics, …).
const STALE_SWEEP_CRON = '*/5 * * * *'

// Cron expression for the legacy stats-pull lane (audit §2.2, item 11) —
// the Workers port of .github/workflows/stats-pull.yml. Same matching rule
// as STALE_SWEEP_CRON: must stay byte-for-byte identical to wrangler.toml.
// Runs every 6h like the legacy Actions cron it parallel-runs against; safe
// no-op until the SUPABASE_* secrets are configured on the worker.
const LEGACY_STATS_CRON = '0 */6 * * *'

// Export for Cloudflare Workers
export default {
  fetch: app.fetch,
  scheduled: async (controller: ScheduledController, env: Env, ctx: ExecutionContext) => {
    // High-frequency lane: just the run-timeout janitor. On its own cron, a
    // stuck RUNNING run/task is reaped within ~10 min (cutoff) instead of
    // waiting up to 24h for the daily 07:00 batch — the bug T13 fixes.
    if (controller.cron === STALE_SWEEP_CRON) {
      ctx.waitUntil(sweepStaleRuns(env))
      return
    }

    // Legacy stats-pull lane (audit §2.2): TikTok/IG engagement for posts
    // published by the LEGACY pipeline, written to Supabase. Distinct from
    // runAnalyticsCollector (TASK-702), which only covers NEXUS publish_jobs.
    if (controller.cron === LEGACY_STATS_CRON) {
      ctx.waitUntil(runLegacyStatsPull(env).catch((err) => {
        logger.error('Legacy stats pull error', err instanceof Error ? err : new Error(String(err)))
      }))
      return
    }

    logger.info('Scheduled tasks triggered')
    ctx.waitUntil(sweepStaleRuns(env))
    ctx.waitUntil(runTrendRadar(env))
    ctx.waitUntil(runDueSchedules(env, ctx))
    ctx.waitUntil(runAutopilot(env, ctx))
    ctx.waitUntil(runMarketing(env, ctx))
    ctx.waitUntil(backfillDeliverables(env))
    ctx.waitUntil(sendDailyDigest(env))
    ctx.waitUntil(runLearningSync(env))
    // TASK-702 — daily platform analytics collector.
    ctx.waitUntil(runAnalyticsCollector(env))
    // TASK-900 — hourly Autonome tick.
    ctx.waitUntil(runAutonomeTick(env).catch((err) => {
      logger.error('Autonome tick error', err instanceof Error ? err : new Error(String(err)))
    }))
    // TASK-901 — revenue pollers (affiliate / AdSense).
    ctx.waitUntil(runRevenueTick(env).catch((err) => {
      logger.error('Revenue tick error', err instanceof Error ? err : new Error(String(err)))
    }))
    // T1.11 — resume any runs parked in 'waiting_ai' once AI models recover.
    ctx.waitUntil(resumeWaitingAiRuns(env, ctx))

    // Drain legacy job queue — up to 5 agent jobs per cron tick.
    ctx.waitUntil((async () => {
      const { dequeue } = await import('./services/job-queue')
      const { runJob }  = await import('./services/agents')
      for (let i = 0; i < 5; i++) {
        const job = await dequeue(env)
        if (!job) break
        await runJob(env, job)
      }
    })())

    // Brain-layer auto loop — proactivity → autonome enqueue → drain
    // orchestrator agent_tasks via BaseAgent (memory + identity +
    // journal). Runs in parallel with the legacy product pipeline.
    ctx.waitUntil(
      tickOrchestrator(env).catch((err) => {
        logger.error(
          'Orchestrator tick error',
          err instanceof Error ? err : new Error(String(err)),
        )
      }),
    )
  },
}

// ------------------------------------------------------------
// T1.11 — Wake-check + workflow resumption cron.
//
// Called every cron tick from the daily batch. Asks nexus-ai's /wake-check
// endpoint whether any rate-limit cooldowns have now expired. If at least one
// model's cooldown has expired (or no models are currently rate-limited), we
// have spare AI capacity and should retry runs that were parked in
// 'waiting_ai' status.
//
// We cap at WAKE_RESUME_LIMIT runs per tick so a large backlog doesn't flood
// a single Worker invocation with 90-second AI timeouts all at once.
// ------------------------------------------------------------
const WAKE_RESUME_LIMIT = 5

async function resumeWaitingAiRuns(env: Env, ctx: ExecutionContext): Promise<void> {
  try {
    // 1. Ask nexus-ai which model cooldowns have expired.
    const wakeRes = await env.AI_WORKER.fetch(
      new Request(env.NEXUS_AI_URL
        ? env.NEXUS_AI_URL.replace('/task', '/wake-check')
        : 'https://nexus-ai/wake-check',
        { method: 'GET' },
      )
    ).catch(() => null)

    if (!wakeRes?.ok) {
      logger.warn('resumeWaitingAiRuns: wake-check unreachable, skipping resume')
      return
    }

    const wakeData = (await wakeRes.json()) as { expired: string[]; active: string[] }

    // If models are still rate-limited and none have just cleared, there is no
    // new capacity — skip rather than immediately re-park the same runs.
    if (wakeData.active.length > 0 && wakeData.expired.length === 0) {
      logger.info('resumeWaitingAiRuns: models still rate-limited, skipping', {
        active: wakeData.active.length,
      })
      return
    }

    // 2. Fetch up to WAKE_RESUME_LIMIT runs parked in 'waiting_ai'.
    //    Join through products → domains/categories to recover the slugs that
    //    ProductWorkflow.run() needs (they are not stored on workflow_runs itself).
    const rows = await env.DB
      .prepare(
        `SELECT
           wr.id          AS run_id,
           p.id           AS product_id,
           p.user_input,
           d.slug         AS domain_slug,
           cat.slug       AS category_slug
         FROM workflow_runs wr
         JOIN products    p   ON p.id  = wr.product_id
         JOIN domains     d   ON d.id  = p.domain_id
         JOIN categories  cat ON cat.id = p.category_id
         WHERE wr.status = 'waiting_ai'
         ORDER BY wr.created_at ASC
         LIMIT ?`
      )
      .bind(WAKE_RESUME_LIMIT)
      .all<{
        run_id: string
        product_id: string
        user_input: string | null
        domain_slug: string
        category_slug: string
      }>()

    const parked = rows.results ?? []
    if (parked.length === 0) {
      logger.info('resumeWaitingAiRuns: no waiting_ai runs to resume')
      return
    }

    logger.info('resumeWaitingAiRuns: resuming parked runs', { count: parked.length })

    const now = new Date().toISOString()

    for (const row of parked) {
      // 3. Reset run + product status so the engine treats this as a fresh start.
      await env.DB.prepare(
        `UPDATE workflow_runs
            SET status='queued', started_at=NULL, completed_at=NULL, error=NULL, current_step=NULL
          WHERE id=?`
      ).bind(row.run_id).run().catch(() => void 0)

      await env.DB.prepare(
        `UPDATE products SET status='running', updated_at=? WHERE id=?`
      ).bind(now, row.product_id).run().catch(() => void 0)

      // 4. Re-fire the full 15-step pipeline. Each run gets its own waitUntil
      //    so a failure in one doesn't abort the others.
      const userInput: Record<string, unknown> =
        row.user_input ? (JSON.parse(row.user_input) as Record<string, unknown>) : {}

      const engine = new ProductWorkflow(env)
      ctx.waitUntil(
        engine
          .run(row.run_id, row.product_id, row.domain_slug, row.category_slug, userInput)
          .catch((err) => {
            logger.error(
              'resumeWaitingAiRuns: run failed',
              err instanceof Error ? err : new Error(String(err)),
              { run_id: row.run_id, product_id: row.product_id },
            )
          })
      )
    }
  } catch (err) {
    logger.error(
      'resumeWaitingAiRuns: unexpected error',
      err instanceof Error ? err : new Error(String(err)),
    )
  }
}

// ------------------------------------------------------------
// Trend radar cron — asks nexus-ai for rising topics per active domain,
// upserts them into `trend_alerts` for the UI to surface.
// ------------------------------------------------------------
async function runTrendRadar(env: Env): Promise<void> {
  try {
    const enabled = await env.DB
      .prepare("SELECT value FROM settings WHERE key = 'trend_radar_enabled' LIMIT 1")
      .first<{ value: string }>()
      .catch(() => null)
    if (enabled?.value === 'false') {
      logger.info('Trend radar disabled in settings, skipping')
      return
    }

    const domains = await env.DB
      .prepare('SELECT id, name, slug FROM domains WHERE is_active = 1 LIMIT 20')
      .all<{ id: string; name: string; slug: string }>()

    for (const d of domains.results ?? []) {
      try {
        const prompt = `Return JSON {trends:[{keyword:string, score:number (0-100), source:string, suggested_niche:string, demand_window:"rising"|"hot"|"peak"}]} for up to 5 trending topics in the "${d.name}" product domain this week. Be specific, not generic.`
        const res = await env.AI_WORKER.fetch(
          new Request(env.NEXUS_AI_URL ?? 'https://nexus-ai/task', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ taskType: 'trend_analysis', prompt, outputFormat: 'json', timeoutMs: 60000 }),
          })
        )
        if (!res.ok) {
          logger.error('Trend radar AI failed', new Error(`HTTP ${res.status}`), { domain: d.slug, status: res.status })
          continue
        }
        const data = (await res.json()) as { output?: string }
        let parsed: any = null
        try { parsed = JSON.parse(data.output ?? '') } catch { parsed = null }
        const trends: Array<{
          keyword: string
          score: number
          source: string
          suggested_niche?: string
          demand_window?: string
        }> = Array.isArray(parsed?.trends) ? parsed.trends : []

        const now = new Date().toISOString()
        for (const t of trends) {
          if (!t?.keyword) continue
          await env.DB
            .prepare(
              `INSERT INTO trend_alerts
                 (id, domain_id, trend_keyword, trend_score, demand_window, source, suggested_niche, status, detected_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, 'new', ?)`
            )
            .bind(
              crypto.randomUUID(),
              d.id,
              t.keyword,
              Number(t.score ?? 0),
              t.demand_window ?? null,
              t.source ?? 'ai',
              t.suggested_niche ?? null,
              now,
            )
            .run()
            .catch(() => void 0)
        }
        logger.info('Trend radar stored trends', { domain: d.slug, count: trends.length })
      } catch (inner) {
        logger.error('Trend radar inner error', inner instanceof Error ? inner : new Error(String(inner)), { domain: d.slug })
      }
    }
  } catch (err) {
    logger.error('Trend radar cron error', err instanceof Error ? err : new Error(String(err)))
  }
}

// ------------------------------------------------------------
// Analytics collector cron — TASK-702. Pulls recent published posts
// from publish_jobs, hits each platform's analytics API, stores
// snapshots in platform_analytics. Per-post errors are swallowed.
// ------------------------------------------------------------
async function runAnalyticsCollector(env: Env): Promise<void> {
  try {
    const posts = await loadPublishedPostsFromD1(env.DB, { windowDays: 30 })
    if (posts.length === 0) return
    const adapters = await buildAnalyticsAdapters(env)
    const store = new D1SnapshotStore(env.DB)
    const r = await collectAnalytics({ adapters, store, posts })
    logger.info('Analytics collector run', {
      attempted: r.attempted,
      succeeded: r.succeeded,
      failed: r.failed,
      unrouted: r.unrouted,
    })
  } catch (err) {
    logger.error('Analytics collector error', err instanceof Error ? err : new Error(String(err)))
  }
}

export { app }
