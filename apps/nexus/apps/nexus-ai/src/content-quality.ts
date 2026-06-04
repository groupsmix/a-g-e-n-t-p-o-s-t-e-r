// ============================================================
// Anti-slop content quality filter
// ============================================================
// Inspired by ECC content-engine's de-sloppify patterns.
// Detects and removes AI-sounding filler, scores content quality,
// and exports rules for prompt injection.

export const BANNED_PHRASES = [
  'game-changer',
  'revolutionary',
  'cutting-edge',
  "in today's rapidly evolving landscape",
  'unlock your potential',
  'take it to the next level',
  'seamlessly',
  'leverage',
  'synergy',
  'disrupt',
  'game changer',
  'revolutionize',
  'in today\'s fast-paced world',
  'in the digital age',
  'in this day and age',
  'unlock',
  'unleash',
  'elevate',
  'embark',
  'embark on a journey',
  'dive in',
  'delve',
  'navigate the',
  'in conclusion',
  'in summary',
  'last but not least',
  'seamless',
  'robust',
  'harness',
  'tapestry',
  'realm',
  'landscape of',
  'when it comes to',
  'at the end of the day',
  'it is important to note',
  "it's worth noting",
  'rest assured',
  'look no further',
  "whether you're a",
  'supercharge',
  'turbocharge',
  'a myriad of',
  'plethora',
  'ever-evolving',
  'ever-changing',
  'fast-paced',
  'bustling',
] as const

const FILLER_STARTERS = [
  /^in today['']s\b/i,
  /^in the (modern|digital|current)\b/i,
  /^as we all know\b/i,
  /^it goes without saying\b/i,
  /^needless to say\b/i,
]

const REPLACEMENT_MAP: Record<string, string> = {
  'leverage': 'use',
  'utilize': 'use',
  'synergy': 'collaboration',
  'robust': 'strong',
  'seamlessly': 'smoothly',
  'seamless': 'smooth',
  'cutting-edge': 'modern',
  'game-changer': 'improvement',
  'game changer': 'improvement',
  'revolutionary': 'new',
  'revolutionize': 'improve',
  'disrupt': 'change',
  'unlock': 'open',
  'unleash': 'release',
  'elevate': 'improve',
  'delve': 'look',
  'harness': 'use',
  'supercharge': 'boost',
  'turbocharge': 'speed up',
  'plethora': 'many',
  'a myriad of': 'many',
  'tapestry': 'mix',
  'realm': 'area',
}

export function cleanContent(text: string): string {
  let cleaned = text

  for (const [phrase, replacement] of Object.entries(REPLACEMENT_MAP)) {
    const re = new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi')
    cleaned = cleaned.replace(re, replacement)
  }

  const phrasePatterns = BANNED_PHRASES.filter((p) => !REPLACEMENT_MAP[p.toLowerCase()])
  for (const phrase of phrasePatterns) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(escaped, 'gi')
    cleaned = cleaned.replace(re, '')
  }

  for (const pattern of FILLER_STARTERS) {
    const lines = cleaned.split('\n')
    cleaned = lines
      .map((line) => {
        const trimmed = line.trim()
        if (pattern.test(trimmed)) {
          const comma = trimmed.indexOf(',')
          if (comma > 0 && comma < 80) {
            return line.replace(trimmed.slice(0, comma + 1), '').trim()
          }
        }
        return line
      })
      .join('\n')
  }

  cleaned = cleaned.replace(/  +/g, ' ').replace(/\n{3,}/g, '\n\n')
  return cleaned.trim()
}

export function scoreContentQuality(text: string): number {
  if (!text || text.length < 20) return 0

  let score = 100

  const lower = text.toLowerCase()
  let bannedHits = 0
  for (const phrase of BANNED_PHRASES) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const matches = lower.match(new RegExp(escaped, 'gi'))
    if (matches) bannedHits += matches.length
  }
  score -= bannedHits * 5

  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0)
  if (sentences.length > 2) {
    const lengths = sentences.map((s) => s.trim().split(/\s+/).length)
    const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length
    const variance = lengths.reduce((sum, l) => sum + (l - avg) ** 2, 0) / lengths.length
    if (variance < 4) score -= 10
  }

  const passivePattern = /\b(is|are|was|were|been|being)\s+\w+ed\b/gi
  const passiveMatches = text.match(passivePattern)
  if (passiveMatches && sentences.length > 0) {
    const passiveRatio = passiveMatches.length / sentences.length
    if (passiveRatio > 0.3) score -= 10
  }

  const exclamations = (text.match(/!/g) || []).length
  if (exclamations > 3) score -= (exclamations - 3) * 3

  if (text.length < 100) score -= 15
  if (text.length > 200 && text.length < 300) score += 5

  return Math.max(0, Math.min(100, score))
}

export const CONTENT_RULES = {
  system_directive:
    'Write like a sharp human expert. Be specific, use concrete examples and real numbers. ' +
    'Vary sentence length. Active voice. No filler, no cliches, no hype. ' +
    'Start with the most useful thing immediately.',
  banned_phrases: BANNED_PHRASES,
  tone: 'Confident, plain, slightly opinionated. One knowledgeable person on a good day.',
  guidelines: [
    'Open with a concrete hook — never "In today\'s..."',
    'Earn every sentence — cut throat-clearing intros and restatement summaries',
    'Use active voice and talk directly to the reader',
    'Include at least one concrete example or mini-walkthrough',
    'End with a direct, non-cheesy call to action',
  ],
} as const
