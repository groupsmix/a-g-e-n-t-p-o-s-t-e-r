/**
 * Default scenarios. Suites are constructed by callers (they need to
 * inject the live agent runner). Here we ship the canonical scenario
 * library so CI imports `defaultScenarios()` and supplies its own
 * runners.
 *
 * Adding a new scenario:
 *   1. Pick the agent id (must match the registered runner).
 *   2. Give it a stable scenario.id — that's the regression key.
 *   3. Compose assertions from the helpers in '../pipeline'.
 */

import {
  containsAll, containsText, matchesRegex, notHallucinated,
  shapeMatches, shorterThan,
} from '../pipeline/assertions'
import type { Scenario } from '../types'

export function defaultScenarios(): Scenario[] {
  return [
    {
      id: 'writer-x-launch',
      agent: 'writer',
      description: 'X post for a product launch, must be punchy + on-brand.',
      input: { platform: 'x', topic: 'Launching PosterAgent', tone: 'confident' },
      assertions: [
        shorterThan(280, 0.3),
        containsText('posteragent', 0.3),
        notHallucinated(['lorem', 'TODO'], 0.2),
        matchesRegex(/[!.?]$/, 0.2),
      ],
    },
    {
      id: 'lead-scrape-hot-only',
      agent: 'lead-scrape',
      input: { keywords: ['need help with x ghostwriter'], min_intent: 'hot' },
      assertions: [
        shapeMatches({ leads: 'object' }, 0.4),
        containsText('hot', 0.3),
        notHallucinated(['spam', 'broken'], 0.3),
      ],
    },
    {
      id: 'analyser-trend-rising',
      agent: 'analytics',
      input: { platform: 'x', window: 'week' },
      assertions: [
        shapeMatches({ trend: 'string' }, 0.5),
        containsAll(['rising', 'falling', 'flat'], 0.5),
      ],
    },
    {
      id: 'budget-haiku-suggested',
      agent: 'budget',
      input: { task_type: 'write', model: 'claude-opus-4', cap_remaining_usd: 0.001 },
      assertions: [
        shapeMatches({ suggested_model: 'object' }, 0.6),
        containsText('haiku', 0.4),
      ],
    },
    {
      id: 'autonome-skips-when-on-track',
      agent: 'autonome',
      input: { goals: [{ id: 'g1', target: 5, achieved: 6 }] },
      assertions: [
        shapeMatches({ tasks_enqueued: 'number' }, 0.5),
        notHallucinated(['queued'], 0.5),
      ],
    },
    {
      id: 'voice-publish-shortcuts',
      agent: 'voice',
      input: { text: 'publish the next post on linkedin' },
      assertions: [
        containsText('publish.next', 0.5),
        containsText('linkedin', 0.5),
      ],
    },
    {
      id: 'revenue-attribution-utm',
      agent: 'revenue',
      input: { referring_url: 'https://t.co/x?utm_content=launch-99&utm_campaign=spring' },
      assertions: [
        containsText('x', 0.4),
        containsText('launch-99', 0.4),
        containsText('spring', 0.2),
      ],
    },
  ]
}
