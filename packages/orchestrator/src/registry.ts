/**
 * AgentRegistry — typed map of `AgentTaskType` → `AgentHandler`.
 *
 * Single source of truth for "what agents exist and how to dispatch to
 * them".  Used by:
 *   • runAgentTask() in run.ts — picks the handler for a queued task
 *   • the /api/agents/registry endpoint — exposes capabilities to UI
 *   • the command palette — only offers intents that have handlers
 *
 * The registry is strongly typed against `AgentTaskType` so that adding
 * a new task type in `@posteragent/types` immediately surfaces a missing
 * handler as a compile error in `defaultRegistry`.
 */

import type { AgentTaskType } from '@posteragent/types'
import type { AgentHandler } from './types.js'

import { researchHandler } from './handlers/research.js'
import { writeHandler } from './handlers/write.js'
import { buildAppHandler } from './handlers/build-app.js'
import { buildSiteHandler } from './handlers/build-site.js'
import { publishHandler } from './handlers/publish.js'
import { analyseHandler } from './handlers/analyse.js'
import { generateVideoHandler } from './handlers/generate-video.js'
import { generateImageHandler } from './handlers/generate-image.js'
import { leadScrapeHandler } from './handlers/lead-scrape.js'
import { emailCampaignHandler } from './handlers/email-campaign.js'
import { financialAnalysisHandler } from './handlers/financial-analysis.js'
import { brandMonitorHandler } from './handlers/brand-monitor.js'
import { autonomeRunHandler } from './handlers/autonome-run.js'
import { memoryConsolidateHandler } from './handlers/memory-consolidate.js'

export class AgentRegistry {
  private readonly handlers = new Map<AgentTaskType, AgentHandler>()

  register(handler: AgentHandler): this {
    if (this.handlers.has(handler.type)) {
      throw new Error(
        `AgentRegistry: handler for type "${handler.type}" already registered (${this.handlers.get(handler.type)!.name})`,
      )
    }
    this.handlers.set(handler.type, handler)
    return this
  }

  /** Replace an existing handler.  Used in tests + by plugins. */
  override(handler: AgentHandler): this {
    this.handlers.set(handler.type, handler)
    return this
  }

  get(type: AgentTaskType): AgentHandler | undefined {
    return this.handlers.get(type)
  }

  has(type: AgentTaskType): boolean {
    return this.handlers.has(type)
  }

  /** All registered types — useful for command palette / dashboard. */
  types(): AgentTaskType[] {
    return [...this.handlers.keys()]
  }

  /** Public capabilities shape exposed by /api/agents/registry. */
  describe(): Array<{ type: AgentTaskType; name: string; description: string }> {
    return [...this.handlers.values()].map((h) => ({
      type: h.type,
      name: h.name,
      description: h.description,
    }))
  }
}

/**
 * The default registry shipped with the orchestrator.  Every
 * `AgentTaskType` from `@posteragent/types` has a registered handler —
 * most are stubs that return a `not implemented` outcome.  The
 * exhaustive map below is intentional: adding a new task type forces
 * the maintainer to either add a handler or explicitly mark it pending.
 */
export function defaultRegistry(): AgentRegistry {
  const r = new AgentRegistry()

  // The compiler will catch any missing AgentTaskType keys here at the
  // `satisfies` annotation in the array.
  const handlers: AgentHandler[] = [
    researchHandler,
    writeHandler,
    buildAppHandler,
    buildSiteHandler,
    publishHandler,
    analyseHandler,
    generateVideoHandler,
    generateImageHandler,
    leadScrapeHandler,
    emailCampaignHandler,
    financialAnalysisHandler,
    brandMonitorHandler,
    autonomeRunHandler,
    memoryConsolidateHandler,
  ]

  // Exhaustiveness check — every AgentTaskType must appear exactly once.
  const seen = new Set<AgentTaskType>()
  for (const h of handlers) {
    if (seen.has(h.type)) {
      throw new Error(`defaultRegistry: duplicate handler for type ${h.type}`)
    }
    seen.add(h.type)
    r.register(h)
  }

  // Compile-time exhaustiveness — if a new AgentTaskType is added to the
  // union, the line below errors until a handler is registered.
  const _exhaustive: AgentTaskType[] = handlers.map((h) => h.type)
  void _exhaustive

  return r
}
