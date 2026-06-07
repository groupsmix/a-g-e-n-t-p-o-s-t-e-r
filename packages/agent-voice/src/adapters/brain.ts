/**
 * AnthropicBrain — minimal Claude call shaped for short voice replies.
 * Keeps responses tight (max_tokens 220) and steers tone toward
 * spoken English (no markdown, no bullet lists).
 */

import type { Brain, BrainReply, BrainTurn } from '../types'

export interface AnthropicBrainConfig {
  apiKey: string
  model?: string
  baseUrl?: string
}

export class AnthropicBrain implements Brain {
  constructor(private cfg: AnthropicBrainConfig, private fetcher: typeof fetch = fetch) {}
  async reply(turn: BrainTurn): Promise<BrainReply> {
    const base = (this.cfg.baseUrl ?? 'https://api.anthropic.com').replace(/\/$/, '')
    const system = [
      "You're a voice assistant. Reply in spoken English — no markdown, no lists, no headings.",
      "Keep it under two short sentences unless asked for detail.",
      turn.context ? `Context:\n${turn.context}` : '',
    ].filter(Boolean).join('\n\n')
    const res = await this.fetcher(`${base}/v1/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': this.cfg.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.cfg.model ?? 'claude-sonnet-4-20250514',
        max_tokens: 220,
        system,
        messages: [{ role: 'user', content: turn.user_text }],
      }),
    })
    if (!res.ok) throw new Error(`anthropic ${res.status}`)
    const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> }
    const text = (json.content ?? [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text ?? '')
      .join(' ')
      .trim()
    return { text: text || 'Okay.' }
  }
}
