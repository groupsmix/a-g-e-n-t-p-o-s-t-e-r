/**
 * Token → USD cost accounting.  Pricing table is intentionally hard-coded
 * here (not pulled from settings) so cost math is reproducible and
 * auditable from git history alone.  Prices in USD per 1M tokens.
 *
 * Update this table when providers ship new tiers.  Anything not listed
 * defaults to `UNKNOWN_MODEL_PRICE` which is high enough to discourage
 * silent usage of unpriced models.
 */

export interface ModelPricing {
  /** Cost per 1M input tokens (USD). */
  input: number
  /** Cost per 1M output tokens (USD). */
  output: number
}

// Snapshot as of June 2026 — keep aligned with provider docs.
export const MODEL_PRICING: Record<string, ModelPricing> = {
  // Anthropic
  'claude-opus-4-7': { input: 15.0, output: 75.0 },
  'claude-sonnet-4-5': { input: 3.0, output: 15.0 },
  'claude-haiku-4-5': { input: 0.8, output: 4.0 },
  // OpenAI
  'gpt-5': { input: 10.0, output: 40.0 },
  'gpt-5-mini': { input: 0.5, output: 2.0 },
  'gpt-4o': { input: 2.5, output: 10.0 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  // Embeddings
  'text-embedding-3-small': { input: 0.02, output: 0 },
  'text-embedding-3-large': { input: 0.13, output: 0 },
  // Workers AI (priced per neuron — we treat as cheap baseline)
  '@cf/baai/bge-small-en-v1.5': { input: 0.011, output: 0 },
}

export const UNKNOWN_MODEL_PRICE: ModelPricing = { input: 50, output: 100 }

/**
 * Compute USD cost for a token usage event.  Returns 0 if no tokens.
 */
export function estimateCostUsd(
  model: string | undefined,
  inputTokens = 0,
  outputTokens = 0,
): number {
  if (!model || (inputTokens === 0 && outputTokens === 0)) return 0
  const price = MODEL_PRICING[model] ?? UNKNOWN_MODEL_PRICE
  const inUsd = (inputTokens / 1_000_000) * price.input
  const outUsd = (outputTokens / 1_000_000) * price.output
  // Round to 6 decimal places (1e-6 USD = sub-cent precision).
  return Math.round((inUsd + outUsd) * 1_000_000) / 1_000_000
}

/**
 * Pre-flight estimate based on a target output size.  Useful for the
 * dashboard's "estimated cost" preview before a task runs.
 */
export function preflightEstimate(
  model: string,
  estimatedInputTokens: number,
  estimatedOutputTokens: number,
): number {
  return estimateCostUsd(model, estimatedInputTokens, estimatedOutputTokens)
}
