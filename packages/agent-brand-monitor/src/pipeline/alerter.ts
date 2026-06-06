/**
 * Alerter — detects:
 *   - negative-spike: ≥ threshold negative-labelled brand mentions in window
 *   - viral-mention: any single mention with virality ≥ threshold
 *   - competitor-action: any competitor mention with virality ≥ threshold/2
 *
 * Pure function over ScoredMention[]. Decoupled from delivery — the
 * dashboard / journal / push pipeline consumes BrandAlert[] separately.
 */

import type {
  BrandAlert,
  MonitorConfig,
  ScoredMention,
} from '../types.js'

export function detectAlerts(input: {
  scored: ScoredMention[]
  config: MonitorConfig
}): BrandAlert[] {
  const { scored, config } = input
  const alerts: BrandAlert[] = []

  // ── Negative spike (brand only) ─────────────────────────────────────
  const negativeBrand = scored.filter(
    (m) => !m.isCompetitor && m.sentiment.label === 'negative',
  )
  if (negativeBrand.length >= config.negativeSpikeThreshold) {
    alerts.push({
      kind: 'negative-spike',
      severity: negativeBrand.length >= config.negativeSpikeThreshold * 2 ? 'high' : 'medium',
      mentionIds: negativeBrand.map((m) => m.id),
      headline: `Negative sentiment spike: ${negativeBrand.length} mentions in last ${config.sinceHours}h`,
      detail:
        `Detected ${negativeBrand.length} brand mentions labelled negative in the last ${config.sinceHours}h ` +
        `(threshold ${config.negativeSpikeThreshold}). Top platforms: ` +
        topPlatforms(negativeBrand).join(', ') + '.',
    })
  }

  // ── Viral mentions (brand) ──────────────────────────────────────────
  for (const m of scored) {
    if (m.isCompetitor) continue
    if (m.virality < config.viralThreshold) continue
    alerts.push({
      kind: 'viral-mention',
      severity: m.virality >= 90 ? 'high' : 'medium',
      mentionIds: [m.id],
      headline: `Viral mention on ${m.platform}: "${truncate(m.title, 80)}"`,
      detail:
        `Virality score ${m.virality}/100, sentiment=${m.sentiment.label}. ` +
        (m.engagement
          ? `Engagement: ${formatEngagement(m.engagement)}.`
          : 'No engagement data.') +
        ` URL: ${m.url}`,
    })
  }

  // ── Competitor action ───────────────────────────────────────────────
  const compThreshold = Math.floor(config.viralThreshold / 2)
  for (const m of scored) {
    if (!m.isCompetitor) continue
    if (m.virality < compThreshold) continue
    alerts.push({
      kind: 'competitor-action',
      severity: m.virality >= config.viralThreshold ? 'high' : 'low',
      mentionIds: [m.id],
      headline: `Competitor action: ${m.matchedTerm ?? 'competitor'} on ${m.platform}`,
      detail:
        `Competitor "${m.matchedTerm ?? '?'}" mentioned with virality ${m.virality}/100. ` +
        `"${truncate(m.title, 100)}". URL: ${m.url}`,
    })
  }

  // ── First-mention (week start, etc.) ────────────────────────────────
  // We can't know this from a single scan; the journal layer dedupes
  // alerts day-over-day. So we just emit one if we have exactly one
  // brand mention in the window (likely a first sighting).
  const brandMentions = scored.filter((m) => !m.isCompetitor)
  if (brandMentions.length === 1) {
    const m = brandMentions[0]
    alerts.push({
      kind: 'first-mention',
      severity: 'low',
      mentionIds: [m.id],
      headline: `New mention on ${m.platform}: "${truncate(m.title, 80)}"`,
      detail: `One brand mention found in last ${config.sinceHours}h. ${m.url}`,
    })
  }

  return alerts
}

function topPlatforms(mentions: ScoredMention[]): string[] {
  const counts = new Map<string, number>()
  for (const m of mentions) counts.set(m.platform, (counts.get(m.platform) ?? 0) + 1)
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([p, n]) => `${p} (${n})`)
}

function formatEngagement(e: ScoredMention['engagement']): string {
  const parts: string[] = []
  if (!e) return 'none'
  if (e.upvotes != null) parts.push(`${e.upvotes} upvotes`)
  if (e.comments != null) parts.push(`${e.comments} comments`)
  if (e.views != null) parts.push(`${e.views} views`)
  if (e.shares != null) parts.push(`${e.shares} shares`)
  return parts.length ? parts.join(', ') : 'none'
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}
