/**
 * Compression stage. Two paths:
 *
 *   1. Sliding-window summarisation — when a ContextSummariser is wired
 *      and the prelude is over the trigger, the summariser receives
 *      the LONGER half of the prelude (everything except the most
 *      recent signal block) and returns a compressed summary.
 *
 *   2. No-summariser fallback — truncate to the trigger size, prefer
 *      keeping the most recent block (signals + top memory) intact.
 *
 * Both paths leave a "(compressed: original=X tokens, kept=Y)" marker
 * so the operator and the agent both know context was squeezed.
 */

import type {
  ContextConfig,
  ContextSummariser,
} from '../types.js'
import { estimateTokens } from '../tokens.js'

export interface CompressInput {
  prelude: string
  config: ContextConfig
  summariser?: ContextSummariser
  signal?: AbortSignal
}

export interface CompressOutput {
  prelude: string
  /** True when any compression happened. */
  compressed: boolean
  originalTokens: number
  finalTokens: number
  /** Token usage from the summariser call itself. */
  summariserUsage?: { inputTokens: number; outputTokens: number; name: string }
}

export async function compressIfNeeded(
  input: CompressInput,
): Promise<CompressOutput> {
  const original = estimateTokens(input.prelude)
  if (original <= input.config.compressionTrigger) {
    return {
      prelude: input.prelude,
      compressed: false,
      originalTokens: original,
      finalTokens: original,
    }
  }

  // ── Split into head (older context) and tail (most-recent block) ──
  // We keep the LAST `keepTailTokens` tokens of context intact because
  // they're closest to the live signal block; the head gets summarised.
  const tail = sliceTokens(input.prelude, Math.floor(input.config.preludeTokenCap * 0.4))
  const head = input.prelude.slice(0, input.prelude.length - tail.length)

  if (input.summariser) {
    try {
      const targetTokens = Math.max(
        500,
        Math.floor(input.config.preludeTokenCap - estimateTokens(tail) - 200),
      )
      const { text, inputTokens, outputTokens } = await Promise.race([
        input.summariser.summarise({
          text: head,
          targetTokens,
          signal: input.signal,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`summariser timeout ${input.config.summariseTimeoutMs}ms`)),
            input.config.summariseTimeoutMs,
          ),
        ),
      ])
      const compressed =
        `--- compressed context (original≈${original} tokens) ---\n` +
        text.trim() +
        `\n--- end compressed ---\n` +
        tail
      return {
        prelude: compressed,
        compressed: true,
        originalTokens: original,
        finalTokens: estimateTokens(compressed),
        summariserUsage: { inputTokens, outputTokens, name: input.summariser.name },
      }
    } catch {
      // fall through to truncate
    }
  }

  // ── Fallback: truncate head to fit cap ──
  const headBudget = Math.max(
    400,
    Math.floor(input.config.preludeTokenCap - estimateTokens(tail) - 200),
  )
  const truncatedHead =
    `--- truncated context (original head≈${estimateTokens(head)} tokens, kept≈${headBudget}) ---\n` +
    sliceTokens(head, headBudget) +
    `\n--- end truncated ---\n`
  const prelude = truncatedHead + tail
  return {
    prelude,
    compressed: true,
    originalTokens: original,
    finalTokens: estimateTokens(prelude),
  }
}

/** Approximate token-aware slice from the END of a string. */
function sliceTokens(s: string, tokens: number): string {
  // ~4 chars per token approximation
  const chars = tokens * 4
  if (s.length <= chars) return s
  return s.slice(s.length - chars)
}
