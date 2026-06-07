/**
 * Anthropic Claude adapter for the trend-finder.
 * Mirrors the agent-research adapter — same shape, kept package-local
 * so trend-finder doesn't pull agent-research as a dep.
 */

import type { LLMClient, LLMMessage } from '../types.js'

export interface AnthropicLLMOptions {
  apiKey: string
  baseUrl?: string
  model?: string
  fetch?: typeof fetch
}

export function createAnthropicLLM(opts: AnthropicLLMOptions): LLMClient {
  const baseUrl = opts.baseUrl ?? 'https://api.anthropic.com'
  const f = opts.fetch ?? globalThis.fetch
  const defaultModel = opts.model ?? 'claude-sonnet-4-5'

  return {
    name: 'anthropic',
    async complete(input) {
      const model = input.model ?? defaultModel
      const system = input.messages.find((m) => m.role === 'system')?.content
      const rest = input.messages.filter((m) => m.role !== 'system') as LLMMessage[]
      const res = await f(`${baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': opts.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: input.maxTokens ?? 2048,
          temperature: input.temperature ?? 0.5,
          system,
          messages: rest.map((m) => ({ role: m.role, content: m.content })),
        }),
        signal: input.signal,
      })
      if (!res.ok) {
        const err = await res.text().catch(() => res.statusText)
        throw new Error(`anthropic ${res.status}: ${err.slice(0, 300)}`)
      }
      const json = (await res.json()) as AnthropicResponse
      const text = json.content?.[0]?.text ?? ''
      return {
        text,
        model,
        usage: {
          inputTokens: json.usage?.input_tokens ?? 0,
          outputTokens: json.usage?.output_tokens ?? 0,
        },
      }
    },
  }
}

interface AnthropicResponse {
  content?: Array<{ text?: string }>
  usage?: { input_tokens?: number; output_tokens?: number }
}
