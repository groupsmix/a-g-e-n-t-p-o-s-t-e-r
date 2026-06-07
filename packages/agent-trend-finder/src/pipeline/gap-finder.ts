/**
 * Gap finder — looks at clusters and surfaces under-served topics.
 *
 * Heuristics (all configurable via TrendConfig):
 *   - few-results: cluster size below a floor — high demand if median views > niche median
 *   - low-coverage: median views high but engagement low (audience wants more)
 *   - outdated: cluster's newest video older than half the window
 *
 * Demand and competition scores are 0..100, intentionally orthogonal so
 * the brief generator can pick gaps where demand > minDemandScore AND
 * competition < maxCompetitionScore.
 */

import type {
  ContentGap,
  TopicCluster,
  TrendConfig,
  VelocityMetric,
  Video,
} from '../types.js'

export interface GapFinderInput {
  clusters: TopicCluster[]
  videos: Video[]
  velocity: VelocityMetric[]
  config: TrendConfig
}

export function findGaps(input: GapFinderInput): ContentGap[] {
  const { clusters, videos, velocity, config } = input
  const byVideoVel = new Map(velocity.map((v) => [v.videoId, v]))
  const byNiche = new Map<string, Video[]>()
  for (const v of videos) {
    const arr = byNiche.get(v.niche) ?? []
    arr.push(v)
    byNiche.set(v.niche, arr)
  }

  // Per-niche reference numbers so demand scoring is relative, not absolute.
  const nicheStats = new Map<string, { medianViews: number; medianVph: number }>()
  for (const [niche, nv] of byNiche.entries()) {
    nicheStats.set(niche, {
      medianViews: median(nv.map((v) => v.views ?? 0)),
      medianVph: median(
        nv
          .map((v) => byVideoVel.get(v.id)?.viewsPerHour ?? 0),
      ),
    })
  }

  const gaps: ContentGap[] = []
  for (const c of clusters) {
    const ref = nicheStats.get(c.niche) ?? { medianViews: 1, medianVph: 1 }
    const size = c.videoIds.length
    const median = c.medianViews
    const vids = c.videoIds
      .map((id) => videos.find((v) => v.id === id))
      .filter((v): v is Video => !!v)
    const vph = median ? median / 24 : 0 // crude proxy if velocity missing
    const realVph = vids.length
      ? median0(vids.map((v) => byVideoVel.get(v.id)?.viewsPerHour ?? 0))
      : vph

    // ── few-results ────────────────────────────────────────────────
    if (size <= 2 && median >= ref.medianViews) {
      gaps.push({
        niche: c.niche,
        topic: c.label,
        clusterId: c.id,
        reason: 'few-results',
        demandScore: scaleScore(realVph, ref.medianVph),
        competitionScore: Math.min(100, size * 25),
      })
      continue
    }

    // ── low-coverage / engagement disparity ────────────────────────
    const avgEngagement = vids.length
      ? mean(vids.map((v) => byVideoVel.get(v.id)?.engagementRate ?? 0))
      : 0
    if (median >= ref.medianViews && avgEngagement < 0.01) {
      gaps.push({
        niche: c.niche,
        topic: c.label,
        clusterId: c.id,
        reason: 'low-coverage',
        demandScore: scaleScore(realVph, ref.medianVph),
        competitionScore: Math.min(100, Math.round(50 + size * 2)),
      })
      continue
    }

    // ── outdated ────────────────────────────────────────────────
    const newest = vids
      .map((v) => (v.publishedAt ? Date.parse(v.publishedAt) : 0))
      .reduce((a, b) => Math.max(a, b), 0)
    const ageHrs = newest ? (Date.now() - newest) / 3_600_000 : Infinity
    if (ageHrs > config.windowHours / 2 && median >= ref.medianViews) {
      gaps.push({
        niche: c.niche,
        topic: c.label,
        clusterId: c.id,
        reason: 'outdated',
        demandScore: scaleScore(realVph, ref.medianVph),
        competitionScore: 40,
      })
    }
  }

  return gaps.sort(
    (a, b) =>
      b.demandScore - b.competitionScore - (a.demandScore - a.competitionScore),
  )
}

function scaleScore(value: number, reference: number): number {
  if (reference <= 0) return Math.min(100, value > 0 ? 60 : 0)
  const ratio = value / reference
  // 1.0 = matching niche median → 50. 2.0 → 75. 4.0+ → cap.
  return Math.max(0, Math.min(100, Math.round(50 + Math.log2(ratio + 1e-6) * 25)))
}

function median(nums: number[]): number {
  if (!nums.length) return 0
  const s = nums.slice().sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2)
}

function median0(nums: number[]): number {
  return median(nums)
}

function mean(nums: number[]): number {
  if (!nums.length) return 0
  return nums.reduce((a, b) => a + b, 0) / nums.length
}
