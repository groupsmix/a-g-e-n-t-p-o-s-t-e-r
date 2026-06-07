/**
 * Anthropic Messages API adapter — shared LLMClient wrapper.
 * Same shape as the one in agent-research / agent-brand-monitor.
 */

import type { LLMClient } from '../types.js'

export interface AnthropicConfig {
  apiKey: string
  model?: string
  baseUrl?: string
  fetch?: typeof fetch
}

interface MessagesResponse {
  content?: Array<{ type: string; text?: string }>
  usage?: { input_tokens?: number; output_tokens?: number }
  error?: { message?: string }
}

export function createAnthropicLLM(config: AnthropicConfig): LLMClient {
  const f = config.fetch ?? fetch
  const base = (config.baseUrl ?? 'https://api.anthropic.com').replace(/\/$/, '')
  const model = config.model ?? 'claude-3-5-sonnet-20241022'
  return {
    async complete({ system, messages, maxTokens = 1024, temperature = 0.4, json }) {
      const sys = json
        ? `${system ?? ''}\n\nReply with ONLY a JSON object.`
        : system
      const res = await f(`${base}/v1/messages`, {
        method: 'POST',
        headers: {
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          temperature,
          system: sys,
          messages,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as MessagesResponse
      if (!res.ok || data.error) {
        throw new Error(data.error?.message ?? `Anthropic HTTP ${res.status}`)
      }
      const content = (data.content ?? [])
        .map((b) => (b.type === 'text' ? b.text ?? '' : ''))
        .join('')
      return {
        content,
        inputTokens: data.usage?.input_tokens,
        outputTokens: data.usage?.output_tokens,
      }
    },
  }
}
