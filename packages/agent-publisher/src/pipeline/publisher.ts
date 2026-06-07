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

export interface PublisherDeps {
  adapters: PublishAdapter[]
  store?: JobStore
  /** clock for scheduling decisions; default Date.now */
  now?: () => Date
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
  for (const raw of input.jobs) {
    const job = normaliseJob(raw)
    const adapter = map.get(job.platform)
    if (!adapter) {
      unrouted.push(job)
      continue
    }
    if (job.publishAt && new Date(job.publishAt).getTime() > now.getTime()) {
      // future: enqueue, do not call adapter
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
