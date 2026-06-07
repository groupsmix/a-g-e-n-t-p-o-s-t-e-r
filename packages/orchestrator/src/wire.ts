/**
 * wire.ts — build a fully-wired AgentRegistry from a single Deps bag.
 *
 * The orchestrator ships with stub handlers under handlers/*. They keep
 * the dispatch path functional (every AgentTaskType has *something*
 * registered). This module is the *production* boot path: pass in your
 * real clients (LLM, image, video, search, memory, publisher adapters,
 * stores) and get back a registry where every handler that can be made
 * real has been overridden with its real implementation.
 *
 * Usage from a Cloudflare Worker:
 *
 *   import { wireRegistry } from '@posteragent/orchestrator/wire'
 *   import { createAnthropicLLM, createTavilySearch } from '@posteragent/agent-research/adapters'
 *
 *   const registry = wireRegistry({
 *     llm:    createAnthropicLLM({ apiKey: env.ANTHROPIC_API_KEY }),
 *     search: createTavilySearch({ apiKey: env.TAVILY_API_KEY }),
 *     memory: new MemoryStore(env.DB, embedder),
 *     image:  myReplicateImageClient,
 *     video:  myRemotionRenderer,
 *     publisher: { adapters: [xAdapter, linkedInAdapter, ...] },
 *     budget: { store: new D1BudgetStore(env.DB) },
 *     autonome: { goals, progress, planner, enqueuer, notifier },
 *     analytics: { adapters, store: new D1SnapshotStore(env.DB) },
 *     revenue:   { adapters, store: new D1RevenueStore(env.DB) },
 *   })
 *
 *   await runAgentTask(taskId, { db: env.DB, registry, embedder, identity })
 *
 * Every dep is optional. Missing deps leave the corresponding handler as
 * its stub — the orchestrator still dispatches without throwing.
 */

import type { AgentTaskType } from '@posteragent/types'
import type {
  LLMClient,
  MemoryClient,
  SearchClient,
} from '@posteragent/agent-research'
import { createResearchHandler } from '@posteragent/agent-research'
import { createPublisherHandler } from '@posteragent/agent-publisher'
import { runAutonomeOnce } from '@posteragent/agent-autonome'
import { runPlatformAnalytics } from '@posteragent/agent-analytics'
import { handleRevenueTask } from '@posteragent/agent-revenue'

import { AgentRegistry, defaultRegistry } from './registry.js'
import type { AgentContext, AgentHandler, HandlerOutcome } from './types.js'

import {
  createWriteHandler,
  type WriteHandlerDeps,
} from './handlers/real/write.js'
import {
  createGenerateImageHandler,
  type GenerateImageHandlerDeps,
  type ImageClient,
} from './handlers/real/generate-image.js'
import {
  createGenerateVideoHandler,
  type GenerateVideoHandlerDeps,
  type VideoRenderer,
} from './handlers/real/generate-video.js'
import {
  createMemoryConsolidateHandler,
  type MemoryConsolidateHandlerDeps,
} from './handlers/real/memory-consolidate.js'

// ─── Deps bag ──────────────────────────────────────────────────────────────

export interface WireDeps {
  /** Anthropic / OpenAI / etc. LLM client (used by research + write). */
  llm?: LLMClient
  /** Web search client (Tavily / Brave). */
  search?: SearchClient
  /** Memory retrieval client (RAG over own data). */
  memory?: MemoryClient

  /** Default model for write/research synthesizer. */
  defaultModel?: string

  /** Image generation. Pass a function or a client. */
  image?: ImageClient | GenerateImageHandlerDeps['image']

  /** Video rendering. */
  video?: VideoRenderer | GenerateVideoHandlerDeps['renderer']

  /** Publisher: array of adapters (X, LinkedIn, etc.) + optional store. */
  publisher?: {
    // Typed loosely to avoid forcing the orchestrator to import
    // @posteragent/agent-publisher at type-check time. The factory call
    // below is the only place that hard-imports.
    adapters: unknown[]
    store?: unknown
  }

  /** Autonome runtime sources for the hourly tick. */
  autonome?: {
    goals: unknown
    progress: unknown
    planner: unknown
    enqueuer: unknown
    notifier?: unknown
    config?: unknown
  }

  /** Budget guard store (for cost-gating tasks). */
  budget?: { store: unknown }

  /** Analytics adapters per platform + snapshot store. */
  analytics?: { adapters: unknown; store?: unknown; windowDays?: number }

  /** Revenue collector adapters + store. */
  revenue?: { adapters: unknown[]; store: unknown }

  /** Memory consolidate options. */
  memoryConsolidate?: MemoryConsolidateHandlerDeps

  /** Custom overrides — wins over defaults. */
  overrides?: AgentHandler[]
}

/**
 * Build a wired AgentRegistry. Missing deps leave that handler as its
 * stub — the registry remains exhaustive so dispatch never 404s.
 */
export function wireRegistry(deps: WireDeps = {}): AgentRegistry {
  const r = defaultRegistry()

  // ── research ──────────────────────────────────────────────────────
  if (deps.llm && (deps.search || deps.memory)) {
    r.override(createResearchHandler({
      llm: deps.llm,
      search: deps.search,
      memory: deps.memory,
    }) as unknown as AgentHandler)
  }

  // ── write ─────────────────────────────────────────────────────────
  if (deps.llm) {
    const writeDeps: WriteHandlerDeps = {
      llm: deps.llm,
      defaultModel: deps.defaultModel,
    }
    r.override(createWriteHandler(writeDeps) as unknown as AgentHandler)
  }

  // ── generate-image ────────────────────────────────────────────────
  if (deps.image) {
    const imageClient: ImageClient =
      typeof (deps.image as ImageClient).generate === 'function'
        ? (deps.image as ImageClient)
        : (deps.image as unknown as ImageClient)
    r.override(createGenerateImageHandler({ image: imageClient }) as unknown as AgentHandler)
  }

  // ── generate-video ────────────────────────────────────────────────
  if (deps.video) {
    const renderer: VideoRenderer =
      typeof (deps.video as VideoRenderer).render === 'function'
        ? (deps.video as VideoRenderer)
        : (deps.video as unknown as VideoRenderer)
    r.override(createGenerateVideoHandler({ renderer }) as unknown as AgentHandler)
  }

  // ── memory-consolidate ────────────────────────────────────────────
  r.override(
    createMemoryConsolidateHandler(deps.memoryConsolidate) as unknown as AgentHandler,
  )

  // ── publisher / autonome / analytics / revenue / budget ───────────
  //
  // These four agent packages don't export AgentHandler-shaped
  // factories (autonome / analytics / revenue / budget all use plain
  // functions like runAutonomeOnce / runPlatformAnalytics). They get
  // wrapped in lightweight shims here so the registry can dispatch
  // them through the same AgentHandler contract.
  //
  // Imports are done lazily (dynamic require pattern) so consumers
  // that don't supply these deps don't pay the bundle cost.

  if (deps.publisher) {
    r.override(wrapPublisherHandler(deps.publisher))
  }

  if (deps.autonome) {
    r.override(wrapAutonomeHandler(deps.autonome))
  }

  if (deps.analytics) {
    r.override(wrapAnalyticsHandler(deps.analytics))
  }

  if (deps.revenue) {
    r.override(wrapRevenueHandler(deps.revenue))
  }

  // ── user overrides win ────────────────────────────────────────────
  for (const h of deps.overrides ?? []) r.override(h)

  return r
}

// ─── Shims ────────────────────────────────────────────────────────────────

function wrapPublisherHandler(p: NonNullable<WireDeps['publisher']>): AgentHandler {
  const inner = createPublisherHandler({
    adapters: p.adapters as Parameters<typeof createPublisherHandler>[0]['adapters'],
    store: p.store as Parameters<typeof createPublisherHandler>[0]['store'],
  })
  // agent-publisher's run takes `{ payload }`; orchestrator's takes a full
  // AgentContext. Adapt.
  return {
    type: 'publish',
    name: inner.name,
    description: inner.description,
    async run(ctx: AgentContext): Promise<HandlerOutcome> {
      const out = await inner.run({ payload: ctx.task.payload as never })
      return {
        data: out.data,
        summary: out.summary,
        memories: out.memories?.map((m) => ({
          type: 'fact' as const,
          content: m.content,
          tags: ['publish'],
        })),
        nextActions: out.nextActions?.map((n) => (typeof n === 'string' ? n : n.reason)),
        usage: out.usage,
      }
    },
  }
}

function wrapAutonomeHandler(a: NonNullable<WireDeps['autonome']>): AgentHandler {
  return {
    type: 'autonome-run',
    name: 'Autonome Loop',
    description: 'Hourly tick: read goals → review progress → identify gaps → queue ≤5 tasks → notify.',
    async run(ctx: AgentContext): Promise<HandlerOutcome> {
      void ctx
      const result = await runAutonomeOnce({
        goals: a.goals as never,
        progress: a.progress as never,
        planner: a.planner as never,
        enqueuer: a.enqueuer as never,
        notifier: a.notifier as never,
        config: a.config as never,
      })
      return {
        data: result,
        summary: `Autonome tick: ${(result as { tasksQueued?: number }).tasksQueued ?? 0} tasks queued`,
        memories: [],
        nextActions: [],
        usage: {},
      }
    },
  }
}

function wrapAnalyticsHandler(a: NonNullable<WireDeps['analytics']>): AgentHandler {
  return {
    type: 'analyse',
    name: 'Platform Analytics',
    description: 'Collect platform analytics (X / LinkedIn / IG / YT) and build engagement report.',
    async run(ctx: AgentContext): Promise<HandlerOutcome> {
      const payload = ctx.task.payload as { posts?: unknown[]; windowDays?: number }
      const result = await runPlatformAnalytics({
        posts: (payload.posts ?? []) as never,
        adapters: a.adapters as never,
        store: a.store as never,
        windowDays: payload.windowDays ?? a.windowDays,
      })
      return {
        data: result,
        summary: `Analytics: ${result.collection.succeeded}/${result.collection.attempted} posts collected`,
        memories: [],
        nextActions: result.report ? ['Review the engagement report'] : [],
        usage: {},
      }
    },
  }
}

function wrapRevenueHandler(rev: NonNullable<WireDeps['revenue']>): AgentHandler {
  // Revenue ticks usually run via cron, not task dispatch. We expose
  // them under 'financial-analysis' so the queue can drive them on
  // demand too.
  return {
    type: 'financial-analysis',
    name: 'Revenue Collector + Financial Snapshot',
    description: 'Pull revenue events from connected platforms and write a snapshot.',
    async run(ctx: AgentContext): Promise<HandlerOutcome> {
      void ctx
      const result = await handleRevenueTask({
        adapters: rev.adapters as never,
        store: rev.store as never,
      })
      const r = result as { collected?: number; attribution?: number }
      return {
        data: result,
        summary: `Revenue tick: ${r.collected ?? 0} events collected`,
        memories: [],
        nextActions: [],
        usage: {},
      }
    },
  }
}

// ─── Re-exports for ergonomics ───────────────────────────────────────────────

export { defaultRegistry, AgentRegistry } from './registry.js'
export type { AgentHandler, AgentContext, HandlerOutcome } from './types.js'
export type { AgentTaskType }
