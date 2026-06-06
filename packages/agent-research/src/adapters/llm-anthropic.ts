/**
 * Anthropic Claude adapter for the LLMClient interface.
 *
 * Uses the public Messages API (POST /v1/messages).  No SDK dep — the
 * payload is small and stable, and pulling @anthropic-ai/sdk into a
 * Worker runtime is more work than it saves.
 *
 * Default model is Claude 4.5 Sonnet (current planner-class workhorse
 * as of June 2026).  Override per call via `model` option.
 */

import type { LLMClient, LLMMessage } from '../types.js'

export interface AnthropicAdapterOptions {
  apiKey: string
  defaultModel?: string
  /** Override the API base for testing or proxying. */
  baseUrl?: string
  /** Inject fetch — defaults to globalThis.fetch. */
  fetch?: typeof fetch
}

export function createAnthropicLLM(opts: AnthropicAdapterOptions): LLMClient {
  const defaultModel = opts.defaultModel ?? 'claude-sonnet-4-5-20250929'
  const baseUrl = opts.baseUrl ?? 'https://api.anthropic.com'
  const f = opts.fetch ?? globalThis.fetch

  return {
    name: 'anthropic',
    async complete(input) {
      const { systemMessages, conversation } = splitSystem(input.messages)
      const body = {
        model: input.model ?? defaultModel,
        max_tokens: input.maxTokens ?? 1024,
        temperature: input.temperature,
        system: systemMessages.length > 0 ? systemMessages.join('\n\n') : undefined,
        messages: conversation.map((m) => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content,
        })),
      }
      const res = await f(`${baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': opts.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
        signal: input.signal,
      })
      if (!res.ok) {
        const err = await res.text().catch(() => res.statusText)
        throw new Error(`anthropic ${res.status}: ${err.slice(0, 300)}`)
      }
      const json = (await res.json()) as AnthropicResponse
      const text = (json.content ?? [])
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('')
      return {
        text,
        model: json.model ?? body.model,
        usage: {
          inputTokens: json.usage?.input_tokens ?? 0,
          outputTokens: json.usage?.output_tokens ?? 0,
        },
      }
    },
  }
}

interface AnthropicResponse {
  model?: string
  content?: Array<{ type: string; text: string }>
  usage?: { input_tokens: number; output_tokens: number }
}

function splitSystem(messages: LLMMessage[]): {
  systemMessages: string[]
  conversation: LLMMessage[]
} {
  const systemMessages: string[] = []
  const conversation: LLMMessage[] = []
  for (const m of messages) {
    if (m.role === 'system') systemMessages.push(m.content)
    else conversation.push(m)
  }
  return { systemMessages, conversation }
}
