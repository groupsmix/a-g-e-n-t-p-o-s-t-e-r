/**
 * D1-backed scheduler adapter — registers a cron row in the
 * `schedules` table that the orchestrator reads. The table is
 * created lazily so first-use never throws.
 */

import type { CronSchedule, SchedulerClient } from '../types.js'

export interface D1Like {
  prepare(sql: string): {
    bind(...args: unknown[]): { run(): Promise<unknown>; first<T = unknown>(): Promise<T | null> }
    run(): Promise<unknown>
    first<T = unknown>(): Promise<T | null>
  }
}

export interface D1SchedulerConfig {
  db: D1Like
  table?: string
}

export function createD1Scheduler(config: D1SchedulerConfig): SchedulerClient {
  const table = config.table ?? 'schedules'
  let ensured = false
  async function ensure(): Promise<void> {
    if (ensured) return
    await config.db
      .prepare(
        `CREATE TABLE IF NOT EXISTS ${table} (
           id TEXT PRIMARY KEY,
           expression TEXT NOT NULL,
           task_type TEXT NOT NULL,
           payload TEXT NOT NULL,
           created_at TEXT NOT NULL DEFAULT (datetime('now')),
           enabled INTEGER NOT NULL DEFAULT 1
         )`,
      )
      .run()
    ensured = true
  }
  return {
    async schedule(s: CronSchedule) {
      await ensure()
      const id = `sf_${s.taskType}_${Date.now().toString(36)}`
      try {
        await config.db
          .prepare(
            `INSERT INTO ${table} (id, expression, task_type, payload) VALUES (?, ?, ?, ?)`,
          )
          .bind(id, s.expression, s.taskType, JSON.stringify(s.payload))
          .run()
        return { ok: true, id }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    },
  }
}
