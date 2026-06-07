/**
 * Stage 2 — write each unit's body.  Kind-specific prompts, but the
 * loop is uniform.  Per-unit failures fall back to a brief stub so a
 * single LLM error never kills the whole product.
 */

import type { LLMClient, ProductOutline, ProductBrief } from '../types.js'

const PROMPTS: Record<ProductBrief['kind'], string> = {
  ebook: `Write 400–600 words for chapter "{TITLE}". Sections: intro, 3 H2s, takeaway. Markdown only.`,
  'prompt-pack': `Write a single ready-to-use LLM prompt titled "{TITLE}". 80–160 words. Include placeholders in {curlies}. No commentary.`,
  'template-pack': `Write a Markdown template named "{TITLE}" with clearly marked editable spots in [brackets]. 80–200 words.`,
  'mini-course': `Write lesson "{TITLE}" — 500–700 words of teaching plus 3 exercises. Markdown only.`,
}

export interface UnitBody {
  title: string
  body: string
}

export interface WriterUsage {
  inputTokens: number
  outputTokens: number
  units: number
}

export async function writeUnits(
  outline: ProductOutline,
  llm?: LLMClient,
): Promise<{ units: UnitBody[]; usage: WriterUsage }> {
  const usage: WriterUsage = { inputTokens: 0, outputTokens: 0, units: 0 }
  const out: UnitBody[] = []
  for (const u of outline.units) {
    if (!llm) {
      out.push({ title: u.title, body: `_${u.brief}_\n\nDraft body to be written.\n` })
      continue
    }
    try {
      const res = await llm.complete({
        system: 'You write polished, ready-to-sell digital product content.',
        messages: [
          {
            role: 'user',
            content: PROMPTS[outline.kind].replace('{TITLE}', u.title) +
              `\nContext brief: ${u.brief}`,
          },
        ],
        maxTokens: 1500,
        temperature: 0.6,
      })
      usage.inputTokens += res.inputTokens ?? 0
      usage.outputTokens += res.outputTokens ?? 0
      usage.units += 1
      out.push({ title: u.title, body: res.content.trim() })
    } catch {
      out.push({ title: u.title, body: `_${u.brief}_\n\n(generation failed — placeholder)\n` })
    }
  }
  return { units: out, usage }
}
