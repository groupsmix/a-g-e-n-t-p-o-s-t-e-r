/**
 * Build a richer image prompt from the brief. Style + palette become
 * suffix modifiers. Negative prompt is preserved separately.
 *
 * Optional LLM pass rewrites the prompt for the chosen style — useful
 * when the brief came from a content planner with terse angles.
 */

import type { ImageBrief, LLMClient } from '../types.js'

const STYLE_SUFFIX: Record<string, string> = {
  photo: 'cinematic photography, natural light, sharp focus',
  illustration: 'flat illustration, soft shapes, 2 accent colours',
  minimal: 'minimal design, generous whitespace, single focal element',
  cinematic: 'cinematic, anamorphic lens, dramatic backlight',
  product: 'studio product shot, soft shadow, white background',
}

export async function buildPrompt(brief: ImageBrief, llm?: LLMClient): Promise<string> {
  const style = brief.style?.toLowerCase()
  const suffix = (style && STYLE_SUFFIX[style]) ?? STYLE_SUFFIX.photo
  const palette = brief.palette?.length ? `, palette ${brief.palette.join(', ')}` : ''
  const base = `${brief.prompt.trim()} — ${suffix}${palette}`
  if (!llm) return base
  try {
    const res = await llm.complete({
      system:
        'You rewrite image prompts for diffusion models. Return ONE line, ≤ 280 chars. No quotes. Keep nouns intact, add concrete visual modifiers, no NSFW.',
      messages: [{ role: 'user', content: base }],
      maxTokens: 200,
      temperature: 0.4,
    })
    const cleaned = res.content.replace(/^["']|["']$/g, '').trim().slice(0, 280)
    return cleaned || base
  } catch {
    return base
  }
}
