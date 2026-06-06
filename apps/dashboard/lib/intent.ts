/**
 * Command palette intent parser.
 *
 * Maps a free-text query (typed by a human in the cmd+K palette) to one or
 * more candidate `AgentTaskType` dispatches.  This is intentionally a *small*
 * keyword/regex matcher — the real semantic router lives in Phase 2 once the
 * brain layer is online.  Until then this gives the dashboard enough power
 * to feel agentic without any model in the loop.
 *
 * Each candidate carries:
 *   - the matched `AgentTaskType` (the wire contract for /api/tasks)
 *   - a human label (rendered in the palette item)
 *   - the destination route (where to drop the user after dispatch)
 *   - a structured `payload` extracted from the query
 *   - a `score` (0..1) — higher = stronger signal that this is what the
 *     user meant.  Used to sort candidates and pick a default.
 *
 * Coverage target: every value of `AgentTaskType` from @posteragent/types.
 * If you add a new task type, add at least one rule here.
 */

import type { AgentTaskType } from '@posteragent/types'

export interface Intent {
  label: string
  route: string
  type: AgentTaskType
  payload: Record<string, unknown>
  /** 0..1 — higher means a stronger match.  Used to rank candidates. */
  score: number
}

// ────────────────────────────────────────────────────────────────────────────
// Rule table.  Each rule pairs a probe regex with a builder that turns the
// raw query into an Intent.  Rules are checked in declaration order; multiple
// rules MAY fire on the same input — we return them all, ranked by score.
// ────────────────────────────────────────────────────────────────────────────

type Rule = (q: string) => Intent | null

/** Strip the matched prefix (and trailing whitespace) from the query. */
function strip(q: string, re: RegExp): string {
  return q.replace(re, '').trim()
}

/** Truncate a label so the palette stays one-line on small screens. */
function clip(s: string, n = 60): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s
}

const RULES: Rule[] = [
  // research — strong signals: "research X", "investigate X", "find out X"
  (q) => {
    const re = /^(research|investigate|dig\s+into|find\s+out(\s+about)?)\s+/i
    if (!re.test(q)) return null
    const topic = strip(q, re)
    if (!topic) return null
    return {
      label: clip(`Research "${topic}"`),
      route: '/research',
      type: 'research',
      payload: { topic },
      score: 0.95,
    }
  },

  // build app — must precede generic "build"
  (q) => {
    const re = /^build\s+(an?\s+)?app\s+(for\s+|to\s+|that\s+)?/i
    if (!re.test(q)) return null
    const idea = strip(q, re)
    if (!idea) return null
    return {
      label: clip(`Build app: ${idea}`),
      route: '/builder',
      type: 'build-app',
      payload: { idea },
      score: 0.95,
    }
  },
  (q) => {
    const re = /^(ship|scaffold)\s+(an?\s+)?app\s+/i
    if (!re.test(q)) return null
    const idea = strip(q, re)
    if (!idea) return null
    return {
      label: clip(`Build app: ${idea}`),
      route: '/builder',
      type: 'build-app',
      payload: { idea },
      score: 0.9,
    }
  },

  // build site / website / landing page
  (q) => {
    const re = /^build\s+(an?\s+)?(site|website|landing(\s+page)?)\s+(for\s+|about\s+|to\s+)?/i
    if (!re.test(q)) return null
    const idea = strip(q, re)
    if (!idea) return null
    return {
      label: clip(`Build site: ${idea}`),
      route: '/builder',
      type: 'build-site',
      payload: { idea },
      score: 0.95,
    }
  },

  // write — blog post, draft, article, thread …
  (q) => {
    const re = /^(write|draft)\s+(an?\s+)?(blog post|blog|article|thread|post|piece|essay|newsletter)?\s*(about\s+|on\s+)?/i
    if (!re.test(q)) return null
    const brief = strip(q, re)
    if (!brief) return null
    return {
      label: clip(`Write: ${brief}`),
      route: '/content',
      type: 'write',
      payload: { brief },
      score: 0.9,
    }
  },

  // analyse / analyze / audit / review …
  // ⚠ must come AFTER financial-analysis so "analyse finances" goes to finance.
  (q) => {
    // Defer if this looks like a finance-flavoured analyse.
    if (/^(analy[sz]e|audit|review)\s+(finances?|p&l|revenue|spend|cash|earnings|profit)/i.test(q)) {
      return null
    }
    const re = /^(analy[sz]e|audit|review)\s+/i
    if (!re.test(q)) return null
    const target = strip(q, re)
    if (!target) return null
    return {
      label: clip(`Analyse: ${target}`),
      route: '/analyse',
      type: 'analyse',
      payload: { target },
      score: 0.9,
    }
  },

  // publish / post / share — generic publisher dispatch
  (q) => {
    const re = /^(publish|post|share|tweet|cross-?post)\s+/i
    if (!re.test(q)) return null
    const what = strip(q, re)
    if (!what) return null
    return {
      label: clip(`Publish: ${what}`),
      route: '/publisher',
      type: 'publish',
      payload: { what },
      score: 0.9,
    }
  },

  // generate-video — must precede generic "generate"
  (q) => {
    const re =
      /^(generate|make|render|create|produce)\s+(an?\s+)?(short\s+)?(video|reel|tiktok|short)\s+(about\s+|of\s+|on\s+|for\s+)?/i
    if (!re.test(q)) return null
    const topic = strip(q, re)
    if (!topic) return null
    return {
      label: clip(`Video: ${topic}`),
      route: '/content',
      type: 'generate-video',
      payload: { topic },
      score: 0.95,
    }
  },

  // generate-image
  (q) => {
    const re =
      /^(generate|make|create|draw|render)\s+(an?\s+)?(image|picture|poster|thumbnail|cover|illustration)\s+(of\s+|about\s+|for\s+)?/i
    if (!re.test(q)) return null
    const prompt = strip(q, re)
    if (!prompt) return null
    return {
      label: clip(`Image: ${prompt}`),
      route: '/content',
      type: 'generate-image',
      payload: { prompt },
      score: 0.95,
    }
  },

  // lead-scrape — "find leads for X", "scrape leads", "prospect X"
  (q) => {
    const re = /^(find|scrape|hunt)\s+leads?\s+(for\s+|in\s+|about\s+)?/i
    if (!re.test(q)) return null
    const query = strip(q, re)
    if (!query) return null
    return {
      label: clip(`Lead scrape: ${query}`),
      route: '/leads',
      type: 'lead-scrape',
      payload: { query },
      score: 0.95,
    }
  },
  (q) => {
    const re = /^prospect\s+/i
    if (!re.test(q)) return null
    const query = strip(q, re)
    if (!query) return null
    return {
      label: clip(`Prospect: ${query}`),
      route: '/leads',
      type: 'lead-scrape',
      payload: { query },
      score: 0.85,
    }
  },

  // email-campaign — "email X", "cold email X", "send newsletter about X"
  (q) => {
    const re = /^(send\s+)?(cold\s+)?email\s+(campaign\s+)?(to\s+|for\s+|about\s+)?/i
    if (!re.test(q)) return null
    const brief = strip(q, re)
    if (!brief) return null
    return {
      label: clip(`Email campaign: ${brief}`),
      route: '/leads',
      type: 'email-campaign',
      payload: { brief },
      score: 0.9,
    }
  },
  (q) => {
    const re = /^(send\s+)?newsletter\s+(about\s+|on\s+)?/i
    if (!re.test(q)) return null
    const brief = strip(q, re)
    if (!brief) return null
    return {
      label: clip(`Newsletter: ${brief}`),
      route: '/leads',
      type: 'email-campaign',
      payload: { brief, format: 'newsletter' },
      score: 0.85,
    }
  },

  // financial-analysis — must come BEFORE generic analyse rule (handled above)
  (q) => {
    const re =
      /^(analy[sz]e|review|audit|show me|check)\s+(my\s+)?(finances?|p&l|revenue|spend|cash|earnings|profit|money)\s*/i
    if (!re.test(q)) return null
    const focus = strip(q, re) || 'overall'
    return {
      label: clip(`Financial analysis: ${focus}`),
      route: '/revenue',
      type: 'financial-analysis',
      payload: { focus },
      score: 0.95,
    }
  },

  // brand-monitor — "monitor X", "track mentions of X", "mentions for X"
  (q) => {
    const re = /^(monitor|track)\s+(mentions of\s+|the\s+)?(brand\s+)?/i
    if (!re.test(q)) return null
    const brand = strip(q, re)
    if (!brand) return null
    return {
      label: clip(`Brand monitor: ${brand}`),
      route: '/analyse',
      type: 'brand-monitor',
      payload: { brand },
      score: 0.9,
    }
  },
  (q) => {
    const re = /^mentions?\s+(of\s+|for\s+)/i
    if (!re.test(q)) return null
    const brand = strip(q, re)
    if (!brand) return null
    return {
      label: clip(`Mentions: ${brand}`),
      route: '/analyse',
      type: 'brand-monitor',
      payload: { brand },
      score: 0.85,
    }
  },

  // autonome-run — "autonome", "autopilot", "run autonome"
  (q) => {
    const re = /^(autonome|autopilot|self-?run)(\s+(run|go|start|tick))?\s*/i
    if (!re.test(q)) return null
    const note = strip(q, re)
    return {
      label: note ? clip(`Autonome run: ${note}`) : 'Autonome run',
      route: '/autonome',
      type: 'autonome-run',
      payload: note ? { note } : {},
      score: 0.95,
    }
  },
  (q) => {
    const re = /^run\s+(the\s+)?(autonome|autopilot)\s*/i
    if (!re.test(q)) return null
    return {
      label: 'Autonome run',
      route: '/autonome',
      type: 'autonome-run',
      payload: {},
      score: 0.9,
    }
  },

  // memory-consolidate — "consolidate memory", "remember X", "save to memory"
  (q) => {
    const re = /^(consolidate|compact|sweep)\s+(my\s+)?memory\s*/i
    if (!re.test(q)) return null
    return {
      label: 'Consolidate memory',
      route: '/brain',
      type: 'memory-consolidate',
      payload: {},
      score: 0.95,
    }
  },
  (q) => {
    const re = /^remember\s+(that\s+)?/i
    if (!re.test(q)) return null
    const fact = strip(q, re)
    if (!fact) return null
    return {
      label: clip(`Remember: ${fact}`),
      route: '/brain',
      type: 'memory-consolidate',
      payload: { fact },
      score: 0.85,
    }
  },
]

// ────────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────────

/**
 * Parse a free-text query and return every candidate intent, highest score
 * first.  Returns an empty array when nothing matches.
 *
 * The palette UI uses the first result as the default action and shows the
 * rest as additional options.
 */
export function parseIntents(rawQuery: string): Intent[] {
  const q = rawQuery.trim()
  if (!q) return []
  const hits: Intent[] = []
  for (const rule of RULES) {
    const hit = rule(q)
    if (hit) hits.push(hit)
  }
  return hits.sort((a, b) => b.score - a.score)
}

/**
 * Convenience: return the single best intent, or null.  Kept for backwards
 * compatibility with the original PR #6 palette which only used the top hit.
 */
export function parseIntent(rawQuery: string): Intent | null {
  return parseIntents(rawQuery)[0] ?? null
}

/** Exported for tests — every AgentTaskType the parser knows how to emit. */
export const SUPPORTED_TASK_TYPES: ReadonlySet<AgentTaskType> = new Set<AgentTaskType>([
  'research',
  'write',
  'build-app',
  'build-site',
  'publish',
  'analyse',
  'generate-video',
  'generate-image',
  'lead-scrape',
  'email-campaign',
  'financial-analysis',
  'brand-monitor',
  'autonome-run',
  'memory-consolidate',
])
