/**
 * @posteragent/agent-content-planner
 *
 * TASK-600 — Content Planner.  Composes signals from trends, brand
 * monitor, research and past winners into a 7-day publishing calendar.
 */

export * from './pipeline/index.js'
export { createContentPlannerHandler } from './handler.js'
export type {
  ContentPlannerPayload,
  ContentPlannerHandlerDeps,
  ContentPlannerHandlerOutcome,
} from './handler.js'
export type {
  Platform,
  Signal,
  BrandProfile,
  ContentIdea,
  ScheduledPost,
  ContentCalendar,
  LLMClient,
  SignalSource,
} from './types.js'
