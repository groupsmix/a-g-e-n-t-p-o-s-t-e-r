/**
 * Orchestrator handler — registered against task type 'build-app'? no:
 * Product Generation gets its own slot. We piggy-back on the existing
 * 'write' AgentTaskType with payload.kind discriminator so we don't
 * have to extend the enum yet — same pattern used for trend-finder
 * under 'analyse'.
 */

import type { ProductBrief, ProductReport } from './types.js'
import { runProductGen, type ProductGenDeps } from './pipeline/product-gen.js'

export interface ProductGenPayload extends ProductBrief {
  /** discriminator so the 'write' handler dispatch can split. */
  kind: ProductBrief['kind']
}

export interface ProductGenHandlerOutcome {
  data: ProductReport
  summary: string
  memories: Array<{ kind: 'fact'; content: string; meta?: Record<string, unknown> }>
  nextActions: Array<{ type: string; reason: string; payload?: Record<string, unknown> }>
  usage: { inputTokens: number; outputTokens: number }
}

export function createProductGenHandler(deps: ProductGenDeps) {
  return {
    type: 'write' as const,
    name: 'product-gen',
    description: 'Digital product generator (ebook/prompt-pack/template-pack/mini-course). TASK-502.',
    async run(ctx: { payload: ProductGenPayload }): Promise<ProductGenHandlerOutcome> {
      const report = await runProductGen(ctx.payload, deps)
      const summary = report.listed.ok
        ? `Created ${report.brief.kind} "${report.outline.title}" with ${report.outline.units.length} units → ${report.listed.productUrl}`
        : `Created ${report.brief.kind} "${report.outline.title}" but listing failed: ${report.listed.error}`
      const memories: ProductGenHandlerOutcome['memories'] = report.listed.ok
        ? [
            {
              kind: 'fact',
              content: `Product "${report.outline.title}" listed at ${report.listed.productUrl}`,
              meta: {
                kind: report.brief.kind,
                units: report.outline.units.length,
                provider: report.listed.provider,
              },
            },
          ]
        : []
      const nextActions: ProductGenHandlerOutcome['nextActions'] = []
      if (report.listed.ok) {
        nextActions.push({
          type: 'publish',
          reason: 'announce the new product across channels',
          payload: { url: report.listed.productUrl, title: report.outline.title },
        })
      }
      return {
        data: report,
        summary,
        memories,
        nextActions,
        usage: { inputTokens: 0, outputTokens: 0 },
      }
    },
  }
}
