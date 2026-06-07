/**
 * Stage 1 — turn a brief into a Storyboard.
 *
 * Deterministic path: segment script by sentences, allocate scenes
 * across SceneKinds based on what the brief contains (data → data-viz,
 * product → product-showcase, etc.).  LLM path (optional) asks for
 * a JSON storyboard with the same shape.
 */

import type {
  AspectRatio,
  DataVizScene,
  LLMClient,
  NewsReelScene,
  ProductShowcaseScene,
  QuoteCardScene,
  Scene,
  Storyboard,
  TextCarouselScene,
  VideoBrief,
} from '../types.js'

const DEFAULT_PALETTE = { bg: '#0F172A', fg: '#F8FAFC', accent: '#22D3EE' }

function segments(script: string, max = 6): string[] {
  const sentences = script
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
  // group into ~equal chunks
  const groups: string[] = []
  const groupSize = Math.max(1, Math.ceil(sentences.length / max))
  for (let i = 0; i < sentences.length; i += groupSize) {
    groups.push(sentences.slice(i, i + groupSize).join(' '))
  }
  return groups.slice(0, max)
}

function id(prefix: string, i: number): string {
  return `${prefix}_${String(i + 1).padStart(2, '0')}`
}

export interface PlannerOptions {
  /** Allow specific scene kinds; default all available. */
  allowKinds?: Scene['kind'][]
}

export async function planScenes(
  brief: VideoBrief,
  opts: PlannerOptions = {},
  _llm?: LLMClient,
): Promise<Storyboard> {
  const aspect: AspectRatio = brief.aspect ?? '9:16'
  const total = brief.durationSec ?? 30
  const palette = brief.palette ?? DEFAULT_PALETTE
  const segs = segments(brief.script || brief.topic, 5)
  const perScene = Math.max(2, Math.round(total / Math.max(1, segs.length + 1)))

  const scenes: Scene[] = []

  // 1) Hook is always first — quote-card with the hook line
  scenes.push({
    id: id('s', 0),
    kind: 'quote-card',
    durationSec: 3,
    caption: brief.hook,
    quote: brief.hook,
    author: undefined,
  } satisfies QuoteCardScene)

  // 2) Body — text-carousel(s) over script segments
  segs.forEach((seg, i) => {
    scenes.push({
      id: id('s', scenes.length),
      kind: 'text-carousel',
      durationSec: perScene,
      caption: seg,
      bullets: seg.split(/\.\s+|;\s+/).filter(Boolean).slice(0, 3),
    } satisfies TextCarouselScene)
  })

  // 3) Optional data viz
  if (brief.data && brief.data.length) {
    scenes.push({
      id: id('s', scenes.length),
      kind: 'data-viz',
      durationSec: perScene,
      caption: `By the numbers: ${brief.topic}`,
      title: brief.topic,
      series: brief.data,
    } satisfies DataVizScene)
  }

  // 4) Optional product showcase
  if (brief.product) {
    scenes.push({
      id: id('s', scenes.length),
      kind: 'product-showcase',
      durationSec: perScene,
      caption: brief.product.name,
      name: brief.product.name,
      price: brief.product.price,
      imageUrl: brief.product.imageUrl,
      bullets: brief.product.bullets ?? [],
    } satisfies ProductShowcaseScene)
  }

  // 5) Optional news-reel close-out if hook smells like a headline
  if (/\b(launch(?:es|ed|ing)?|raise(?:s|d)?|announce(?:s|d)?|hits?|beats?|drops?)\b/i.test(brief.hook)) {
    scenes.push({
      id: id('s', scenes.length),
      kind: 'news-reel',
      durationSec: 3,
      caption: brief.hook,
      headline: brief.hook,
    } satisfies NewsReelScene)
  }

  const filtered = opts.allowKinds
    ? scenes.filter((s) => opts.allowKinds!.includes(s.kind))
    : scenes

  // normalise durations so total ≈ brief.durationSec
  const sum = filtered.reduce((a, b) => a + b.durationSec, 0) || 1
  const scale = total / sum
  for (const s of filtered) s.durationSec = +(s.durationSec * scale).toFixed(2)

  return {
    brief,
    aspect,
    durationSec: total,
    scenes: filtered,
    palette,
  }
}
