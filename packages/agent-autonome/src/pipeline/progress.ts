/**
 * Default ProgressSource — counts rows in shared D1 tables to answer
 * "are we on track for this goal?". Goals whose metric we don't know
 * how to compute return a zero reading flagged as 'blocked' so the
 * planner can prompt the human.
 *
 *   posts_published    publish_jobs where status='done' in window
 *   leads_collected    leads where created_at in window
 *   revenue_usd        sum gumroad_sales.amount_usd_cents in window
 *   products_shipped   products where status='shipped' in window
 *   tasks_completed    agent_tasks where status='completed' in window
 *
 * `engagement_rate` is a derived metric — callers wire their own
 * source for it because it lives in platform_analytics (TASK-702).
 */

import type { Goal, ProgressReading, ProgressSource } from '../types'

interface D1Like {
  prepare(sql: string): {
    bind(...args: unknown[]): {
      first<T = unknown>(): Promise<T | null>
    }
  }
}

function periodStart(period: Goal['period'], now: Date): Date {
  const d = new Date(now)
  d.setUTCHours(0, 0, 0, 0)
  if (period === 'day') return d
  if (period === 'week') {
    // ISO Monday start
    const dow = (d.getUTCDay() + 6) % 7
    d.setUTCDate(d.getUTCDate() - dow)
    return d
  }
  d.setUTCDate(1)
  return d
}

function classify(achieved: number, target: number): ProgressReading['status'] {
  if (target <= 0) return 'blocked'
  const ratio = achieved / target
  if (ratio >= 1) return ratio >= 1.5 ? 'ahead' : 'on-track'
  if (achieved === 0 && target > 0) return 'blocked'
  return 'off-track'
}

export class D1ProgressSource implements ProgressSource {
  constructor(private db: D1Like) {}

  async readingFor(goal: Goal, now: Date): Promise<ProgressReading> {
    const start = periodStart(goal.period, now)
    const sinceIso = start.toISOString()
    const endIso = now.toISOString()
    let achieved = 0
    try {
      achieved = await this.fetch(goal, sinceIso, endIso)
    } catch {
      achieved = 0
    }
    const ratio = goal.target > 0 ? Math.min(2, achieved / goal.target) : 0
    return {
      goal_id: goal.id,
      window_start: sinceIso,
      window_end: endIso,
      achieved,
      target: goal.target,
      ratio,
      status: classify(achieved, goal.target),
    }
  }

  private async fetch(goal: Goal, sinceIso: string, endIso: string): Promise<number> {
    switch (goal.metric) {
      case 'posts_published': {
        const r = await this.db
          .prepare(
            `SELECT COUNT(*) AS n FROM publish_jobs
              WHERE status = 'done' AND completed_at >= ? AND completed_at < ?`,
          )
          .bind(sinceIso, endIso)
          .first<{ n: number }>()
        return r?.n ?? 0
      }
      case 'leads_collected': {
        const r = await this.db
          .prepare(
            `SELECT COUNT(*) AS n FROM leads WHERE created_at >= ? AND created_at < ?`,
          )
          .bind(sinceIso, endIso)
          .first<{ n: number }>()
        return r?.n ?? 0
      }
      case 'revenue_usd': {
        const r = await this.db
          .prepare(
            `SELECT COALESCE(SUM(amount_usd_cents), 0) AS n
               FROM gumroad_sales
              WHERE created_at >= ? AND created_at < ?`,
          )
          .bind(sinceIso, endIso)
          .first<{ n: number }>()
        return Math.round((r?.n ?? 0) / 100)
      }
      case 'products_shipped': {
        const r = await this.db
          .prepare(
            `SELECT COUNT(*) AS n FROM products
              WHERE status = 'shipped' AND updated_at >= ? AND updated_at < ?`,
          )
          .bind(sinceIso, endIso)
          .first<{ n: number }>()
        return r?.n ?? 0
      }
      case 'tasks_completed': {
        const r = await this.db
          .prepare(
            `SELECT COUNT(*) AS n FROM agent_tasks
              WHERE status = 'completed' AND finished_at >= ? AND finished_at < ?`,
          )
          .bind(sinceIso, endIso)
          .first<{ n: number }>()
        return r?.n ?? 0
      }
      default:
        return 0
    }
  }
}
