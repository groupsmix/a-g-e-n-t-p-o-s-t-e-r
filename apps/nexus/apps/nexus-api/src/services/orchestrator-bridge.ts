/**
 * orchestrator-bridge.ts
 *
 * Wires the brain layer (BaseAgent + memory + identity + journal) into
 * the nexus-api worker. Produces a fully-wired registry from the
 * Worker `env`, drains the orchestrator's agent_tasks queue, and gives
 * the scheduled() handler a single entry-point: `tickOrchestrator(env)`.
 *
 * The legacy `services/agents.runJob` product pipeline (Researcher /
 * Scorer / Builder / Inspector / Publisher / Marketer / Analyst) is
 * UNCHANGED. This bridge runs alongside it, draining the parallel
 * `agent_tasks` table populated by:
 *
 *   • the proactivity engine (`runProactivity` with autoQueue:true)
 *   • the autonome agent (`runAutonomeOnce` → enqueue ≤5 tasks)
 *   • dashboard/UI direct dispatch
 *   • the command palette
 *
 * Each drained task runs through `runAgentTask` → BaseAgent, which
 * gives it automatic memory retrieval, system-prompt assembly from
 * SOUL.md + persona + NOW, and a journal_entries row.
 */

import type { Env } from '../env'
import { createLogger } from '@posteragent/logger/workers'
import { getAgent, isAgentTaskType, type AgentTaskType } from './agent-registry'

import { wireRegistry, runAgentTask, type WireDeps } from '@posteragent/orchestrator'
import { createAnthropicLLM, createTavilySearch } from '@posteragent/agent-research/adapters'
import { drainScheduled } from '@posteragent/agent-publisher'
import { createD1JobStore } from '@posteragent/agent-publisher/adapters'
import { BudgetGuard, D1BudgetStore } from '@posteragent/agent-budget'
import { D1SnapshotStore } from '@posteragent/agent-analytics'
import {
  D1GoalSource,
  D1TaskEnqueuer,
  DefaultPlanner,
  ConsoleNotificationSink,
  D1ProgressSource,
} from '@posteragent/agent-autonome'
import { D1RevenueStore, GumroadAdapter, AmazonCsvAdapter } from '@posteragent/agent-revenue'
import { runProactivity } from '@posteragent/proactivity'
import { IdentityLayer, KvSoulLoader } from '@posteragent/identity'
import { MemoryStore } from '@posteragent/memory'

const logger = createLogger({ service: 'orchestrator-bridge' })

type Registry = ReturnType<typeof wireRegistry>

/**
 * Build the wired registry.
 *
 * Previous implementation cached a `Registry` keyed on the `env` object
 * identity. In a Cloudflare Worker isolate, `env` is reused across many
 * requests, so the cache hit was effectively permanent — meaning two
 * real failure modes (AUDIT-PR20 #3):
 *
 *   1. Secret rotation race: `SECRETS.get(...)` was captured once at
 *      first build, so a rotated key kept yielding 401s until isolate
 *      eviction (hours).
 *   2. No mutex: two concurrent cold-start requests both saw `null`,
 *      both built, the last writer won, the other's adapter array was
 *      silently discarded.
 *
 * Replaced with the in-flight Promise pattern: concurrent cold-start
 * callers share one build, and we deliberately do NOT cache the
 * resolved registry across requests — every call re-fetches secrets so
 * key rotation takes effect immediately. Adapter constructors (D1
 * wrappers, MemoryStore) are all cheap, so this is a few microseconds
 * of overhead per request in exchange for correctness.
 */
let inflight: Promise<Registry> | null = null

/**
 * Audit #44: one factory used by every runAgentTask call site so spend
 * caps configured in the dashboard are actually enforced at dispatch
 * time (pre-flight approve + post-run usage recording).
 */
export function buildBudgetGuard(env: Env): BudgetGuard {
  return new BudgetGuard({ store: new D1BudgetStore(env.DB) })
}

export async function getWiredRegistry(env: Env): Promise<Registry> {
  if (inflight) return inflight
  inflight = buildRegistry(env).finally(() => {
    // Null out the slot after settle (success or failure) so the next
    // request re-fetches secrets. On failure the next caller retries
    // from scratch instead of inheriting a stuck rejection.
    inflight = null
  })
  return inflight
}

async function buildRegistry(env: Env): Promise<Registry> {
  const deps: WireDeps = {}

  // Pull secrets through the Secrets Store. Missing keys leave the
  // corresponding handler as its stub — never a hard failure.
  const [anthropicKey, tavilyKey, amazonReportUrl] = await Promise.all([
    env.SECRETS.get('ANTHROPIC_API_KEY').catch(() => null),
    env.SECRETS.get('TAVILY_API_KEY').catch(() => null),
    env.SECRETS.get('AMAZON_REPORT_URL').catch(() => null),
  ])

  if (anthropicKey) {
    deps.llm = createAnthropicLLM({ apiKey: anthropicKey })
  }
  if (tavilyKey) {
    deps.search = createTavilySearch({ apiKey: tavilyKey })
  }
  // Memory RAG.
  deps.memory = new MemoryStore(env.DB) as unknown as WireDeps['memory']

  // Budget guard.
  deps.budget = { store: new D1BudgetStore(env.DB) }

  // Analytics — uses already-wired adapters from the analytics route.
  // We expose a thin Analytics handler with the D1 snapshot store; the
  // adapter map is filled at dispatch time via the task payload.
  deps.analytics = {
    adapters: {},
    store: new D1SnapshotStore(env.DB),
  }

  // Revenue — Gumroad / Amazon (others can be added).
  if (env.GUMROAD_ACCESS_TOKEN || amazonReportUrl) {
    const revenueAdapters: unknown[] = []
    if (env.GUMROAD_ACCESS_TOKEN) {
      // GumroadAdapter is webhook-driven; presence of the access token
      // just acts as a feature flag for now.
      revenueAdapters.push(new GumroadAdapter())
    }
    if (amazonReportUrl) {
      // AmazonCsvAdapter is push-based (fed by the report-upload route);
      // the URL is queued there, not via constructor.
      revenueAdapters.push(new AmazonCsvAdapter())
    }
    deps.revenue = {
      adapters: revenueAdapters,
      store: new D1RevenueStore(env.DB),
    }
  }

  // Autonome — hourly tick sources.
  deps.autonome = {
    goals: new D1GoalSource(env.DB),
    progress: new D1ProgressSource(env.DB),
    planner: new DefaultPlanner(),
    enqueuer: new D1TaskEnqueuer(env.DB),
    notifier: new ConsoleNotificationSink(),
  }

  // Publisher — read secrets for each platform and instantiate adapters.
  const store = createD1JobStore(env.DB as any)
  const publisherAdapters: any[] = []

  const [xToken, liToken, igToken, ttToken, ytToken, nsToken, nsBaseUrl, cosmicSlug, cosmicReadKey, cosmicWriteKey, reacherUrl, reacherApiKey] = await Promise.all([
    env.SECRETS.get('X_BEARER_TOKEN').catch(() => null),
    env.SECRETS.get('LINKEDIN_ACCESS_TOKEN').catch(() => null),
    env.SECRETS.get('INSTAGRAM_ACCESS_TOKEN').catch(() => null),
    env.SECRETS.get('TIKTOK_ACCESS_TOKEN').catch(() => null),
    env.SECRETS.get('YOUTUBE_ACCESS_TOKEN').catch(() => null),
    env.SECRETS.get('NEWSLETTER_API_KEY').catch(() => null),
    env.SECRETS.get('NEWSLETTER_BASE_URL').catch(() => null),
    env.SECRETS.get('COSMIC_BUCKET_SLUG').catch(() => null),
    env.SECRETS.get('COSMIC_READ_KEY').catch(() => null),
    env.SECRETS.get('COSMIC_WRITE_KEY').catch(() => null),
    env.SECRETS.get('AGENT_REACHER_URL').catch(() => null),
    env.SECRETS.get('AGENT_REACHER_API_KEY').catch(() => null),
  ])

  if (xToken) {
    const { createXAdapter } = await import('@posteragent/agent-publisher/adapters')
    publisherAdapters.push(createXAdapter({ bearerToken: xToken }))
  }
  if (liToken) {
    const { createLinkedInAdapter } = await import('@posteragent/agent-publisher/adapters')
    publisherAdapters.push(createLinkedInAdapter({ accessToken: liToken }))
  }
  if (igToken) {
    const { createInstagramAdapter } = await import('@posteragent/agent-publisher/adapters')
    publisherAdapters.push(createInstagramAdapter({ accessToken: igToken }))
  }
  if (ttToken) {
    const { createTikTokAdapter } = await import('@posteragent/agent-publisher/adapters')
    publisherAdapters.push(createTikTokAdapter({ accessToken: ttToken }))
  }
  if (ytToken) {
    const { createYouTubeAdapter } = await import('@posteragent/agent-publisher/adapters')
    publisherAdapters.push(createYouTubeAdapter({ accessToken: ytToken }))
  }
  if (nsToken) {
    const { createNewsletterAdapter } = await import('@posteragent/agent-publisher/adapters')
    publisherAdapters.push(createNewsletterAdapter({ apiKey: nsToken, baseUrl: nsBaseUrl ?? 'https://api.emailoctopus.com/v3' }))
  }
  if (cosmicSlug && cosmicReadKey && cosmicWriteKey) {
    const { createBlogAdapter } = await import('@posteragent/agent-publisher/adapters')
    publisherAdapters.push(createBlogAdapter({
      bucketSlug: cosmicSlug,
      readKey: cosmicReadKey,
      writeKey: cosmicWriteKey,
    }))
  }

  deps.publisher = {
    adapters: publisherAdapters,
    store,
    agentReacher: reacherUrl ? { url: reacherUrl, apiKey: reacherApiKey ?? undefined } : undefined,
  }

  return wireRegistry(deps)
}

/**
 * Drain up to `max` queued agent_tasks rows. Each task is wrapped with
 * BaseAgent (memory + identity + journal). Errors are captured per
 * task and surfaced in the return value — one bad task can't stop the
 * whole tick, but the operator can see what failed without opening D1.
 */
export interface DrainResult {
  drained: number
  succeeded: number
  failed: number
  /** Capped at the first 5 task-level error strings, never raw upstream errors. */
  errors: Array<{ id: string; error: string }>
}

async function drainOrchestratorQueue(env: Env, max = 5): Promise<DrainResult> {
  const registry = await getWiredRegistry(env)
  const identity = await buildIdentityLayer(env)

  // AUDIT-PR20 #5: previously this `.all()` was wrapped in
  // `.catch(() => ({ results: [] }))`, which made D1 outages and
  // schema-migration mismatches look identical to "no work to do."
  // Now we let it throw and tickOrchestrator's outer catch handles
  // surfacing the error, so the failure is visible in logs.
  const ids = await env.DB
    .prepare(
      `SELECT id FROM agent_tasks WHERE status = 'queued' ORDER BY created_at ASC LIMIT ?`,
    )
    .bind(max)
    .all<{ id: string }>()

  let succeeded = 0
  let failed = 0
  const errors: Array<{ id: string; error: string }> = []
  for (const { id } of ids.results ?? []) {
    try {
      const result = await runAgentTask(id, {
        db: env.DB as never,
        registry,
        identity,
        log: logger as never,
        // Audit #44: enforce dashboard spend caps at dispatch time.
        budget: buildBudgetGuard(env),
      })
      if (result.status === 'done') {
        succeeded++
      } else {
        failed++
        if (errors.length < 5) {
          errors.push({ id, error: (result.error ?? 'failed').slice(0, 200) })
        }
      }
    } catch (err) {
      failed++
      const msg = err instanceof Error ? err.message : String(err)
      logger.error(
        'orchestrator-bridge: task crashed',
        err instanceof Error ? err : new Error(msg),
        { id },
      )
      if (errors.length < 5) {
        errors.push({ id, error: msg.slice(0, 200) })
      }
    }
  }

  return { drained: ids.results?.length ?? 0, succeeded, failed, errors }
}

/**
 * Run the proactivity engine: read journal + NOW + tasks state and
 * auto-queue follow-up agent_tasks rows. Read-only first pass, write
 * mode is enabled by passing autoQueue: true.
 *
 * Module-private — only called by `tickOrchestrator` (AUDIT-PR20
 * dead-code: previously exported but had no external callers).
 */
async function tickProactivity(env: Env): Promise<void> {
  try {
    const report = await runProactivity({
      db: env.DB as never,
      autoQueue: true,
      log: logger as never,
    })
    logger.info('proactivity tick', {
      signals: report.signals.length,
      queued: report.queued?.length ?? 0,
    })
  } catch (err) {
    logger.error('proactivity tick error', err instanceof Error ? err : new Error(String(err)))
  }
}

/**
 * Single entrypoint for the scheduled() handler. Runs proactivity →
 * autonome via the registry's autonome-run handler (by enqueueing one
 * agent_tasks row) → drains the queue. All steps swallow errors.
 */
export async function tickOrchestrator(env: Env): Promise<void> {
  // 1. Proactivity — scan + auto-queue.
  await tickProactivity(env)

  // 2. Make sure an autonome-run task is queued. We don't queue every
  //    tick — only when there isn't already one queued or running.
  //
  //    AUDIT-PR20 #5: previously `.catch(() => null)` on the SELECT and
  //    `.catch(() => void 0)` on the INSERT silently swallowed D1
  //    errors. We now let them throw into the outer try/catch so the
  //    log line tells you what went wrong instead of cheerfully
  //    reporting "no autonome task queued."
  try {
    const open = await env.DB
      .prepare(
        `SELECT id FROM agent_tasks
         WHERE type = 'autonome-run' AND status IN ('queued', 'running')
         LIMIT 1`,
      )
      .first<{ id: string }>()
    if (!open) {
      const id = crypto.randomUUID().replace(/-/g, '')
      const now = new Date().toISOString()
      await env.DB
        .prepare(
          `INSERT INTO agent_tasks
            (id, type, payload, status, created_at, updated_at)
           VALUES (?, 'autonome-run', '{}', 'queued', ?, ?)`,
        )
        .bind(id, now, now)
        .run()
    }
  } catch (err) {
    logger.error('orchestrator-bridge: autonome enqueue error', err instanceof Error ? err : new Error(String(err)))
  }

  // 3. Drain the queue.
  try {
    const drained = await drainOrchestratorQueue(env, 5)
    // Cast through `unknown` because `DrainResult` is a fixed-field
    // type but the logger's LogContext expects an index signature.
    logger.info('orchestrator drain', { ...drained } as unknown as Record<string, unknown>)
  } catch (err) {
    // Bubbled D1 errors land here. Previously hidden by the in-loop
    // catch; now correctly surfaced so logs trace actual DB outages.
    logger.error(
      'orchestrator-bridge: drain error',
      err instanceof Error ? err : new Error(String(err)),
    )
  }

  // 4. Drain scheduled publisher queue.
  try {
    await runPublisherDrain(env)
  } catch (err) {
    logger.error('orchestrator-bridge: publisher drain error', err instanceof Error ? err : new Error(String(err)))
  }
}

async function runPublisherDrain(env: Env): Promise<void> {
  const store = createD1JobStore(env.DB as any)
  const publisherAdapters: any[] = []

  const [xToken, liToken, igToken, ttToken, ytToken, nsToken, nsBaseUrl, cosmicSlug, cosmicReadKey, cosmicWriteKey, reacherUrl, reacherApiKey] = await Promise.all([
    env.SECRETS.get('X_BEARER_TOKEN').catch(() => null),
    env.SECRETS.get('LINKEDIN_ACCESS_TOKEN').catch(() => null),
    env.SECRETS.get('INSTAGRAM_ACCESS_TOKEN').catch(() => null),
    env.SECRETS.get('TIKTOK_ACCESS_TOKEN').catch(() => null),
    env.SECRETS.get('YOUTUBE_ACCESS_TOKEN').catch(() => null),
    env.SECRETS.get('NEWSLETTER_API_KEY').catch(() => null),
    env.SECRETS.get('NEWSLETTER_BASE_URL').catch(() => null),
    env.SECRETS.get('COSMIC_BUCKET_SLUG').catch(() => null),
    env.SECRETS.get('COSMIC_READ_KEY').catch(() => null),
    env.SECRETS.get('COSMIC_WRITE_KEY').catch(() => null),
    env.SECRETS.get('AGENT_REACHER_URL').catch(() => null),
    env.SECRETS.get('AGENT_REACHER_API_KEY').catch(() => null),
  ])

  if (xToken) {
    const { createXAdapter } = await import('@posteragent/agent-publisher/adapters')
    publisherAdapters.push(createXAdapter({ bearerToken: xToken }))
  }
  if (liToken) {
    const { createLinkedInAdapter } = await import('@posteragent/agent-publisher/adapters')
    publisherAdapters.push(createLinkedInAdapter({ accessToken: liToken }))
  }
  if (igToken) {
    const { createInstagramAdapter } = await import('@posteragent/agent-publisher/adapters')
    publisherAdapters.push(createInstagramAdapter({ accessToken: igToken }))
  }
  if (ttToken) {
    const { createTikTokAdapter } = await import('@posteragent/agent-publisher/adapters')
    publisherAdapters.push(createTikTokAdapter({ accessToken: ttToken }))
  }
  if (ytToken) {
    const { createYouTubeAdapter } = await import('@posteragent/agent-publisher/adapters')
    publisherAdapters.push(createYouTubeAdapter({ accessToken: ytToken }))
  }
  if (nsToken) {
    const { createNewsletterAdapter } = await import('@posteragent/agent-publisher/adapters')
    publisherAdapters.push(createNewsletterAdapter({ apiKey: nsToken, baseUrl: nsBaseUrl ?? 'https://api.emailoctopus.com/v3' }))
  }
  if (cosmicSlug && cosmicReadKey && cosmicWriteKey) {
    const { createBlogAdapter } = await import('@posteragent/agent-publisher/adapters')
    publisherAdapters.push(createBlogAdapter({
      bucketSlug: cosmicSlug,
      readKey: cosmicReadKey,
      writeKey: cosmicWriteKey,
    }))
  }

  const report = await drainScheduled({
    adapters: publisherAdapters,
    store,
    agentReacher: reacherUrl ? { url: reacherUrl, apiKey: reacherApiKey ?? undefined } : undefined,
  })

  const ok = report.results.filter((r) => r.ok).length
  const failed = report.results.filter((r) => !r.ok).length
  if (ok > 0 || failed > 0) {
    logger.info('publisher queue drain', {
      attempted: report.results.length,
      succeeded: ok,
      failed,
      unrouted: report.unrouted.length,
    })
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Build the IdentityLayer for this Worker env. Exported so the
 * money-machine chain can build it once at chain start and thread it
 * through every stage (AUDIT-PR20 #2). Returns `undefined` if
 * construction fails — BaseAgent will fall back to its default identity.
 */
export async function buildIdentityLayer(env: Env): Promise<IdentityLayer | undefined> {
  try {
    const soulLoader = env.CONFIG ? new KvSoulLoader(env.CONFIG) : undefined
    return new IdentityLayer(env.DB as never, { soulLoader })
  } catch (err) {
    logger.warn('identity-layer: falling back to default', {
      error: err instanceof Error ? err.message : String(err),
    })
    return undefined
  }
}

// ─── Direct Sync run support (Task 3.1) ──────────────────────────────────

export class RunError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message)
    this.name = 'RunError'
  }
}

export interface RunArgs {
  taskId?: string
  create?: {
    type: AgentTaskType
    payload?: Record<string, unknown>
    agentId?: string | null
    origin?: string
    parentTaskId?: string | null
  }
  force?: boolean
}

export function validateRunBody(body: unknown): RunArgs {
  if (!body || typeof body !== 'object') {
    throw new RunError('invalid JSON body', 400)
  }
  const b = body as Record<string, unknown>

  if (typeof b.taskId === 'string' && b.taskId.length > 0) {
    return { taskId: b.taskId, force: b.force === true }
  }

  if (b.create && typeof b.create === 'object') {
    const c = b.create as Record<string, unknown>
    if (!isAgentTaskType(c.type)) {
      throw new RunError(`invalid create.type: ${String(c.type)}`, 400)
    }
    return {
      create: {
        type: c.type,
        payload: (c.payload as Record<string, unknown>) ?? {},
        agentId: typeof c.agentId === 'string' ? c.agentId : null,
        origin: typeof c.origin === 'string' ? c.origin : 'api',
        parentTaskId: typeof c.parentTaskId === 'string' ? c.parentTaskId : null,
      },
      force: b.force === true,
    }
  }

  if (isAgentTaskType(b.type)) {
    return {
      create: {
        type: b.type,
        payload: (b.payload as Record<string, unknown>) ?? {},
        agentId: typeof b.agentId === 'string' ? b.agentId : null,
        origin: typeof b.origin === 'string' ? b.origin : 'api',
        parentTaskId: typeof b.parentTaskId === 'string' ? b.parentTaskId : null,
      },
      force: false,
    }
  }

  throw new RunError(
    'body must contain taskId, create{type,payload}, or top-level {type,payload}',
    400,
  )
}

export function inflateTask(row: any): Record<string, unknown> {
  const parse = (s: string | null): unknown => {
    if (s == null) return null
    try {
      return JSON.parse(s)
    } catch {
      return s
    }
  }
  return {
    ...row,
    payload: parse(row.payload),
    result: parse(row.result),
  }
}

export async function runSingleAgentTask(
  env: Env,
  args: RunArgs,
): Promise<{ task: any; ranInline: boolean; reason?: string }> {
  const registry = await getWiredRegistry(env)
  const identity = await buildIdentityLayer(env)

  let taskId = args.taskId ?? ''
  if (!taskId && args.create) {
    const desc = await getAgent(args.create.type, env)
    taskId = crypto.randomUUID().replace(/-/g, '').slice(0, 32)
    const now = new Date().toISOString()
    await env.DB
      .prepare(
        `INSERT INTO agent_tasks (
           id, type, status, payload, agent_id, origin,
           parent_task_id, estimated_cost_usd, created_at, updated_at
         )
         VALUES (?, ?, 'queued', ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        taskId,
        args.create.type,
        JSON.stringify(args.create.payload ?? {}),
        args.create.agentId ?? null,
        args.create.origin ?? 'api',
        args.create.parentTaskId ?? null,
        desc?.estimatedCostUsd ?? null,
        now,
        now,
      )
      .run()
  }

  const initial = await env.DB
    .prepare(`SELECT * FROM agent_tasks WHERE id = ?`)
    .bind(taskId)
    .first<any>()

  if (!initial) {
    return { task: null, ranInline: false, reason: 'Task not found' }
  }

  if (initial.status !== 'queued' && !args.force) {
    logger.info('skip non-queued task', { taskId, status: initial.status })
    return {
      task: initial,
      ranInline: false,
      reason: `status=${initial.status} (use force=true to re-run)`,
    }
  }

  try {
    await runAgentTask(
      taskId,
      {
        db: env.DB as never,
        registry,
        identity,
        log: logger as never,
        budget: buildBudgetGuard(env),
      },
      { force: args.force },
    )

    const updated = await env.DB
      .prepare(`SELECT * FROM agent_tasks WHERE id = ?`)
      .bind(taskId)
      .first<any>()

    return {
      task: updated,
      ranInline: true,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.error('orchestrator-bridge: runSingleAgentTask crashed', err instanceof Error ? err : new Error(msg), { taskId })
    
    const updated = await env.DB
      .prepare(`SELECT * FROM agent_tasks WHERE id = ?`)
      .bind(taskId)
      .first<any>()
      
    return {
      task: updated,
      ranInline: true,
      reason: msg,
    }
  }
}
