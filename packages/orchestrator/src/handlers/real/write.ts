/**
 * Real `write` handler — turns a research report or a raw brief into
 * platform-ready content via an LLM client.
 *
 * Keeps zero hard deps: the LLM client matches the LLMClient shape from
 * `@posteragent/agent-research/types`, so the same Anthropic / OpenAI
 * adapter wired for research is reused here.
 *
 * Payload:
 *   { brief: string,              // free-form instruction
 *     formats?: WriteFormat[],    // default ['blog']
 *     research?: ResearchReport,  // optional — chained from research handler
 *     style?: 'casual'|'authoritative'|'punchy',
 *     model?: string }
 *
 * Output `data` is `{ pieces: { format, title, body, meta }[] }`.
 * Pieces with format=thread / instagram / linkedin are arrays of parts.
 */

import type { LLMClient } from '@posteragent/agent-research'
import type { AgentContext, AgentHandler, HandlerOutcome } from '../../types.js'

export type WriteFormat = 'blog' | 'thread' | 'instagram' | 'linkedin' | 'newsletter' | 'tiktok' | 'youtube_script'

export interface WritePayload {
  brief: string
  formats?: WriteFormat[]
  research?: { findings?: unknown[]; narrative?: string; citations?: Array<{ url: string; title: string }> }
  style?: 'casual' | 'authoritative' | 'punchy'
  model?: string
}

export interface WritePiece {
  format: WriteFormat
  title: string
  /** For multi-part formats (thread, carousel) parts is set instead of body. */
  body?: string
  parts?: string[]
  meta?: Record<string, unknown>
}

export interface WriteHandlerData {
  pieces: WritePiece[]
}

export interface WriteHandlerDeps {
  llm: LLMClient
  /** Default model — overridden by payload.model. */
  defaultModel?: string
  /** Cap on output tokens per piece. */
  maxOutputTokens?: number
}

const FORMAT_INSTRUCTIONS: Record<WriteFormat, string> = {
  blog: 'A 700–1000 word blog post in markdown. H1 title, 3–5 H2 sections, intro hook, conclusion with CTA.',
  thread: 'A 6–10 tweet thread, each tweet <= 270 chars. Hook in tweet 1, payoff in last. Return as JSON array of strings.',
  instagram: 'A carousel script: 7–10 slide texts, each <= 180 chars. Hook on slide 1, CTA on last. Return as JSON array.',
  linkedin: 'A LinkedIn post 1200–1800 chars. First line is the hook (no emoji). Single line breaks between paragraphs. End with one direct question.',
  newsletter: 'A newsletter section: headline + 300–500 word body in markdown. End with one suggested CTA link placeholder ({CTA_URL}).',
  tiktok: 'A 45–60 second TikTok script. Hook (3s), 3 beats, CTA. Plain text, no scene directions.',
  youtube_script: 'A YouTube shorts script (60s). Cold open hook, payload, CTA. Plain text, no production notes.',
}

export function createWriteHandler(deps: WriteHandlerDeps): AgentHandler<WritePayload, WriteHandlerData> {
  const maxOut = deps.maxOutputTokens ?? 2000

  return {
    type: 'write',
    name: 'Content Writer',
    description: 'Multi-format content writer (blog, thread, IG carousel, LinkedIn, newsletter, TikTok, YT shorts). Chains from research output.',

    async run(ctx: AgentContext<WritePayload>): Promise<HandlerOutcome<WriteHandlerData>> {
      const payload = ctx.task.payload
      const brief = (payload.brief ?? '').trim()
      if (!brief) {
        throw new Error('write handler: payload.brief is required and was empty')
      }
      const formats = (payload.formats?.length ? payload.formats : ['blog']) as WriteFormat[]
      const model = payload.model ?? deps.defaultModel
      const style = payload.style ?? 'punchy'

      const researchBlock = payload.research?.narrative
        ? `\n\nRESEARCH CONTEXT (cite these where relevant):\n${payload.research.narrative}\n${
            (payload.research.citations ?? [])
              .slice(0, 8)
              .map((c, i) => `[${i + 1}] ${c.title} — ${c.url}`)
              .join('\n')
          }`
        : ''

      const pieces: WritePiece[] = []
      let inputTokens = 0
      let outputTokens = 0

      for (const format of formats) {
        const systemPrompt = `${ctx.systemPrompt}\n\nYou write in a ${style} voice. Produce only the requested format, nothing else.`
        const userPrompt = `BRIEF: ${brief}\n\nFORMAT: ${format}\n${FORMAT_INSTRUCTIONS[format]}${researchBlock}`

        try {
          const completion = await deps.llm.complete({
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            model,
            maxTokens: maxOut,
            signal: ctx.signal,
          })
          inputTokens += completion.usage?.inputTokens ?? 0
          outputTokens += completion.usage?.outputTokens ?? 0

          const raw = completion.text.trim()
          pieces.push(parseFormat(format, brief, raw))
        } catch (err) {
          ctx.log.warn('write: format failed', {
            format,
            error: err instanceof Error ? err.message : String(err),
          })
        }
      }

      if (pieces.length === 0) {
        throw new Error('write handler: every format failed; see logs')
      }

      const summary = `Wrote ${pieces.length} piece(s): ${pieces.map((p) => p.format).join(', ')}`
      const nextActions = [
        'Review the generated pieces and approve for publish',
        ...pieces
          .filter((p) => p.format === 'thread' || p.format === 'instagram' || p.format === 'linkedin' || p.format === 'tiktok' || p.format === 'youtube_script')
          .map((p) => `Queue publish task for ${p.format}`),
      ]

      const memories: HandlerOutcome<WriteHandlerData>['memories'] = pieces.map((p) => ({
        type: 'event' as const,
        content: `Wrote ${p.format}: ${p.title}`,
        tags: ['write', p.format],
      }))

      return {
        data: { pieces },
        summary,
        memories,
        nextActions,
        usage: { model, inputTokens, outputTokens },
      }
    },
  }
}

function parseFormat(format: WriteFormat, brief: string, raw: string): WritePiece {
  const title = extractTitle(raw, brief)

  if (format === 'thread' || format === 'instagram') {
    const parts = tryParseJsonArray(raw) ?? raw
      .split(/\n\s*\n|\r?\n[•\-\d]+[\.\)]\s+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 12)
    return { format, title, parts }
  }

  return { format, title, body: raw }
}

function extractTitle(body: string, fallback: string): string {
  const h1 = body.match(/^#\s+(.+)$/m)?.[1]?.trim()
  if (h1) return h1
  const firstLine = body.split('\n')[0]?.trim() ?? ''
  if (firstLine && firstLine.length < 120) return firstLine
  return fallback.slice(0, 80)
}

function tryParseJsonArray(s: string): string[] | null {
  // LLM might wrap in ```json fences
  const cleaned = s.replace(/^```(json)?/m, '').replace(/```$/m, '').trim()
  try {
    const parsed = JSON.parse(cleaned)
    if (Array.isArray(parsed) && parsed.every((p) => typeof p === 'string')) return parsed
  } catch {
    /* not JSON, fall back */
  }
  return null
}
