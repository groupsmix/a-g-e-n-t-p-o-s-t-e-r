/**
 * Per-task pre-flight cost estimator. Each AgentTaskType has a
 * rough token profile baked in here. These are deliberately broad
 * brushes: the goal isn't accounting precision, it's catching tasks
 * that would breach a daily cap before they spend a cent.
 *
 * Callers can override the profile per-call by passing
 * { input_tokens, output_tokens } in opts.
 */

import { getModel, listModels, priceCall } from './models'
import type { CostEstimate, ModelInfo } from '../types'

interface Profile {
  input_tokens: number
  output_tokens: number
  default_model: string
}

const TASK_PROFILES: Record<string, Profile> = {
  research:           { input_tokens: 12_000, output_tokens: 3_000, default_model: 'claude-sonnet-4-20250514' },
  write:              { input_tokens: 4_000,  output_tokens: 1_500, default_model: 'claude-sonnet-4-20250514' },
  'build-app':        { input_tokens: 30_000, output_tokens: 8_000, default_model: 'claude-sonnet-4-20250514' },
  'build-site':       { input_tokens: 8_000,  output_tokens: 4_000, default_model: 'claude-sonnet-4-20250514' },
  publish:            { input_tokens: 600,    output_tokens: 200,   default_model: 'claude-haiku-3.5' },
  analyse:            { input_tokens: 6_000,  output_tokens: 1_500, default_model: 'claude-sonnet-4-20250514' },
  'generate-video':   { input_tokens: 2_000,  output_tokens: 1_000, default_model: 'flux-dev' },
  'generate-image':   { input_tokens: 200,    output_tokens: 100,   default_model: 'flux-schnell' },
  'lead-scrape':      { input_tokens: 1_500,  output_tokens: 500,   default_model: 'claude-haiku-3.5' },
  'email-campaign':   { input_tokens: 2_000,  output_tokens: 800,   default_model: 'claude-sonnet-4-20250514' },
  'financial-analysis': { input_tokens: 8_000, output_tokens: 2_000, default_model: 'claude-sonnet-4-20250514' },
  'brand-monitor':    { input_tokens: 3_000,  output_tokens: 800,   default_model: 'claude-haiku-3.5' },
  'autonome-run':     { input_tokens: 1_000,  output_tokens: 400,   default_model: 'claude-haiku-3.5' },
  'memory-consolidate': { input_tokens: 4_000, output_tokens: 1_000, default_model: 'claude-haiku-3.5' },
}

const FALLBACK_PROFILE: Profile = {
  input_tokens: 2_000,
  output_tokens: 800,
  default_model: 'claude-sonnet-4-20250514',
}

export interface EstimateOpts {
  task_type: string
  model?: string
  input_tokens?: number
  output_tokens?: number
}

export function estimateCost(opts: EstimateOpts): CostEstimate {
  const profile = TASK_PROFILES[opts.task_type] ?? FALLBACK_PROFILE
  const modelId = opts.model ?? profile.default_model
  const model: ModelInfo = getModel(modelId) ?? listModels()[1]!
  const input = opts.input_tokens ?? profile.input_tokens
  const output = opts.output_tokens ?? profile.output_tokens
  const usd = priceCall(model, input, output)
  return {
    task_type: opts.task_type,
    model,
    est_input_tokens: input,
    est_output_tokens: output,
    est_usd: usd,
    rationale: `~${input.toLocaleString()} in / ${output.toLocaleString()} out tokens on ${model.id}`,
  }
}
