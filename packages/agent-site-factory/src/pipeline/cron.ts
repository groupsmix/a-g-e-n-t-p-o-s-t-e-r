/**
 * Stage 5 — register a recurring write job that drips fresh articles
 * into the site after the initial seed run.
 */

import type { BucketSpec, CronSchedule, SchedulerClient, SiteBrief } from '../types.js'

export function buildCron(brief: SiteBrief, bucket: BucketSpec): CronSchedule {
  const cadence = Math.max(1, brief.cadenceDays ?? 7)
  // weekly default → 09:00 UTC on Mondays
  const expression = cadence === 7 ? '0 9 * * 1' : `0 9 */${cadence} * *`
  return {
    expression,
    taskType: 'write',
    payload: {
      kind: 'site-refresh',
      bucketSlug: bucket.slug,
      niche: brief.niche,
      audience: brief.audience,
      voice: brief.voice,
    },
  }
}

export async function registerCron(
  scheduler: SchedulerClient | undefined,
  schedule: CronSchedule,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!scheduler) return { ok: false, error: 'no scheduler configured' }
  try {
    return await scheduler.schedule(schedule)
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
