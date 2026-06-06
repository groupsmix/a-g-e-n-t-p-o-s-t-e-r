/**
 * Brief generator — turns ContentGap[] into ContentBrief[] via the LLM.
 *
 * One LLM call produces all briefs in a single batch so the cron loop
 * burns one prompt instead of N. Strict JSON shape; failures degrade
 * to a deterministic template-based brief so the writer agent still
 * has something to chew on.
 */

import type {
  ContentBrief,
  ContentGap,
  LLMClient,
  TrendConfig,
  Video,
} from '../types.js'

export interface BriefGenInput {
  gaps: ContentGap[]
  videos: Video[]
  llm?: LLMClient
  config: TrendConfig
  signal?: AbortSignal
  log?: {
    info(msg: string, meta?: Record<string, unknown>): void
    warn(msg: string, meta?: Record<string, unknown>): void
  }
}

export interface BriefGenOutput {
  briefs: ContentBrief[]
  usage: { briefInputTokens: number; briefOutputTokens: number }
}

export async function generateBriefs(input: BriefGenInput): Promise<BriefGenOutput> {
  const { gaps, videos, llm, config } = input
  const selected = gaps
    .filter(
      (g) =>
        g.demandScore >= config.minDemandScore &&
        g.competitionScore <= config.maxCompetitionScore,
    )
    .slice(0, config.maxBriefs)

  if (!selected.length) {
    return { briefs: [], usage: { briefInputTokens: 0, briefOutputTokens: 0 } }
  }

  const compact = selected.map((g) => ({
    niche: g.niche,
    topic: g.topic,
    reason: g.reason,
    demand: g.demandScore,
    competition: g.competitionScore,
    inspiredBy: pickInspired(g, videos),
  }))

  if (!llm) {
    return {
      briefs: selected.map((g, i) => fallbackBrief(g, compact[i].inspiredBy)),
      usage: { briefInputTokens: 0, briefOutputTokens: 0 },
    }
  }

  try {
    const completion = await llm.complete({
      model: config.briefModel,
      maxTokens: 2500,
      temperature: 0.6,
      messages: [
        {
          role: 'system',
          content:
            'You are a YouTube content strategist. For each topic gap, produce a brief with: ' +
            'workingTitle, hook (1 sentence), outline (4–6 bullets), format ("video"|"short"|"blog"|"thread"), ' +
            'targetLengthMin (number, optional), targetLengthSec (number, optional), differentiator (1 sentence). ' +
            'Return strict JSON array, one object per input topic, same order. No prose.',
        },
        { role: 'user', content: JSON.stringify(compact) },
      ],
      signal: input.signal,
    })
    const parsed = parseJsonArray(completion.text)
    if (!parsed || !Array.isArray(parsed)) {
      input.log?.warn('brief-gen: malformed JSON, falling back to template')
      return {
        briefs: selected.map((g, i) => fallbackBrief(g, compact[i].inspiredBy)),
        usage: {
          briefInputTokens: completion.usage.inputTokens,
          briefOutputTokens: completion.usage.outputTokens,
        },
      }
    }
    const briefs = selected.map((g, i): ContentBrief => {
      const raw = (parsed[i] ?? {}) as Record<string, unknown>
      return {
        niche: g.niche,
        topic: g.topic,
        workingTitle: typeof raw.workingTitle === 'string' ? raw.workingTitle : `${g.topic} — explained`,
        hook: typeof raw.hook === 'string' ? raw.hook : `Why ${g.topic} matters right now.`,
        outline: Array.isArray(raw.outline)
          ? (raw.outline.filter((x) => typeof x === 'string') as string[])
          : defaultOutline(g.topic),
        format: pickFormat(raw.format),
        targetLengthMin: numOrUndef(raw.targetLengthMin),
        targetLengthSec: numOrUndef(raw.targetLengthSec),
        differentiator:
          typeof raw.differentiator === 'string'
            ? raw.differentiator
            : `Coverage of "${g.topic}" is currently ${g.reason}.`,
        inspiredBy: compact[i].inspiredBy,
      }
    })
    return {
      briefs,
      usage: {
        briefInputTokens: completion.usage.inputTokens,
        briefOutputTokens: completion.usage.outputTokens,
      },
    }
  } catch (err) {
    input.log?.warn('brief-gen: LLM failed, using fallback', {
      error: (err as Error).message,
    })
    return {
      briefs: selected.map((g, i) => fallbackBrief(g, compact[i].inspiredBy)),
      usage: { briefInputTokens: 0, briefOutputTokens: 0 },
    }
  }
}

function pickInspired(gap: ContentGap, videos: Video[]): string[] {
  return videos.filter((v) => v.niche === gap.niche).slice(0, 3).map((v) => v.id)
}

function fallbackBrief(gap: ContentGap, inspiredBy: string[]): ContentBrief {
  return {
    niche: gap.niche,
    topic: gap.topic,
    workingTitle: `${capitalise(gap.topic)} — what's actually going on`,
    hook: `Here's what current videos on "${gap.topic}" keep missing.`,
    outline: defaultOutline(gap.topic),
    format: 'video',
    targetLengthMin: 8,
    differentiator: `Existing coverage is ${gap.reason}. This piece fills the gap.`,
    inspiredBy,
  }
}

function defaultOutline(topic: string): string[] {
  return [
    `Cold open: the one thing everyone gets wrong about ${topic}`,
    `Section 1: how ${topic} actually works`,
    `Section 2: the 3 mistakes people make`,
    `Section 3: a step-by-step framework`,
    `Section 4: results / proof / data`,
    `Outro: what to do this week`,
  ]
}

function pickFormat(v: unknown): ContentBrief['format'] {
  if (v === 'short' || v === 'blog' || v === 'thread') return v
  return 'video'
}

function numOrUndef(v: unknown): number | undefined {
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function parseJsonArray(text: string): unknown[] | undefined {
  const s = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  try {
    const parsed = JSON.parse(s)
    return Array.isArray(parsed) ? parsed : undefined
  } catch {
    const m = s.match(/\[[\s\S]*\]/)
    if (!m) return undefined
    try {
      const parsed = JSON.parse(m[0])
      return Array.isArray(parsed) ? parsed : undefined
    } catch {
      return undefined
    }
  }
}
