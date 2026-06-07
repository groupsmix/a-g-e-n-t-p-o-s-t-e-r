/**
 * Uniform writer loop.  For each requested format, call llm with the
 * format spec's prompt, parse into a WriterDraft.  Per-format
 * failures fall back to the deterministic stub.
 *
 * No LLM → every format takes its fallback path.
 */

import type { LLMClient, WriterBrief, WriterDraft, WriterFormat, WriterReport } from '../types.js'
import { FORMATS } from '../formats/specs.js'

const SYSTEM = `You are a senior content writer. Match the requested voice exactly. Skip preamble.`

export async function writeFormats(
  brief: WriterBrief,
  formats: WriterFormat[],
  llm?: LLMClient,
): Promise<WriterReport> {
  const drafts: WriterDraft[] = []
  const skipped: WriterFormat[] = []
  const usage = { inputTokens: 0, outputTokens: 0 }

  for (const fmt of formats) {
    const spec = FORMATS[fmt]
    if (!spec) {
      skipped.push(fmt)
      continue
    }
    if (!llm) {
      drafts.push(spec.fallback(brief))
      continue
    }
    try {
      const res = await llm.complete({
        system: SYSTEM,
        messages: [{ role: 'user', content: spec.prompt(brief) }],
        maxTokens: 2200,
        temperature: 0.7,
      })
      usage.inputTokens += res.inputTokens ?? 0
      usage.outputTokens += res.outputTokens ?? 0
      const text = res.content.trim()
      const draft = text ? spec.parse(text, brief) : spec.fallback(brief)
      // hard-enforce per-part char cap
      draft.parts = draft.parts.map((p) =>
        p.length > spec.maxCharsPerPart ? p.slice(0, spec.maxCharsPerPart) : p,
      )
      drafts.push(draft)
    } catch {
      drafts.push(spec.fallback(brief))
    }
  }
  return { brief, drafts, skipped, usage }
}
