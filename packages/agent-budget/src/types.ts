/**
 * Budget guard contracts (TASK-902).
 *
 * Three jobs:
 *   1. ESTIMATE the cost of a task before it runs (estimateCost).
 *   2. ENFORCE per-period caps (canSpend / approve / overspendFor).
 *   3. SUGGEST a cheaper model when an estimate would breach a cap.
 *
 * Caps live in a key/value Settings shape so they can be toggled at
 * runtime from the dashboard. Usage is logged per-call so the dash
 * can show breakdowns by model / task_type / day.
 */

import type { AgentTaskType } from '@posteragent/types'

export type ModelTier = 'mini' | 'standard' | 'premium'

export interface ModelInfo {
  id: string
  tier: ModelTier
  /** USD per 1K input tokens. */
  input_per_1k: number
  /** USD per 1K output tokens. */
  output_per_1k: number
  /** Approximate per-request flat cost (e.g. image generation). */
  flat_request?: number
  /** Higher tier = better quality. Used to rank fallbacks. */
  quality_score: number
}

export interface CostEstimate {
  task_type: AgentTaskType | string
  model: ModelInfo
  est_input_tokens: number
  est_output_tokens: number
  est_usd: number
  rationale: string
}

export type CapPeriod = 'day' | 'week' | 'month'

export interface BudgetCap {
  /** Scope this cap applies to. 'global' covers everything. */
  scope: 'global' | 'task_type' | 'model'
  /** When scope is 'task_type' or 'model', the value to match. */
  match?: string
  period: CapPeriod
  limit_usd: number
  /** Optional soft threshold (0-1). At >= threshold we suggest cheaper. */
  warn_at?: number
  enabled: boolean
}

export interface UsageRecord {
  task_id: string
  task_type: string
  model: string
  input_tokens: number
  output_tokens: number
  cost_usd: number
  occurred_at: string
}

export interface BudgetDecision {
  allowed: boolean
  estimate: CostEstimate
  /** If !allowed or warned, suggest dropping to this model. */
  suggested_model?: ModelInfo
  /** Cap that triggered the block / warning, if any. */
  breached_cap?: BudgetCap
  /** Remaining budget under the most relevant cap, USD. */
  remaining_usd?: number
  notes: string[]
}

export interface BudgetStore {
  caps(): Promise<BudgetCap[]>
  setCap(cap: BudgetCap): Promise<void>
  /** Sum of cost_usd within the cap's period. */
  spendIn(scope: BudgetCap['scope'], match: string | undefined, period: CapPeriod): Promise<number>
  recordUsage(u: UsageRecord): Promise<void>
  listUsage(opts: { since: string; until: string; model?: string; task_type?: string }): Promise<UsageRecord[]>
}
