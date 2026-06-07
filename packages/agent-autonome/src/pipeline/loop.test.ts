import { describe, it, expect } from 'vitest'
import { runAutonome } from './loop'
import { DefaultPlanner } from './planner'
import type {
  Goal,
  GoalSource,
  NotificationSink,
  PlannedAction,
  ProgressReading,
  ProgressSource,
  TaskEnqueuer,
} from '../types'

function goalSource(goals: Goal[]): GoalSource {
  return { list: async () => goals }
}

function progressFor(map: Record<string, ProgressReading>): ProgressSource {
  return {
    readingFor: async (goal) => {
      const r = map[goal.id]
      if (!r) throw new Error('no reading for ' + goal.id)
      return r
    },
  }
}

function enqueuer(): { calls: PlannedAction[]; impl: TaskEnqueuer } {
  const calls: PlannedAction[] = []
  return {
    calls,
    impl: {
      enqueue: async (a) => {
        calls.push(a)
        return { id: `t-${calls.length}` }
      },
    },
  }
}

function notifier(): { calls: number; impl: NotificationSink } {
  const ref = { calls: 0, impl: { notify: async () => { ref.calls += 1 } } }
  return ref
}

const NOW = new Date('2026-06-07T12:00:00Z')

const G_PUBLISH: Goal = {
  id: 'g-publish',
  title: 'Ship 5 posts/week',
  metric: 'posts_published',
  target: 5,
  period: 'week',
  tags: ['x'],
  enabled: true,
}

describe('runAutonome', () => {
  it('queues a write action when a publish goal is off-track', async () => {
    const eq = enqueuer()
    const r = await runAutonome({
      goals: goalSource([G_PUBLISH]),
      progress: progressFor({
        'g-publish': {
          goal_id: 'g-publish',
          window_start: '',
          window_end: '',
          achieved: 1,
          target: 5,
          ratio: 0.2,
          status: 'off-track',
        },
      }),
      planner: new DefaultPlanner(),
      enqueuer: eq.impl,
      now: () => NOW,
    })
    expect(r.off_track).toBe(1)
    expect(r.tasks_enqueued).toBe(1)
    expect(eq.calls[0]!.task_type).toBe('write')
    expect(eq.calls[0]!.payload.platform).toBe('x')
  })

  it('respects maxTasksPerRun', async () => {
    const eq = enqueuer()
    const goals: Goal[] = Array.from({ length: 8 }, (_, i) => ({
      ...G_PUBLISH,
      id: `g-${i}`,
      title: `Ship ${i}`,
    }))
    const readings = Object.fromEntries(
      goals.map((g) => [
        g.id,
        {
          goal_id: g.id,
          window_start: '',
          window_end: '',
          achieved: 0,
          target: 5,
          ratio: 0,
          status: 'off-track' as const,
        },
      ]),
    )
    const r = await runAutonome({
      goals: goalSource(goals),
      progress: progressFor(readings),
      planner: new DefaultPlanner(),
      enqueuer: eq.impl,
      config: { maxTasksPerRun: 3 },
      now: () => NOW,
    })
    expect(r.tasks_enqueued).toBe(3)
  })

  it('skips on-track goals', async () => {
    const eq = enqueuer()
    const r = await runAutonome({
      goals: goalSource([G_PUBLISH]),
      progress: progressFor({
        'g-publish': {
          goal_id: 'g-publish',
          window_start: '',
          window_end: '',
          achieved: 6,
          target: 5,
          ratio: 1.2,
          status: 'on-track',
        },
      }),
      planner: new DefaultPlanner(),
      enqueuer: eq.impl,
      now: () => NOW,
    })
    expect(r.off_track).toBe(0)
    expect(r.tasks_enqueued).toBe(0)
  })

  it('sorts most-urgent goals first', async () => {
    const eq = enqueuer()
    const urgent: Goal = { ...G_PUBLISH, id: 'urgent', title: 'Urgent', tags: ['linkedin'] }
    const mild: Goal = { ...G_PUBLISH, id: 'mild', title: 'Mild', tags: ['blog'] }
    await runAutonome({
      goals: goalSource([mild, urgent]),
      progress: progressFor({
        urgent: { goal_id: 'urgent', window_start: '', window_end: '', achieved: 0, target: 5, ratio: 0, status: 'blocked' },
        mild:   { goal_id: 'mild',   window_start: '', window_end: '', achieved: 3, target: 5, ratio: 0.6, status: 'off-track' },
      }),
      planner: new DefaultPlanner(),
      enqueuer: eq.impl,
      config: { maxTasksPerRun: 1 },
      now: () => NOW,
    })
    // urgent should win the single slot
    expect(eq.calls[0]!.goal_id).toBe('urgent')
  })

  it('notifies the human about off-track + summary at minimum', async () => {
    const eq = enqueuer()
    const not = notifier()
    await runAutonome({
      goals: goalSource([G_PUBLISH]),
      progress: progressFor({
        'g-publish': {
          goal_id: 'g-publish',
          window_start: '',
          window_end: '',
          achieved: 1,
          target: 5,
          ratio: 0.2,
          status: 'off-track',
        },
      }),
      planner: new DefaultPlanner(),
      enqueuer: eq.impl,
      notifier: not.impl,
      now: () => NOW,
    })
    // off-track + summary
    expect(not.calls).toBeGreaterThanOrEqual(2)
  })

  it('records enqueue_errors when the enqueuer returns null', async () => {
    const r = await runAutonome({
      goals: goalSource([G_PUBLISH]),
      progress: progressFor({
        'g-publish': {
          goal_id: 'g-publish',
          window_start: '',
          window_end: '',
          achieved: 0,
          target: 5,
          ratio: 0,
          status: 'off-track',
        },
      }),
      planner: new DefaultPlanner(),
      enqueuer: { enqueue: async () => null },
      now: () => NOW,
    })
    expect(r.enqueue_errors).toBe(1)
    expect(r.tasks_enqueued).toBe(0)
  })
})
