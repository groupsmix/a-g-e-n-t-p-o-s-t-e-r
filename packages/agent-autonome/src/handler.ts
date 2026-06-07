/**
 * Handler — registers under AgentTaskType 'autonome-run'. Drives one
 * tick of the Autonome loop with explicit sources so the orchestrator,
 * tests, and the hourly cron can all share the same code path.
 */

import { runAutonome } from './pipeline/loop'
import type {
  AutonomeConfig,
  AutonomeRunResult,
  GoalSource,
  NotificationSink,
  AutonomePlanner,
  ProgressSource,
  TaskEnqueuer,
} from './types'

export interface AutonomeHandlerInput {
  goals: GoalSource
  progress: ProgressSource
  planner: AutonomePlanner
  enqueuer: TaskEnqueuer
  notifier?: NotificationSink
  config?: AutonomeConfig
  now?: () => Date
}

export async function runAutonomeOnce(
  input: AutonomeHandlerInput,
): Promise<AutonomeRunResult> {
  return runAutonome(input)
}
