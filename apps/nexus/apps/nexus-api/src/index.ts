import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Env } from './env'
import { sweepStaleRuns } from './services/sweep'
import { createLogger } from '@nexus/logger'

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
import { authRoutes, getAccessHash, validateSessionToken } from './routes/auth'
import { revenueRoutes } from './routes/revenue'
import { marketingRoutes, runMarketing } from './routes/marketing'
import { browserRoutes } from './routes/browser'
import { backfillDeliverables } from './services/deliverable'
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
import { competitorRoutes } from './routes/competitors'
import { observabilityRoutes } from './routes/observability'
import { freelanceRoutes } from './routes/freelance'
import { opportunityRoutes } from './routes/opportunities'
import { pipelineRoutes } from './routes/pipeline'
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

// Create the main Hono app
const app = new Hono<{ Bindings: Env }>()

// Middleware
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  exposeHeaders: ['Content-Type'],
  maxAge: 86400,
}))

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

// Access gate — once a password is set, every /api route requires a valid
// bearer token. Auth + asset routes stay open (asset URLs load via <img>/
// downloads that can't carry an Authorization header), and the gate is
// inactive until a password is set so the owner can't lock themselves out.
api.use('*', async (c, next) => {
  if (c.req.method === 'OPTIONS') return next()
  const path = c.req.path // full path, e.g. /api/auth/login
  if (path.startsWith('/api/auth/') || path.startsWith('/api/assets/') || path === '/api/email/subscribe') return next()
  const hash = await getAccessHash(c.env)
  if (!hash) return next() // not protected yet
  const auth = c.req.header('Authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return c.json({ error: 'Unauthorized', code: 'auth_required' }, 401)
  const valid = await validateSessionToken(c.env, token)
  if (!valid) return c.json({ error: 'Unauthorized', code: 'auth_required' }, 401)
  return next()
})

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
api.route('/revenue', revenueRoutes)
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
api.route('/competitors', competitorRoutes)
api.route('/observability', observabilityRoutes)
api.route('/freelance', freelanceRoutes)
api.route('/opportunities', opportunityRoutes)
api.route('/pipeline', pipelineRoutes)
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

// Mount API routes under /api
app.route('/api', api)

// Error handling middleware
app.onError((err, c) => {
  logger.error('Unhandled error', err, { path: c.req.path, method: c.req.method })
  return c.json({
    error: 'Internal Server Error',
    message: err.message || 'An unexpected error occurred',
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

// Export for Cloudflare Workers
export default {
  fetch: app.fetch,
  scheduled: async (_controller: ScheduledController, env: Env, ctx: ExecutionContext) => {
    logger.info('Scheduled tasks triggered')
    ctx.waitUntil(sweepStaleRuns(env))
    ctx.waitUntil(runTrendRadar(env))
    ctx.waitUntil(runDueSchedules(env, ctx))
    ctx.waitUntil(runAutopilot(env, ctx))
    ctx.waitUntil(runMarketing(env, ctx))
    ctx.waitUntil(backfillDeliverables(env))
    ctx.waitUntil(sendDailyDigest(env))
    ctx.waitUntil(runLearningSync(env))
    // Drain job queue — up to 5 agent jobs per cron tick
    ctx.waitUntil((async () => {
      const { dequeue } = await import('./services/job-queue')
      const { runJob }  = await import('./services/agents')
      for (let i = 0; i < 5; i++) {
        const job = await dequeue(env)
        if (!job) break
        await runJob(env, job)
      }
    })())
  },
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

export { app }
