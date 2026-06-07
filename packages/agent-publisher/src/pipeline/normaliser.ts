/**
 * Stage 1 — guarantee every PublishJob has the fields adapters
 * rely on (parts non-empty, idempotency key, meta object).
 */

import type { PublishJob } from '../types.js'

function fastHash(s: string): string {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(36)
}

export function normaliseJob(job: PublishJob): PublishJob {
  const parts = job.parts.length ? job.parts : [job.title]
  const idempotencyKey = job.idempotencyKey ?? `${job.platform}:${fastHash(parts.join('|') + (job.publishAt ?? ''))}`
  return {
    ...job,
    parts,
    meta: job.meta ?? {},
    idempotencyKey,
  }
}
