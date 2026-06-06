/**
 * Lightweight token estimator. Anthropic / OpenAI both average ~4
 * characters per token for English text. We use that everywhere
 * instead of pulling in `tiktoken` or `@anthropic-ai/tokenizer` —
 * the budget arithmetic only needs to be roughly right.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0
  // Treat code blocks slightly higher (~3 chars/token) since we ship
  // a lot of structured JSON-ish previews through the prelude.
  return Math.ceil(text.length / 3.8)
}
