/**
 * Handler — registers under AgentTaskType using payload.kind. Two
 * actions:
 *   { kind: 'budget-estimate', task_type, model? }   → estimate only
 *   { kind: 'budget-approve',  task_type, model? }   → run guard
 */

import { BudgetGuard } from './pipeline/guard'
import { estimateCost } from './pipeline/estimate'
import type { BudgetDecision, BudgetStore, CostEstimate } from './types'

export async function handleBudgetTask(args: {
  payload: { kind: 'budget-estimate' | 'budget-approve'; task_type: string; model?: string; input_tokens?: number; output_tokens?: number }
  store: BudgetStore
}): Promise<CostEstimate | BudgetDecision> {
  if (args.payload.kind === 'budget-estimate') {
    return estimateCost(args.payload)
  }
  const guard = new BudgetGuard({ store: args.store })
  return guard.approve(args.payload)
}
