/**
 * Default planner — maps a GoalMetricKind to a sensible AgentTaskType.
 * Pure data: callers can swap in an LLM-driven planner without
 * touching the loop. We deliberately stay deterministic because the
 * Autonome cron runs every hour and a flaky model would queue garbage
 * for a long time before anyone noticed.
 *
 * The plan output respects goal.tags — e.g. a publish goal tagged
 * with 'x' will queue a Writer task with payload.platform='x'.
 */

import type {
  AutonomePlanner,
  Goal,
  PlannedAction,
  ProgressReading,
} from '../types'

function gap(reading: ProgressReading): number {
  return Math.max(0, Math.ceil(reading.target - reading.achieved))
}

function pickFirstTag(tags: string[] | undefined, allowed: string[]): string | undefined {
  if (!tags) return undefined
  return tags.find((t) => allowed.includes(t.toLowerCase()))
}

export class DefaultPlanner implements AutonomePlanner {
  async plan(goal: Goal, reading: ProgressReading): Promise<PlannedAction[]> {
    const need = gap(reading)
    if (need === 0) return []
    switch (goal.metric) {
      case 'posts_published': {
        const platform = pickFirstTag(goal.tags, [
          'x', 'linkedin', 'instagram', 'tiktok', 'youtube', 'newsletter', 'blog',
        ]) ?? 'x'
        // We queue one Writer task; the publisher chains the post itself.
        return [
          {
            goal_id: goal.id,
            task_type: 'write',
            payload: {
              kind: 'auto-post',
              platform,
              count: Math.min(need, 3),
              reason: `Goal ${goal.id} ${reading.achieved}/${reading.target}`,
            },
            reason: `Behind on '${goal.title}' (${reading.achieved}/${reading.target}). Drafting ${Math.min(need, 3)} ${platform} posts.`,
            estimated_cost_usd: 0.02,
          },
        ]
      }
      case 'leads_collected': {
        return [
          {
            goal_id: goal.id,
            task_type: 'lead-scrape',
            payload: { kind: 'lead-scrape', reason: `Goal ${goal.id}` },
            reason: `Behind on '${goal.title}'. Running lead scrape.`,
            estimated_cost_usd: 0.01,
          },
        ]
      }
      case 'revenue_usd': {
        return [
          {
            goal_id: goal.id,
            task_type: 'email-campaign',
            payload: {
              kind: 'cold-sequence-kick',
              reason: `Goal ${goal.id} revenue behind ($${reading.achieved}/${reading.target})`,
            },
            reason: `Revenue behind on '${goal.title}'. Kicking off cold sequence.`,
            estimated_cost_usd: 0.03,
          },
        ]
      }
      case 'products_shipped': {
        return [
          {
            goal_id: goal.id,
            task_type: 'build-app',
            payload: { kind: 'product-spike', reason: `Goal ${goal.id}` },
            reason: `Behind on '${goal.title}'. Spiking a new product candidate.`,
            estimated_cost_usd: 0.15,
          },
        ]
      }
      case 'tasks_completed':
      case 'engagement_rate':
      case 'custom':
      default:
        // For these we don't auto-queue work — the planner is honest about
        // not knowing what to do, the loop will mark the goal off-track in
        // the notification and let the human pick the action.
        return []
    }
  }
}
