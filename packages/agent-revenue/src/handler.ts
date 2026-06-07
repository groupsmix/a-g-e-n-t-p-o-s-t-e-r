/**
 * Handler entry — drives a single revenue collection tick. Piggy-backs
 * on AgentTaskType using payload.kind='revenue-tick'.
 */

import { runRevenueOnce } from './pipeline/run'
import type { RevenueAdapter, RevenueRunResult, RevenueStore } from './types'

export interface RevenueHandlerInput {
  adapters: RevenueAdapter[]
  store: RevenueStore
  now?: () => Date
}

export async function handleRevenueTask(
  input: RevenueHandlerInput,
): Promise<RevenueRunResult> {
  return runRevenueOnce(input)
}
