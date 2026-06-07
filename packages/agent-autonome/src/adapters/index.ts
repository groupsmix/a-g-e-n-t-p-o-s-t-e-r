/**
 * Adapters — concrete GoalSource / TaskEnqueuer / NotificationSink
 * implementations that wire the loop to the rest of the system.
 *
 *   D1GoalSource         — reads from goals table (migration 030).
 *   D1TaskEnqueuer       — inserts into agent_tasks with status='queued'.
 *   D1AutonomeRunStore   — persists each AutonomeRunResult for the UI.
 *   ConsoleNotificationSink — dev / smoke runs.
 *   WebhookNotificationSink — Slack / Discord / arbitrary endpoint.
 */

import type {
  Goal,
  GoalSource,
  Notification,
  NotificationSink,
  PlannedAction,
  TaskEnqueuer,
} from '../types'

interface D1Like {
  prepare(sql: string): {
    bind(...args: unknown[]): {
      run(): Promise<unknown>
      all<T = unknown>(): Promise<{ results?: T[] }>
      first<T = unknown>(): Promise<T | null>
    }
  }
}

interface GoalRow {
  id: string
  title: string
  metric: string
  target: number
  period: string
  tags: string | null
  enabled: number
}

export class D1GoalSource implements GoalSource {
  constructor(private db: D1Like) {}
  async list(): Promise<Goal[]> {
    const r = await this.db
      .prepare(`SELECT id, title, metric, target, period, tags, enabled FROM goals`)
      .bind()
      .all<GoalRow>()
    return (r.results ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      metric: row.metric as Goal['metric'],
      target: row.target,
      period: row.period as Goal['period'],
      tags: row.tags ? JSON.parse(row.tags) : undefined,
      enabled: !!row.enabled,
    }))
  }
}

export class D1TaskEnqueuer implements TaskEnqueuer {
  constructor(private db: D1Like, private newId: () => string = () => crypto.randomUUID()) {}
  async enqueue(action: PlannedAction): Promise<{ id: string } | null> {
    const id = this.newId()
    try {
      await this.db
        .prepare(
          `INSERT INTO agent_tasks
             (id, type, status, payload, origin, estimated_cost_usd, created_at, updated_at)
           VALUES (?, ?, 'queued', ?, 'autopilot', ?, datetime('now'), datetime('now'))`,
        )
        .bind(
          id,
          action.task_type,
          JSON.stringify(action.payload),
          action.estimated_cost_usd ?? null,
        )
        .run()
      return { id }
    } catch {
      return null
    }
  }
}

export class D1AutonomeRunStore {
  constructor(private db: D1Like) {}
  async record(payload: { generated_at: string; result: unknown }): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO autonome_runs (generated_at, result_json) VALUES (?, ?)`,
      )
      .bind(payload.generated_at, JSON.stringify(payload.result))
      .run()
  }
}

export class ConsoleNotificationSink implements NotificationSink {
  async notify(n: Notification): Promise<void> {
    // eslint-disable-next-line no-console
    console.log(`[autonome:${n.kind}] ${n.title} — ${n.body}`)
  }
}

export class WebhookNotificationSink implements NotificationSink {
  constructor(private url: string) {}
  async notify(n: Notification): Promise<void> {
    await fetch(this.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(n),
    })
  }
}
