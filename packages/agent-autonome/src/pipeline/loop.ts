/**
 * The hourly Autonome loop.
 *
 *   1. List goals.
 *   2. For each enabled goal, read progress.
 *   3. If off-track, ask the planner for actions.
 *   4. Take the highest-impact actions until maxTasksPerRun is reached.
 *   5. Enqueue them. Notify the human about the most important state
 *      changes.
 *
 * The loop is intentionally single-pass and stateless beyond its
 * inputs: callers wire in their own cooldown store (e.g. an extra
 * key in the settings table) by filtering goals before they reach
 * `runAutonome`. We deliberately don't bake persistence into this
 * module so it stays trivially testable.
 */

import type {
  AutonomeConfig,
  AutonomeRunResult,
  Goal,
  GoalSource,
  NotificationSink,
  PlannedAction,
  ProgressSource,
  AutonomePlanner,
  TaskEnqueuer,
  Notification,
  ProgressReading,
} from '../types'

export interface AutonomeInput {
  goals: GoalSource
  progress: ProgressSource
  planner: AutonomePlanner
  enqueuer: TaskEnqueuer
  notifier?: NotificationSink
  config?: AutonomeConfig
  now?: () => Date
}

export async function runAutonome(input: AutonomeInput): Promise<AutonomeRunResult> {
  const now = input.now?.() ?? new Date()
  const cfg = input.config ?? {}
  const maxTasks = cfg.maxTasksPerRun ?? 5

  const all = await input.goals.list()
  const enabled = all.filter((g) => g.enabled)

  const result: AutonomeRunResult = {
    generated_at: now.toISOString(),
    goals_evaluated: enabled.length,
    off_track: 0,
    actions_planned: 0,
    tasks_enqueued: 0,
    notifications_sent: 0,
    enqueue_errors: 0,
    actions: [],
  }

  // Score each goal's urgency (lower ratio = more urgent). Tie-break by tags
  // present so 'publish' / 'lead' goals beat custom ones when equal.
  const readings: Array<{ goal: Goal; reading: ProgressReading }> = []
  for (const goal of enabled) {
    try {
      const r = await input.progress.readingFor(goal, now)
      readings.push({ goal, reading: r })
    } catch {
      /* swallow; a bad metric source can't tank the run */
    }
  }
  readings.sort((a, b) => a.reading.ratio - b.reading.ratio)

  // Plan actions for off-track goals.
  const planned: PlannedAction[] = []
  for (const { goal, reading } of readings) {
    if (reading.status === 'on-track' || reading.status === 'ahead') continue
    result.off_track += 1
    try {
      const actions = await input.planner.plan(goal, reading)
      planned.push(...actions)
    } catch {
      /* planner errors don't stop the loop */
    }
    if (planned.length >= maxTasks * 2) break // soft early exit
  }

  result.actions_planned = planned.length
  const toEnqueue = planned.slice(0, maxTasks)

  for (const action of toEnqueue) {
    try {
      const out = await input.enqueuer.enqueue(action)
      if (out) {
        result.tasks_enqueued += 1
        result.actions.push(action)
      } else {
        result.enqueue_errors += 1
      }
    } catch {
      result.enqueue_errors += 1
    }
  }

  // Notify
  if (input.notifier) {
    const notifications: Notification[] = []
    for (const { goal, reading } of readings) {
      if (reading.status === 'blocked') {
        notifications.push({
          kind: 'blocked',
          title: `Blocked: ${goal.title}`,
          body: `Achieved ${reading.achieved}/${reading.target} (${Math.round(reading.ratio * 100)}%) — looks blocked.`,
          goal_id: goal.id,
          at: now.toISOString(),
        })
      } else if (reading.status === 'off-track') {
        notifications.push({
          kind: 'off-track',
          title: `Off-track: ${goal.title}`,
          body: `${reading.achieved}/${reading.target} (${Math.round(reading.ratio * 100)}%).`,
          goal_id: goal.id,
          at: now.toISOString(),
        })
      } else if (reading.status === 'ahead' && reading.ratio >= 1.5) {
        notifications.push({
          kind: 'milestone',
          title: `Ahead of plan: ${goal.title}`,
          body: `${reading.achieved}/${reading.target} (${Math.round(reading.ratio * 100)}%). Nice.`,
          goal_id: goal.id,
          at: now.toISOString(),
        })
      }
    }
    // Always send a single summary so the dashboard has a heartbeat.
    notifications.push({
      kind: 'summary',
      title: 'Autonome tick',
      body: `Evaluated ${result.goals_evaluated} goals, queued ${result.tasks_enqueued} tasks.`,
      at: now.toISOString(),
    })
    for (const n of notifications) {
      try {
        await input.notifier.notify(n)
        result.notifications_sent += 1
      } catch {
        /* drop notification failures silently */
      }
    }
  }

  return result
}
