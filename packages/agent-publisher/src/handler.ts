/**
 * Publisher handler — task type 'publish'.
 *
 * Payload accepts either { jobs: PublishJob[] } or a single
 * shorthand { platform, title, parts, meta } produced directly by
 * the Writer agent's nextActions.
 */

import type { PublishJob, PublishReport } from './types.js'
import { runPublisher, type PublisherDeps } from './pipeline/publisher.js'

export interface PublisherPayloadShorthand {
  platform: PublishJob['platform']
  format?: string
  title: string
  parts: string[]
  publishAt?: string
  meta?: Record<string, unknown>
  media?: PublishJob['media']
}

export type PublisherPayload =
  | { jobs: PublishJob[] }
  | PublisherPayloadShorthand

export interface PublisherHandlerOutcome {
  data: PublishReport
  summary: string
  memories: Array<{ kind: 'fact'; content: string; meta?: Record<string, unknown> }>
  nextActions: Array<{ type: string; reason: string; payload?: Record<string, unknown> }>
  usage: { inputTokens: number; outputTokens: number }
}

export function createPublisherHandler(deps: PublisherDeps) {
  return {
    type: 'publish' as const,
    name: 'publisher',
    description: 'Multi-platform publisher (X / LinkedIn / IG / TikTok / YT / newsletter / blog). TASK-700.',
    async run(ctx: { payload: PublisherPayload }): Promise<PublisherHandlerOutcome> {
      const jobs: PublishJob[] = 'jobs' in ctx.payload
        ? ctx.payload.jobs
        : [{
            platform: ctx.payload.platform,
            title: ctx.payload.title,
            parts: ctx.payload.parts,
            publishAt: ctx.payload.publishAt,
            media: ctx.payload.media,
            meta: ctx.payload.meta,
          }]
      // If a JobStore is wired, always create draft jobs (needs_approval) first
      // instead of executing the publisher adapter directly.
      if (deps.store) {
        for (const job of jobs) {
          await deps.store.enqueue({
            ...job,
            idempotencyKey: job.idempotencyKey ?? `${job.platform}:${Date.now()}`,
            status: 'needs_approval',
          })
        }
        return {
          data: {
            results: jobs.map((j) => ({
              ok: true,
              platform: j.platform,
              scheduled: true,
            })),
            unrouted: [],
          },
          summary: `Created ${jobs.length} publish draft(s) awaiting approval.`,
          memories: [],
          nextActions: [
            {
              type: 'approval_required',
              reason: 'Review and approve the publish drafts in the Publisher Queue',
            },
          ],
          usage: { inputTokens: 0, outputTokens: 0 },
        }
      }

      const report = await runPublisher({ jobs }, deps)
      const ok = report.results.filter((r) => r.ok).length
      const scheduled = report.results.filter((r) => r.scheduled).length
      const summary = `Published ${ok - scheduled}/${jobs.length} now, ${scheduled} scheduled, ${report.unrouted.length} unrouted.`
      return {
        data: report,
        summary,
        memories: report.results
          .filter((r) => r.ok && !r.scheduled && r.url)
          .map((r) => ({
            kind: 'fact' as const,
            content: `Published on ${r.platform}: ${r.url}`,
            meta: { postId: r.postId },
          })),
        nextActions: [],
        usage: { inputTokens: 0, outputTokens: 0 },
      }
    },
  }
}
