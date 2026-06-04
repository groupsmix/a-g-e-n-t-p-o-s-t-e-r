import type { Env } from '../../env'
import type { Actor } from './types'

export async function logEvent(
  env: Env,
  jobId: string,
  actor: Actor,
  eventType: string,
  message: string,
  opts?: { taskId?: string; metadata?: Record<string, unknown> },
): Promise<void> {
  const id = crypto.randomUUID()
  const metaStr = opts?.metadata ? JSON.stringify(opts.metadata) : null
  await env.DB.prepare(
    `INSERT INTO freelance_events (id, job_id, task_id, actor, event_type, message, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, jobId, opts?.taskId ?? null, actor, eventType, message, metaStr)
    .run()
}

export async function updateJobStatus(
  env: Env,
  jobId: string,
  status: string,
  extra?: Record<string, string | number | null>,
): Promise<void> {
  const sets = ['status = ?', "updated_at = datetime('now')"]
  const binds: (string | number | null)[] = [status]
  if (extra) {
    for (const [col, val] of Object.entries(extra)) {
      sets.push(`${col} = ?`)
      binds.push(val)
    }
  }
  binds.push(jobId)
  await env.DB.prepare(
    `UPDATE freelance_jobs SET ${sets.join(', ')} WHERE id = ?`,
  )
    .bind(...binds)
    .run()
}

export async function updateTaskStatus(
  env: Env,
  taskId: string,
  status: string,
  extra?: Record<string, string | number | null>,
): Promise<void> {
  const sets = ['status = ?', "updated_at = datetime('now')"]
  const binds: (string | number | null)[] = [status]
  if (extra) {
    for (const [col, val] of Object.entries(extra)) {
      sets.push(`${col} = ?`)
      binds.push(val)
    }
  }
  binds.push(taskId)
  await env.DB.prepare(
    `UPDATE freelance_tasks SET ${sets.join(', ')} WHERE id = ?`,
  )
    .bind(...binds)
    .run()
}

export async function saveArtifact(
  env: Env,
  taskId: string,
  jobId: string,
  version: number,
  outputJson: string,
  ceoReviewJson?: string | null,
  revisionInstructions?: string | null,
): Promise<string> {
  const id = crypto.randomUUID()
  await env.DB.prepare(
    `INSERT INTO freelance_task_artifacts (id, task_id, job_id, version, output_json, ceo_review_json, revision_instructions)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, taskId, jobId, version, outputJson, ceoReviewJson ?? null, revisionInstructions ?? null)
    .run()
  return id
}

export async function incrementAiCalls(env: Env, jobId: string): Promise<number> {
  await env.DB.prepare(
    `UPDATE freelance_jobs SET ai_calls_used = ai_calls_used + 1, updated_at = datetime('now') WHERE id = ?`,
  )
    .bind(jobId)
    .run()
  const row = await env.DB.prepare(
    'SELECT ai_calls_used, max_ai_calls FROM freelance_jobs WHERE id = ?',
  )
    .bind(jobId)
    .first<{ ai_calls_used: number; max_ai_calls: number }>()
  return row?.ai_calls_used ?? 0
}
