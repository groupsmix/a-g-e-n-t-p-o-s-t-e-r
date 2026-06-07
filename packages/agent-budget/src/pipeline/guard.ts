/**
 * Budget guard — checks an estimate against active caps, and offers
 * a cheaper-model suggestion when the estimate would push past one.
 *
 *   approve(estimate)            → BudgetDecision { allowed, suggested? }
 *   afterRun(actual)             → recordUsage + nothing else; the next
 *                                  approve() reflects the new spend.
 *
 * Selection rule for "cheaper model": same tier or below with the
 * highest quality_score among those that fit the remaining budget.
 * If none fit, we still return the cheapest model so callers can
 * choose to override.
 */

import { estimateCost } from './estimate'
import { listModels, priceCall } from './models'
import type {
  BudgetCap,
  BudgetDecision,
  BudgetStore,
  CostEstimate,
  ModelInfo,
  UsageRecord,
} from '../types'

export interface BudgetGuardInput {
  store: BudgetStore
  now?: () => Date
}

function relevantCaps(caps: BudgetCap[], est: CostEstimate): BudgetCap[] {
  return caps.filter((c) => {
    if (!c.enabled) return false
    if (c.scope === 'global') return true
    if (c.scope === 'task_type') return c.match === est.task_type
    if (c.scope === 'model') return c.match === est.model.id
    return false
  })
}

async function remainingFor(store: BudgetStore, cap: BudgetCap): Promise<number> {
  const spent = await store.spendIn(cap.scope, cap.match, cap.period)
  return Math.max(0, cap.limit_usd - spent)
}

function pickCheaper(estimate: CostEstimate, capRemaining: number): ModelInfo | undefined {
  // Try every model and pick the highest-quality one whose estimated
  // cost fits remaining budget. Use the same token profile so we're
  // comparing apples to apples.
  const candidates = listModels()
    .filter((m) => m.id !== estimate.model.id)
    .map((m) => ({ m, usd: priceCall(m, estimate.est_input_tokens, estimate.est_output_tokens) }))
    .filter(({ usd }) => usd < estimate.est_usd)
    .sort((a, b) => b.m.quality_score - a.m.quality_score)
  const fits = candidates.find(({ usd }) => usd <= capRemaining)
  return (fits ?? candidates[0])?.m
}

export class BudgetGuard {
  constructor(private input: BudgetGuardInput) {}

  async approve(args: {
    task_type: string
    model?: string
    input_tokens?: number
    output_tokens?: number
  }): Promise<BudgetDecision> {
    const estimate = estimateCost(args)
    const caps = await this.input.store.caps()
    const relevant = relevantCaps(caps, estimate)
    const notes: string[] = []
    let breached: BudgetCap | undefined
    let mostRelevantRemaining: number | undefined
    for (const cap of relevant) {
      const remaining = await remainingFor(this.input.store, cap)
      if (mostRelevantRemaining === undefined || remaining < mostRelevantRemaining) {
        mostRelevantRemaining = remaining
      }
      if (estimate.est_usd > remaining) {
        breached = cap
        notes.push(
          `Estimate $${estimate.est_usd.toFixed(4)} exceeds ${cap.scope} ${cap.period} cap ` +
            `($${remaining.toFixed(4)} of $${cap.limit_usd.toFixed(2)} remaining).`,
        )
        break
      }
      if (cap.warn_at !== undefined) {
        const spent = cap.limit_usd - remaining
        const ratio = cap.limit_usd > 0 ? spent / cap.limit_usd : 0
        if (ratio >= cap.warn_at) {
          notes.push(
            `${cap.scope} ${cap.period} cap at ${Math.round(ratio * 100)}% — consider downgrading.`,
          )
        }
      }
    }

    let suggested: ModelInfo | undefined
    if (breached || notes.length > 0) {
      suggested = pickCheaper(estimate, mostRelevantRemaining ?? estimate.est_usd)
    }

    return {
      allowed: !breached,
      estimate,
      suggested_model: suggested,
      breached_cap: breached,
      remaining_usd: mostRelevantRemaining,
      notes,
    }
  }

  async afterRun(u: UsageRecord): Promise<void> {
    await this.input.store.recordUsage(u)
  }
}
