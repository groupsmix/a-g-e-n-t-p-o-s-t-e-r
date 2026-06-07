/**
 * Stage 3 — turn ideas into a 7-day grid that respects per-platform
 * cadence and platform-specific best-time-of-day defaults.
 *
 * Algorithm:
 *   - for each platform with cadence > 0, generate N evenly-spaced
 *     publish slots across the next 7 days at the platform's
 *     default hour
 *   - greedily assign the highest-scoring idea whose platforms[]
 *     includes that platform and hasn't already filled the platform
 *     this week (we prefer spread over piling onto one topic)
 */

import type {
  BrandProfile,
  ContentIdea,
  Platform,
  ScheduledPost,
} from '../types.js'

const HOURS: Record<Platform, number> = {
  blog: 14,
  x: 9,
  linkedin: 8,
  instagram: 12,
  tiktok: 19,
  youtube: 17,
  newsletter: 7,
}

const FORMATS: Record<Platform, ScheduledPost['format']> = {
  blog: 'long-form',
  x: 'thread',
  linkedin: 'post',
  instagram: 'post',
  tiktok: 'video',
  youtube: 'video',
  newsletter: 'newsletter',
}

function startOfDayUtc(d: Date): Date {
  const c = new Date(d)
  c.setUTCHours(0, 0, 0, 0)
  return c
}

function isoAt(day: Date, hour: number): string {
  const d = new Date(day)
  d.setUTCHours(hour, 0, 0, 0)
  return d.toISOString()
}

export function slotIntoCalendar(
  brand: BrandProfile,
  ideas: ContentIdea[],
  weekStart: Date = new Date(),
): { weekStart: string; schedule: ScheduledPost[] } {
  const start = startOfDayUtc(weekStart)
  const schedule: ScheduledPost[] = []
  const usedIdeas = new Set<string>()

  for (const platform of brand.platforms) {
    const n = brand.cadence[platform] ?? 0
    if (n <= 0) continue
    // pick N evenly spaced days
    const days = Array.from({ length: n }, (_, i) =>
      new Date(start.getTime() + Math.floor((i * 7) / n) * 24 * 60 * 60 * 1000),
    )
    // candidate ideas that target this platform
    const candidates = ideas
      .filter((i) => i.platforms.includes(platform) && !usedIdeas.has(i.id))
      .sort((a, b) => b.score - a.score)
    for (let i = 0; i < days.length; i++) {
      const idea = candidates[i]
      // fall back to top idea overall if we ran out
      const picked = idea ?? ideas.find((x) => !usedIdeas.has(x.id))
      if (!picked) break
      usedIdeas.add(picked.id)
      schedule.push({
        ideaId: picked.id,
        platform,
        publishAt: isoAt(days[i]!, HOURS[platform]),
        format: FORMATS[platform],
      })
    }
  }
  return { weekStart: start.toISOString(), schedule }
}
