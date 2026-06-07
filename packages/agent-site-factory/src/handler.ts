/**
 * Orchestrator handler for site factory (TASK-501).
 * Mounts under task type 'build-site'.
 */

import type { SiteBrief, SiteFactoryReport } from './types.js'
import { runSiteFactory, type SiteFactoryDeps } from './pipeline/site-factory.js'

export interface SiteFactoryPayload extends SiteBrief {}

export interface SiteFactoryHandlerOutcome {
  data: SiteFactoryReport
  summary: string
  memories: Array<{ kind: 'fact'; content: string; meta?: Record<string, unknown> }>
  nextActions: Array<{ type: string; reason: string; payload?: Record<string, unknown> }>
  usage: { inputTokens: number; outputTokens: number }
}

export function createSiteFactoryHandler(deps: SiteFactoryDeps) {
  return {
    type: 'build-site' as const,
    name: 'site-factory',
    description: 'CosmicJS bucket + seed articles + Next.js deploy + weekly cron. TASK-501.',
    async run(ctx: { payload: SiteFactoryPayload }): Promise<SiteFactoryHandlerOutcome> {
      const report = await runSiteFactory(ctx.payload, deps)
      const summary = report.deploy.ok
        ? `Site "${report.bucket.slug}" deployed → ${report.deploy.url} with ${report.articles.length} seed posts; refresh ${report.cron.expression}.`
        : `Site "${report.bucket.slug}" — ${report.articles.length} articles published but deploy failed: ${report.deploy.error}`

      const memories: SiteFactoryHandlerOutcome['memories'] = []
      if (report.deploy.ok && report.deploy.url) {
        memories.push({
          kind: 'fact',
          content: `Site "${report.bucket.title}" launched at ${report.deploy.url}`,
          meta: { niche: report.brief.niche, articles: report.articles.length },
        })
      }
      const nextActions: SiteFactoryHandlerOutcome['nextActions'] = []
      if (report.deploy.ok) {
        nextActions.push({
          type: 'publish',
          reason: 'announce site launch',
          payload: { url: report.deploy.url, title: report.bucket.title },
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
