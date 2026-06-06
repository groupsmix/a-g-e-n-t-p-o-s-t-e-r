/**
 * Anthropic Claude sentiment classifier.
 *
 * Sends one batched prompt with up to N mentions and asks Claude to
 * return strict JSON of { id: { label, confidence, rationale } }.
 *
 * Strict JSON output is enforced with a fixed schema in the system
 * prompt + a `response_format`-style "JSON only" instruction. Failures
 * fall through to the scorer's heuristic fallback.
 */

import type { SentimentLabel, SentimentScore, SentimentScorer } from '../types.js'

export interface AnthropicSentimentOptions {
  apiKey: string
  baseUrl?: string
  model?: string
  /** Max mentions per LLM call. Default 30. */
  batchSize?: number
  fetch?: typeof fetch
}

export function createAnthropicSentiment(
  opts: AnthropicSentimentOptions,
): SentimentScorer {
  const baseUrl = opts.baseUrl ?? 'https://api.anthropic.com'
  const f = opts.fetch ?? globalThis.fetch
  const model = opts.model ?? 'claude-haiku-4-5'
  const batchSize = opts.batchSize ?? 30

  return {
    name: 'anthropic',
    async score(input) {
      const result: Record<string, SentimentScore> = {}
      const brandList = input.brand?.join(', ') ?? 'the brand'

      for (let i = 0; i < input.mentions.length; i += batchSize) {
        const batch = input.mentions.slice(i, i + batchSize)
        const compact = batch.map((m) => ({
          id: m.id,
          title: m.title.slice(0, 200),
          text: m.text.slice(0, 800),
        }))

        const system =
          `You are a sentiment classifier focused on brand-monitoring. ` +
          `For each mention, return strict JSON keyed by id. Each value is ` +
          `{ label: "positive" | "neutral" | "negative", confidence: 0..1, rationale: short string }. ` +
          `Score sentiment toward ${brandList}, not the overall mention. ` +
          `Output JSON only, no markdown fence, no extra prose.`

        const user =
          `Classify these ${compact.length} mentions:\n\n` +
          JSON.stringify(compact, null, 2)

        try {
          const res = await f(`${baseUrl}/v1/messages`, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-api-key': opts.apiKey,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model,
              max_tokens: 2048,
              system,
              messages: [{ role: 'user', content: user }],
            }),
            signal: input.signal,
          })
          if (!res.ok) continue
          const json = (await res.json()) as AnthropicResponse
          const text = json.content?.[0]?.text ?? ''
          const parsed = parseJsonLoose(text)
          if (!parsed) continue
          for (const [id, raw] of Object.entries(parsed)) {
            if (!raw || typeof raw !== 'object') continue
            const r = raw as Record<string, unknown>
            const label = normaliseLabel(r.label)
            if (!label) continue
            result[id] = {
              label,
              confidence: clamp01(Number(r.confidence ?? 0.6)),
              rationale: typeof r.rationale === 'string' ? r.rationale : undefined,
            }
          }
        } catch {
          // skip batch
        }
      }
      return result
    },
  }
}

function normaliseLabel(v: unknown): SentimentLabel | undefined {
  if (typeof v !== 'string') return undefined
  const s = v.toLowerCase().trim()
  if (s === 'positive' || s === 'pos' || s === '+') return 'positive'
  if (s === 'negative' || s === 'neg' || s === '-') return 'negative'
  if (s === 'neutral' || s === 'mixed' || s === '0') return 'neutral'
  return undefined
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(1, n))
}

function parseJsonLoose(text: string): Record<string, unknown> | undefined {
  // Strip code fences if Claude returned any despite the system prompt.
  const stripped = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
  try {
    return JSON.parse(stripped) as Record<string, unknown>
  } catch {
    // Try to find the first {...} block.
    const m = stripped.match(/\{[\s\S]*\}/)
    if (!m) return undefined
    try {
      return JSON.parse(m[0]) as Record<string, unknown>
    } catch {
      return undefined
    }
  }
}

interface AnthropicResponse {
  content?: Array<{ text?: string }>
  usage?: { input_tokens?: number; output_tokens?: number }
}
