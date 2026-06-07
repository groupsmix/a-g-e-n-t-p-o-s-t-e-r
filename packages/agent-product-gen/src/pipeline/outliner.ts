/**
 * Stage 1 — outline.  Each ProductKind gets a different default unit
 * count + prompt template.  LLM is preferred but a deterministic
 * stub keeps the test pipeline honest.
 */

import type { LLMClient, ProductBrief, ProductOutline } from '../types.js'

const DEFAULTS: Record<ProductBrief['kind'], number> = {
  ebook: 8,
  'prompt-pack': 30,
  'template-pack': 12,
  'mini-course': 5,
}

const SYSTEM = `Outline a digital product. Reply ONLY with JSON:
{
  title: string,
  summary: string,                    // one paragraph
  units: Array<{ title: string, brief: string }>   // {N} items
}`

function stubOutline(brief: ProductBrief): ProductOutline {
  const n = brief.units ?? DEFAULTS[brief.kind]
  const noun =
    brief.kind === 'ebook'
      ? 'Chapter'
      : brief.kind === 'prompt-pack'
      ? 'Prompt'
      : brief.kind === 'template-pack'
      ? 'Template'
      : 'Lesson'
  return {
    kind: brief.kind,
    title: `${brief.topic} — ${noun}s`,
    summary: `A practical ${brief.kind} on ${brief.topic}.`,
    units: Array.from({ length: n }, (_, i) => ({
      title: `${noun} ${i + 1}`,
      brief: `${noun} ${i + 1} on ${brief.topic}.`,
    })),
  }
}

export async function outlineProduct(
  brief: ProductBrief,
  llm?: LLMClient,
): Promise<ProductOutline> {
  const n = brief.units ?? DEFAULTS[brief.kind]
  if (!llm) return stubOutline({ ...brief, units: n })
  try {
    const res = await llm.complete({
      system: SYSTEM.replace('{N}', String(n)),
      messages: [
        {
          role: 'user',
          content: `Kind: ${brief.kind}\nTopic: ${brief.topic}\nAudience: ${brief.audience ?? 'general'}\nVoice: ${brief.voice ?? 'expert, friendly'}`,
        },
      ],
      json: true,
      maxTokens: 800,
      temperature: 0.6,
    })
    const j = JSON.parse(res.content) as Partial<ProductOutline>
    if (Array.isArray(j.units) && j.units.length > 0 && j.title) {
      return {
        kind: brief.kind,
        title: j.title,
        summary: j.summary ?? '',
        units: j.units.filter((u): u is { title: string; brief: string } =>
          !!u && typeof u.title === 'string' && typeof u.brief === 'string',
        ),
      }
    }
  } catch {
    /* fall through */
  }
  return stubOutline({ ...brief, units: n })
}
