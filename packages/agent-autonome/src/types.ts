/**
 * Autonome contracts (TASK-900).
 *
 * A Goal is a measurable target the assistant is responsible for
 * making progress on (e.g. "publish 5 posts per week", "ship one
 * new product per month"). Each hour the Autonome loop:
 *   1. Loads goals from the goal source.
 *   2. Reads ProgressMetrics for each goal.
 *   3. Decides which goals are off-track and what AgentTaskType +
 *      payload would close the gap.
 *   4. Queues up to maxTasksPerRun new tasks via the enqueue hook.
 *   5. Fires a Notification when there's something the human should
 *      know (off-track goal, blocked task, big win).
 *
 * Every part is swappable so tests can drive the whole loop with
 * pure data.
 */

import type { AgentTaskType } from '@posteragent/types'

export type GoalMetricKind =
  | 'posts_published'
  | 'leads_collected'
  | 'revenue_usd'
  | 'products_shipped'
  | 'tasks_completed'
  | 'engagement_rate'
  | 'custom'

export type GoalPeriod = 'day' | 'week' | 'month'

export interface Goal {
  id: string
  title: string
  metric: GoalMetricKind
  /** Target absolute count or fraction (engagement_rate is 0..1). */
  target: number
  period: GoalPeriod
  /** Tags the planner uses to pick an action. e.g. ['publish', 'x']. */
  tags?: string[]
  /** Active toggle; off-track goals only fire when enabled. */
  enabled: boolean
}

export interface ProgressReading {
  goal_id: string
  /** Window the value covers (matches goal.period). */
  window_start: string
  window_end: string
  /** Achieved value over the window. */
  achieved: number
  /** target value (mirrored for convenience). */
  target: number
  /** achieved / target, capped at 0..2. */
  ratio: number
  status: 'on-track' | 'off-track' | 'ahead' | 'blocked'
}

export interface PlannedAction {
  goal_id: string
  task_type: AgentTaskType
  payload: Record<string, unknown>
  /** Human-readable rationale shown in the notification. */
  reason: string
  /** Estimated cost in USD if we know it; null otherwise. */
  estimated_cost_usd?: number | null
}

export type NotificationKind = 'off-track' | 'blocked' | 'milestone' | 'summary'

export interface Notification {
  kind: NotificationKind
  title: string
  body: string
  goal_id?: string
  at: string
}

export interface GoalSource {
  list(): Promise<Goal[]>
}

export interface ProgressSource {
  readingFor(goal: Goal, now: Date): Promise<ProgressReading>
}

export interface AutonomePlanner {
  plan(goal: Goal, reading: ProgressReading): Promise<PlannedAction[]>
}

export interface TaskEnqueuer {
  enqueue(action: PlannedAction): Promise<{ id: string } | null>
}

export interface NotificationSink {
  notify(n: Notification): Promise<void>
}

export interface AutonomeConfig {
  maxTasksPerRun?: number
  /** Don't replan a goal if the previous plan ran < cooldownMs ago. */
  cooldownMs?: number
}

export interface AutonomeRunResult {
  generated_at: string
  goals_evaluated: number
  off_track: number
  actions_planned: number
  tasks_enqueued: number
  notifications_sent: number
  enqueue_errors: number
  actions: PlannedAction[]
}
