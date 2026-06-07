/**
 * Top-level: gather → rank → schedule.
 */

import type {
  BrandProfile,
  ContentCalendar,
  LLMClient,
  Signal,
  SignalSource,
} from '../types.js'
import { gatherSignals } from './gatherer.js'
import { rankIdeas } from './ranker.js'
import { slotIntoCalendar } from './scheduler.js'

export interface ContentPlannerInput {
  brand: BrandProfile
  /** Pre-fetched signals (bypasses sources). */
  signals?: Signal[]
  /** Sources to fan out across when signals not provided. */
  sources?: SignalSource[]
  /** Window for source.fetch(since). Default 14 days. */
  windowDays?: number
  /** Topics already covered recently — dampens novelty score. */
  recentTopics?: string[]
  /** Anchor for the calendar; default = now. */
  weekStart?: Date
}

export interface ContentPlannerDeps {
  llm?: LLMClient
}

export async function runContentPlanner(
  input: ContentPlannerInput,
  deps: ContentPlannerDeps = {},
): Promise<ContentCalendar> {
  const since = new Date(Date.now() - (input.windowDays ?? 14) * 86_400_000)
  const signals = input.signals ?? (await gatherSignals(input.sources ?? [], since))
  const ideas = await rankIdeas(
    signals,
    input.brand,
    { recentTopics: input.recentTopics },
    deps.llm,
  )
  const { weekStart, schedule } = slotIntoCalendar(input.brand, ideas, input.weekStart)
  return { brand: input.brand, weekStart, ideas, schedule }
}
