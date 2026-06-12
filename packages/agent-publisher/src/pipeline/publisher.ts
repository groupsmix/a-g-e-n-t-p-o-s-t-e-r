/**
 * Stage 2 — route + publish.  The publisher keeps a registry of
 * PublishAdapters keyed by platform.  Jobs with publishAt in the
 * future are enqueued (if a store is provided) or returned as
 * scheduled=true without dispatch.
 */

import type {
  JobStore,
  PublishAdapter,
  PublishJob,
  PublishReport,
  PublishResult,
  Platform,
} from '../types.js'
import { normaliseJob } from './normaliser.js'
import { publishToAgentReacher, type AgentReacherConfig } from '../adapters/agent-reacher.js'

export interface PublisherDeps {
  adapters: PublishAdapter[]
  store?: JobStore
  /** clock for scheduling decisions; default Date.now */
  now?: () => Date
  /** Optional AgentReacher config for multi-platform publishing (3+ platforms) */
  agentReacher?: AgentReacherConfig
}

export interface PublisherInput {
  jobs: PublishJob[]
}

export async function runPublisher(
  input: PublisherInput,
  deps: PublisherDeps,
): Promise<PublishReport> {
  const map = new Map<Platform, PublishAdapter>(
    deps.adapters.map((a) => [a.platform, a]),
  )
  const now = (deps.now ?? (() => new Date()))()
  const results: PublishResult[] = []
  const unrouted: PublishJob[] = []

  // Split jobs into due now and future/scheduled
  const dueJobs: PublishJob[] = []
  const futureJobs: PublishJob[] = []

  for (const raw of input.jobs) {
    const job = normaliseJob(raw)
    if (job.publishAt && new Date(job.publishAt).getTime() > now.getTime()) {
      futureJobs.push(job)
    } else {
      dueJobs.push(job)
    }
  }

  // Handle future jobs (enqueue in store or mark scheduled)
  for (const job of futureJobs) {
    if (deps.store) {
      try {
        await deps.store.enqueue(job)
        results.push({ ok: true, platform: job.platform, scheduled: true })
      } catch (err) {
        results.push({
          ok: false,
          platform: job.platform,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    } else {
      results.push({ ok: true, platform: job.platform, scheduled: true })
    }
  }

  // If there are at least 3 unique platforms due now, and AgentReacher is configured,
  // use the AgentReacher multi-platform route.
  const uniquePlatforms = Array.from(new Set(dueJobs.map((j) => j.platform)))
  if (deps.agentReacher && uniquePlatforms.length >= 3 && dueJobs.length > 0) {
    try {
      const platformsToPublish = dueJobs.map((j) => j.platform)
      // Use the first job payload as the master content for the multi-platform post
      const firstJob = dueJobs[0]!
      const reacherResults = await publishToAgentReacher(
        platformsToPublish,
        firstJob,
        deps.agentReacher
      )

      for (const r of reacherResults) {
        results.push(r)
        const matchedJob = dueJobs.find((j) => j.platform === r.platform)
        if (matchedJob && deps.store) {
          await deps.store.markDone(matchedJob, r).catch(() => undefined)
        }
      }

      return { results, unrouted }
    } catch (err) {
      // Fall back to individual platform adapters if AgentReacher fails
      console.warn('AgentReacher multi-platform publish failed; falling back to individual adapters', err)
    }
  }

  // Fallback / standard path: publish each due job individually
  for (const job of dueJobs) {
    const adapter = map.get(job.platform)
    if (!adapter) {
      unrouted.push(job)
      continue
    }
    try {
      const r = await adapter.publish(job)
      results.push(r)
      if (deps.store) await deps.store.markDone(job, r).catch(() => undefined)
    } catch (err) {
      results.push({
        ok: false,
        platform: job.platform,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return { results, unrouted }
}

/**
 * Drain scheduled jobs whose publishAt ≤ now.
 */
export async function drainScheduled(
  deps: PublisherDeps,
): Promise<PublishReport> {
  if (!deps.store) return { results: [], unrouted: [] }
  const now = (deps.now ?? (() => new Date()))()
  const due = await deps.store.dueNow(now)
  return runPublisher({ jobs: due }, deps)
}
