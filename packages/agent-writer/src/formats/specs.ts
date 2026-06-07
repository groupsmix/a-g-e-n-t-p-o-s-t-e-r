/**
 * Per-format spec: prompt, expected parts, max chars per part, JSON
 * extraction shape.  The writer loop calls llm.complete with the
 * format-specific system prompt and then splits the response into
 * a WriterDraft.parts array.
 *
 * Every spec has a deterministic fallback used when no LLM is
 * available — gives tests + the dashboard something to render.
 */

import type { WriterBrief, WriterDraft, WriterFormat } from '../types.js'

export interface FormatSpec {
  format: WriterFormat
  prompt(brief: WriterBrief): string
  fallback(brief: WriterBrief): WriterDraft
  /** Parse free-text LLM output into ordered parts. */
  parse(llmText: string, brief: WriterBrief): WriterDraft
  /** Hard character limit per individual part — splitter enforces. */
  maxCharsPerPart: number
}

function clip(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…'
}

function splitNumbered(text: string): string[] {
  // Splits on "1." "2)" "3:" etc. at start of line. Falls back to paragraph split.
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const parts: string[] = []
  let cur = ''
  for (const l of lines) {
    if (/^(\d+[\.\)\:]\s+|—\s+|-\s+)/.test(l)) {
      if (cur) parts.push(cur.trim())
      cur = l.replace(/^(\d+[\.\)\:]\s+|—\s+|-\s+)/, '')
    } else {
      cur += '\n' + l
    }
  }
  if (cur.trim()) parts.push(cur.trim())
  if (parts.length > 1) return parts
  // fallback: paragraphs
  return text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
}

function pickTitle(text: string): string {
  const first = text.split(/\n/).find((l) => l.trim().length > 0)?.trim() ?? ''
  return first.replace(/^#+\s*/, '').slice(0, 110)
}

const baseHeader = (brief: WriterBrief): string =>
  `Topic: ${brief.topic}\nAngle: ${brief.angle}\n` +
  (brief.audience ? `Audience: ${brief.audience}\n` : '') +
  (brief.voice ? `Voice: ${brief.voice}\n` : '') +
  (brief.cta ? `CTA: ${brief.cta}\n` : '') +
  (brief.references?.length ? `References:\n${brief.references.map((r) => `- ${r}`).join('\n')}\n` : '')

export const FORMATS: Record<WriterFormat, FormatSpec> = {
  blog: {
    format: 'blog',
    maxCharsPerPart: 8000,
    prompt: (b) =>
      `Write a 700–1000 word blog post in markdown.\n${baseHeader(b)}\n` +
      `Structure: H1 title, 1-sentence hook paragraph, 4 H2 sections, conclusion.\n` +
      `Reply with the markdown only.`,
    fallback: (b) => ({
      format: 'blog',
      title: b.angle || b.topic,
      parts: [
        `# ${b.angle || b.topic}\n\n_${b.topic}_\n\nA placeholder body to be filled in.`,
      ],
    }),
    parse: (text, b) => ({
      format: 'blog',
      title: pickTitle(text) || b.topic,
      parts: [text.trim()],
    }),
  },

  'x-thread': {
    format: 'x-thread',
    maxCharsPerPart: 280,
    prompt: (b) =>
      `Write a 6–9 tweet X thread.\n${baseHeader(b)}\n` +
      `Format: numbered "1/", "2/" ... Each tweet ≤ 280 chars. First tweet is a punchy hook.\n` +
      `Reply with the thread only, one tweet per line, prefixed with "N/".`,
    fallback: (b) => ({
      format: 'x-thread',
      title: clip(b.angle || b.topic, 110),
      parts: [
        clip(`1/ ${b.angle || b.topic}`, 280),
        clip(`2/ Why this matters: ${b.audience ?? 'people who care about ' + b.topic}`, 280),
        clip(`3/ One tactic: try it this week.`, 280),
      ],
    }),
    parse: (text, b) => {
      const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
      const parts = lines
        .filter((l) => /^\d+\s*\//.test(l))
        .map((l) => clip(l, 280))
      return {
        format: 'x-thread',
        title: clip(parts[0] ?? b.topic, 110),
        parts: parts.length ? parts : lines.map((l) => clip(l, 280)),
      }
    },
  },

  linkedin: {
    format: 'linkedin',
    maxCharsPerPart: 2900,
    prompt: (b) =>
      `Write a single LinkedIn post (≤ 1300 chars in body, plain prose, line breaks for rhythm).\n` +
      `${baseHeader(b)}\nOpen with a single-line hook. End with a soft question.`,
    fallback: (b) => ({
      format: 'linkedin',
      title: clip(b.angle || b.topic, 110),
      parts: [`${b.angle || b.topic}\n\nPlaceholder. ${b.cta ?? 'What do you think?'}`],
    }),
    parse: (text, b) => ({
      format: 'linkedin',
      title: pickTitle(text) || b.topic,
      parts: [clip(text.trim(), 2900)],
    }),
  },

  instagram: {
    format: 'instagram',
    maxCharsPerPart: 2200,
    prompt: (b) =>
      `Write an Instagram caption (≤ 1500 chars). 3–5 short paragraphs with emoji breakers.\n` +
      `${baseHeader(b)}\nEnd with 8–12 niche hashtags on a separate line prefixed with #.`,
    fallback: (b) => ({
      format: 'instagram',
      title: clip(b.angle || b.topic, 110),
      parts: [`${b.angle || b.topic}\n\nPlaceholder.\n\n#${(b.topic ?? '').replace(/\s+/g, '')}`],
    }),
    parse: (text, b) => {
      const lines = text.trim().split(/\n/)
      const hashLine = [...lines].reverse().find((l) => /(?:^|\s)#/.test(l))
      const hashtags = hashLine?.match(/#[\w]+/g) ?? []
      return {
        format: 'instagram',
        title: pickTitle(text) || b.topic,
        parts: [clip(text.trim(), 2200)],
        meta: { hashtags },
      }
    },
  },

  tiktok: {
    format: 'tiktok',
    maxCharsPerPart: 2200,
    prompt: (b) =>
      `Write a 30–45 second TikTok script.\n${baseHeader(b)}\n` +
      `Format: HOOK (1 line), 3 BEATS, CTA. Add B-roll suggestions in [brackets].`,
    fallback: (b) => ({
      format: 'tiktok',
      title: clip(b.angle || b.topic, 110),
      parts: [
        `HOOK: ${b.angle || b.topic}\nBEAT 1: ...\nBEAT 2: ...\nBEAT 3: ...\nCTA: ${b.cta ?? 'Follow for more.'}`,
      ],
    }),
    parse: (text, b) => ({
      format: 'tiktok',
      title: pickTitle(text) || b.topic,
      parts: [text.trim()],
    }),
  },

  youtube: {
    format: 'youtube',
    maxCharsPerPart: 6000,
    prompt: (b) =>
      `Write a YouTube video script (4–6 min). Sections: Hook, Setup, Main, Reveal, CTA.\n` +
      `${baseHeader(b)}\nAlso give 3 candidate titles and a 250-word description.\n` +
      `Format the output as:\nTITLE_CANDIDATES:\n1. ...\n2. ...\n3. ...\n\nDESCRIPTION:\n...\n\nSCRIPT:\n...`,
    fallback: (b) => ({
      format: 'youtube',
      title: clip(b.angle || b.topic, 100),
      parts: ['SCRIPT:\nHOOK\nSETUP\nMAIN\nREVEAL\nCTA'],
      meta: { titleCandidates: [b.angle || b.topic], description: '' },
    }),
    parse: (text, b) => {
      const titles = [...text.matchAll(/^\d+\.\s+(.+)$/gm)].map((m) => m[1]!.trim()).slice(0, 3)
      const descMatch = text.match(/DESCRIPTION:\s*([\s\S]*?)(?:SCRIPT:|$)/i)
      const scriptMatch = text.match(/SCRIPT:\s*([\s\S]*)$/i)
      return {
        format: 'youtube',
        title: titles[0] ?? pickTitle(text) ?? b.topic,
        parts: [(scriptMatch?.[1] ?? text).trim()],
        meta: {
          titleCandidates: titles,
          description: descMatch?.[1]?.trim() ?? '',
        },
      }
    },
  },

  newsletter: {
    format: 'newsletter',
    maxCharsPerPart: 16000,
    prompt: (b) =>
      `Write a 500–800 word email newsletter.\n${baseHeader(b)}\n` +
      `Format:\nSUBJECT: ...\nPREVIEW: ...\nBODY (markdown, conversational, P.S. at end).`,
    fallback: (b) => ({
      format: 'newsletter',
      title: clip(b.angle || b.topic, 110),
      parts: [`SUBJECT: ${b.angle || b.topic}\nPREVIEW: …\n\nBody placeholder.`],
    }),
    parse: (text, b) => {
      const subj = text.match(/SUBJECT:\s*(.+)/i)?.[1]?.trim()
      const prev = text.match(/PREVIEW:\s*(.+)/i)?.[1]?.trim()
      return {
        format: 'newsletter',
        title: subj ?? pickTitle(text) ?? b.topic,
        parts: [text.trim()],
        meta: { subject: subj, preview: prev },
      }
    },
  },

  'product-copy': {
    format: 'product-copy',
    maxCharsPerPart: 4000,
    prompt: (b) =>
      `Write a product sales page in markdown.\n${baseHeader(b)}\n` +
      `Sections: H1 product name, 1-line value prop, "What's inside" bullets, ` +
      `"Who it's for" paragraph, 3-tier FAQ, single CTA button label on its own line at the end.`,
    fallback: (b) => ({
      format: 'product-copy',
      title: b.topic,
      parts: [`# ${b.topic}\n\n${b.angle || ''}\n\n## What's inside\n- TBD\n`],
    }),
    parse: (text, b) => ({
      format: 'product-copy',
      title: pickTitle(text) || b.topic,
      parts: [text.trim()],
    }),
  },

  'cold-email': {
    format: 'cold-email',
    maxCharsPerPart: 1200,
    prompt: (b) =>
      `Write a cold email under 120 words.\n${baseHeader(b)}\n` +
      `Format:\nSUBJECT: ...\n---\nGreeting\nOne-line value prop\nOne specific reason for them\nOne ask (short)\nSign-off`,
    fallback: (b) => ({
      format: 'cold-email',
      title: clip(b.angle || b.topic, 90),
      parts: [`SUBJECT: ${b.angle || b.topic}\n\nHi,\nQuick note about ${b.topic}.\n\n— Yours`],
    }),
    parse: (text, b) => {
      const subj = text.match(/SUBJECT:\s*(.+)/i)?.[1]?.trim()
      return {
        format: 'cold-email',
        title: subj ?? pickTitle(text) ?? b.topic,
        parts: [clip(text.trim(), 1200)],
        meta: { subject: subj },
      }
    },
  },
}

export { splitNumbered, clip, pickTitle }
