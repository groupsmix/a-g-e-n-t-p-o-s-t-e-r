/**
 * Extractor — mines patterns from a batch of videos.
 *
 *  1. titlePatterns — bucket titles into normalised templates so the
 *     dashboard can show "this niche right now is mostly 'How to X' and
 *     'X vs Y' content". Pure regex + token shape, no LLM.
 *
 *  2. hooks — picks a hook style from the title's opening words and
 *     (optionally) the first line of transcript. No LLM either; cheap
 *     heuristics that get 80% of the value.
 *
 *  3. thumbnails — heuristic descriptors based on URL hints; the real
 *     pipeline would run a vision model, but we surface enough signal
 *     for the dashboard to flag dominant patterns.
 *
 *  4. velocity — viewsPerHour and engagementRate, the two most useful
 *     scoring axes when ranking gaps later.
 */

import type {
  HookStyle,
  ThumbnailPattern,
  TitlePattern,
  TranscriptSource,
  VelocityMetric,
  Video,
} from '../types.js'

// ─── Title patterns ───────────────────────────────────────────────────

const TITLE_TEMPLATES: Array<{ template: string; rx: RegExp }> = [
  { template: 'How to X', rx: /^how\s+to\b/i },
  { template: 'I tried X (for Y)', rx: /^i\s+tried\b/i },
  { template: 'X vs Y', rx: /\bvs\b|\bversus\b/i },
  { template: 'Top N X', rx: /^top\s+\d+\b/i },
  { template: 'N Things X', rx: /^\d+\s+(things|ways|reasons|tips)\b/i },
  { template: 'Why X', rx: /^why\s+/i },
  { template: 'The truth about X', rx: /^the\s+truth\s+about\b/i },
  { template: 'X explained', rx: /\bexplained\b/i },
  { template: 'Day in the life', rx: /\bday\s+in\s+the\s+life\b/i },
  { template: 'X review', rx: /\breview\b/i },
  { template: 'X tutorial', rx: /\btutorial\b/i },
  { template: 'Honest reaction', rx: /\breaction\b/i },
]

export function extractTitlePatterns(videos: Video[]): TitlePattern[] {
  const buckets = new Map<string, { count: number; videos: Video[] }>()
  for (const v of videos) {
    let matched = 'Other'
    for (const t of TITLE_TEMPLATES) {
      if (t.rx.test(v.title)) {
        matched = t.template
        break
      }
    }
    const cur = buckets.get(matched) ?? { count: 0, videos: [] }
    cur.count += 1
    cur.videos.push(v)
    buckets.set(matched, cur)
  }
  return Array.from(buckets.entries())
    .map(([template, b]): TitlePattern => ({
      template,
      count: b.count,
      medianViews: median(b.videos.map((v) => v.views ?? 0)),
      examples: b.videos.slice(0, 3).map((v) => ({
        id: v.id,
        title: v.title,
        views: v.views,
      })),
    }))
    .sort((a, b) => b.count - a.count)
}

// ─── Hooks ────────────────────────────────────────────────────────────

const HOOK_RULES: Array<{ kind: string; test: (s: string) => boolean }> = [
  { kind: 'question', test: (s) => /^(what|why|how|when|did|do|does|is|are|can|should)\b/i.test(s) },
  { kind: 'cold-open-claim', test: (s) => /^(this|that)\s+(is|will|just|literally)/i.test(s) },
  { kind: 'stat-shock', test: (s) => /^[\d$%]/i.test(s) },
  { kind: 'list-tease', test: (s) => /^(here\s+are|i'll\s+show|let\s+me\s+show)/i.test(s) },
  { kind: 'controversy', test: (s) => /\b(nobody|everyone|wrong|stop|never)\b/i.test(s) },
  { kind: 'story', test: () => true }, // catch-all
]

export async function extractHooks(input: {
  videos: Video[]
  transcripts?: TranscriptSource
  /** Max transcript fetches. Default 12 — they're slow. */
  maxTranscripts?: number
  signal?: AbortSignal
}): Promise<HookStyle[]> {
  const buckets = new Map<string, { count: number; videos: Array<{ id: string; title: string; firstLine?: string }> }>()
  const max = input.maxTranscripts ?? 12

  let fetched = 0
  for (const v of input.videos) {
    let firstLine = v.title
    if (input.transcripts && fetched < max) {
      fetched += 1
      try {
        const tx = await input.transcripts.fetchTranscript({
          videoId: v.id,
          signal: input.signal,
        })
        if (tx) firstLine = tx.split(/\.|\n/, 1)[0].trim() || v.title
      } catch {
        // keep title fallback
      }
    }
    const kind = HOOK_RULES.find((r) => r.test(firstLine))?.kind ?? 'story'
    const cur = buckets.get(kind) ?? { count: 0, videos: [] }
    cur.count += 1
    if (cur.videos.length < 3) {
      cur.videos.push({ id: v.id, title: v.title, firstLine })
    }
    buckets.set(kind, cur)
  }
  return Array.from(buckets.entries())
    .map(([kind, b]): HookStyle => ({
      kind,
      count: b.count,
      examples: b.videos,
    }))
    .sort((a, b) => b.count - a.count)
}

// ─── Thumbnails ───────────────────────────────────────────────────────

export function extractThumbnailPatterns(videos: Video[]): ThumbnailPattern[] {
  // URL-based heuristic placeholder — vision model is a separate concern.
  // We bucket by domain + a coarse hash of the file path so dashboards
  // can still surface "lots of similar thumbnails" without a vision pass.
  const buckets = new Map<string, ThumbnailPattern>()
  for (const v of videos) {
    const url = v.thumbnailUrl
    if (!url) continue
    const kind = url.includes('maxresdefault')
      ? 'high-res-stock'
      : url.includes('hqdefault')
        ? 'auto-grab'
        : 'custom'
    const cur = buckets.get(kind) ?? {
      kind,
      count: 0,
      examples: [],
    }
    cur.count += 1
    if (cur.examples.length < 3) {
      cur.examples.push({ id: v.id, thumbnailUrl: v.thumbnailUrl })
    }
    buckets.set(kind, cur)
  }
  return Array.from(buckets.values()).sort((a, b) => b.count - a.count)
}

// ─── Velocity ────────────────────────────────────────────────────────

export function extractVelocity(videos: Video[]): VelocityMetric[] {
  const now = Date.now()
  return videos.map((v) => {
    const ageHrs = v.publishedAt
      ? Math.max(1, (now - Date.parse(v.publishedAt)) / 3_600_000)
      : 24
    const views = v.views ?? 0
    const engagement = ((v.likes ?? 0) + (v.comments ?? 0)) / Math.max(1, views)
    return {
      videoId: v.id,
      viewsPerHour: Math.round(views / ageHrs),
      engagementRate: round(engagement, 4),
    }
  })
}

// ─── Helpers ──────────────────────────────────────────────────────────

function median(nums: number[]): number {
  if (!nums.length) return 0
  const sorted = nums.slice().sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2) return sorted[mid]
  return Math.round((sorted[mid - 1] + sorted[mid]) / 2)
}

function round(n: number, dp: number): number {
  const f = 10 ** dp
  return Math.round(n * f) / f
}
