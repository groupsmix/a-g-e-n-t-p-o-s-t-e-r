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

import { wireRegistry, runAgentTask, type WireDeps } from '@posteragent/orchestrator'
import { createAnthropicLLM, createTavilySearch } from '@posteragent/agent-research/adapters'
import { D1BudgetStore } from '@posteragent/agent-budget'
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

  // Publisher adapters are platform-specific and configured per
  // deployment in apps/nexus/apps/nexus-api/src/routes/publisher-queue.ts.
  // Leave the publish handler as its stub until that route exports its
  // adapter array — wireRegistry will keep dispatching to the stub
  // until then.

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
    // `.catch(() => ({ results: [] }))`.
    logger.error(
      'orchestrator-bridge: drain failed',
      err instanceof Error ? err : new Error(String(err)),
    )
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
