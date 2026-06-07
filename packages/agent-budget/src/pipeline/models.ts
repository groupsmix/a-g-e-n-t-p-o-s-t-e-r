/**
 * Default model catalogue. Prices are an approximation captured in
 * mid-2026 — they are intentionally on the conservative (higher) side
 * so the guard fails-safe. Callers can override via setModels().
 *
 * The catalogue is the only place that needs editing when a new
 * model lands; everything else infers behaviour from tier +
 * quality_score.
 */

import type { ModelInfo } from '../types'

export const DEFAULT_MODELS: ModelInfo[] = [
  { id: 'claude-haiku-3.5',    tier: 'mini',     input_per_1k: 0.001, output_per_1k: 0.005, quality_score: 60 },
  { id: 'claude-sonnet-4-20250514', tier: 'standard', input_per_1k: 0.003, output_per_1k: 0.015, quality_score: 90 },
  { id: 'claude-opus-4',       tier: 'premium',  input_per_1k: 0.015, output_per_1k: 0.075, quality_score: 100 },
  { id: 'gpt-4o-mini',         tier: 'mini',     input_per_1k: 0.00015, output_per_1k: 0.0006, quality_score: 55 },
  { id: 'gpt-4o',              tier: 'standard', input_per_1k: 0.005,  output_per_1k: 0.015,  quality_score: 85 },
  { id: 'flux-schnell',        tier: 'mini',     input_per_1k: 0,      output_per_1k: 0,      flat_request: 0.003, quality_score: 50 },
  { id: 'flux-dev',            tier: 'standard', input_per_1k: 0,      output_per_1k: 0,      flat_request: 0.025, quality_score: 75 },
]

let registry = DEFAULT_MODELS.slice()

export function setModels(m: ModelInfo[]): void {
  registry = m.slice()
}

export function listModels(): ModelInfo[] {
  return registry.slice()
}

export function getModel(id: string): ModelInfo | undefined {
  return registry.find((m) => m.id === id)
}

/**
 * Estimate cost for a single call.
 * `flat_request` is summed in addition to token cost (covers image
 * gen, embedding flat fees, etc.).
 */
export function priceCall(model: ModelInfo, inputTokens: number, outputTokens: number): number {
  const t = (inputTokens / 1000) * model.input_per_1k + (outputTokens / 1000) * model.output_per_1k
  return t + (model.flat_request ?? 0)
}
