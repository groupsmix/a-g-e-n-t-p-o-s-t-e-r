// ============================================================
// Tiered Publish Gate
// ============================================================
// Maps a product's 0-10 quality score onto a publishing decision.
//
//   score < reject_below          -> 'reject'  (not worth keeping)
//   reject_below <= score < pub_at -> 'draft'   (build & keep, never auto-publish)
//   score >= pub_at                -> 'publish' (eligible for Sleep Mode auto-publish)
//
// Defaults follow the operator rule:
//   reject below 7.5, draft 7.5-8.4, publish 8.5+
//
// The decision is pure and unit-testable; callers handle DB / publishing.

export type PublishTier = 'reject' | 'draft' | 'publish'

export interface GateThresholds {
  /** Scores strictly below this are rejected. */
  rejectBelow: number
  /** Scores at or above this are eligible for auto-publish. */
  publishAt: number
}

export const DEFAULT_GATE: GateThresholds = {
  rejectBelow: 7.5,
  publishAt: 8.5,
}

export interface GateDecision {
  tier: PublishTier
  /** Status to set on the product for this tier. */
  status: 'rejected' | 'approved'
  /** Whether this tier may be auto-published (only the top tier). */
  publishEligible: boolean
  reason: string
}

/**
 * Decide the publishing tier for a score on the 0-10 scale.
 *
 * `minScore` is an optional additional floor (the existing autopilot_min_score):
 * anything below it is forced to 'reject' even if the tiered rule would allow it.
 */
export function decidePublishTier(
  score: number,
  thresholds: GateThresholds = DEFAULT_GATE,
  minScore = 0,
): GateDecision {
  const { rejectBelow, publishAt } = normalizeThresholds(thresholds)
  const floor = Number.isFinite(minScore) ? minScore : 0
  const s = Number.isFinite(score) ? score : 0

  if (s < rejectBelow || s < floor) {
    return {
      tier: 'reject',
      status: 'rejected',
      publishEligible: false,
      reason: `Score ${s.toFixed(1)} is below the reject threshold (${Math.max(rejectBelow, floor).toFixed(1)}).`,
    }
  }

  if (s < publishAt) {
    return {
      tier: 'draft',
      status: 'approved',
      publishEligible: false,
      reason: `Score ${s.toFixed(1)} is in the draft band (${rejectBelow.toFixed(1)}-${(publishAt - 0.1).toFixed(1)}); kept as a draft for manual review.`,
    }
  }

  return {
    tier: 'publish',
    status: 'approved',
    publishEligible: true,
    reason: `Score ${s.toFixed(1)} meets the publish threshold (${publishAt.toFixed(1)}+); eligible for Sleep Mode publishing.`,
  }
}

/** Guard against bad config: keep rejectBelow <= publishAt and clamp to 0-10. */
function normalizeThresholds(t: GateThresholds): GateThresholds {
  const clamp = (n: number, fallback: number) =>
    Number.isFinite(n) ? Math.min(10, Math.max(0, n)) : fallback
  let rejectBelow = clamp(t.rejectBelow, DEFAULT_GATE.rejectBelow)
  let publishAt = clamp(t.publishAt, DEFAULT_GATE.publishAt)
  if (rejectBelow > publishAt) {
    // Swap rather than silently drop a tier.
    ;[rejectBelow, publishAt] = [publishAt, rejectBelow]
  }
  return { rejectBelow, publishAt }
}
