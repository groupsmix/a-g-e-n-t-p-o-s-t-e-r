import type { D1Database } from '@cloudflare/workers-types'
import type { Signal, SignalSourceType } from '@posteragent/types/nexus'

// ============================================================
// Signal Normalizer Service
// Purpose: Normalize, score, and promote signals to opportunities
// ============================================================

interface SignalRow {
  id: string
  source_type: string
  source_ref: string | null
  title: string
  extracted_audience: string | null
  extracted_problem: string | null
  evidence_json: string
  demand_score: number
  freshness_score: number
  status: string
  created_at: string
  updated_at: string
}


// ── Normalize signal from raw input ─────────────────────────────

export function normalizeSignal(
  raw: Record<string, unknown>,
  sourceType: SignalSourceType
): Omit<Signal, 'id' | 'created_at' | 'updated_at'> {
  const now = new Date().toISOString()
  
  // Extract fields based on source type
  let title = String(raw.title || raw.name || raw.query || 'Unknown Signal')
  let audience: string | null = raw.audience ? String(raw.audience) : null
  let problem: string | null = raw.problem ? String(raw.problem) : null
  let evidence: Array<{ source: string; url?: string; snippet?: string }> = []

  // Extract evidence from raw data
  if (raw.evidence && Array.isArray(raw.evidence)) {
    evidence = raw.evidence as any
  } else if (raw.sources && Array.isArray(raw.sources)) {
    evidence = (raw.sources as any[]).map((s: any) => ({
      source: s.type || s.name || 'unknown',
      url: s.url,
      snippet: s.snippet,
    }))
  }

  // Compute demand score based on evidence strength
  const demandScore = computeDemandScore(evidence, raw)

  // Compute freshness score based on age
  const freshnessScore = computeFreshnessScore(String(raw.timestamp || raw.created_at || now))

  return {
    source_type: sourceType,
    source_ref: raw.source_ref ? String(raw.source_ref) : null,
    title,
    extracted_audience: audience,
    extracted_problem: problem,
    evidence_json: JSON.stringify(evidence),
    demand_score: demandScore,
    freshness_score: freshnessScore,
    status: 'raw',
  }
}

// ── Compute demand score ───────────────────────────────────────

function computeDemandScore(
  evidence: Array<{ source: string; url?: string; snippet?: string }>,
  raw: Record<string, unknown>
): number {
  let score = 0

  // Evidence strength (0-40)
  if (evidence.length > 0) score += Math.min(20, evidence.length * 5)
  if (evidence.some((e) => e.url)) score += 10
  if (evidence.some((e) => e.snippet && e.snippet.length > 50)) score += 10

  // Volume metrics from raw data (0-30)
  if (raw.volume || raw.search_volume) {
    const volume = Number(raw.volume || raw.search_volume || 0)
    if (volume > 10000) score += 30
    else if (volume > 1000) score += 20
    else if (volume > 100) score += 10
  }

  // Trending indicator (0-20)
  if (raw.trending === true || raw.growth_rate) {
    const growthRate = Number(raw.growth_rate || 0)
    if (growthRate > 50) score += 20
    else if (growthRate > 20) score += 15
    else if (raw.trending === true) score += 10
  }

  // Competition (lower is better, so we subtract) (0-10)
  if (raw.competition_level) {
    const competition = String(raw.competition_level).toLowerCase()
    if (competition === 'low') score += 10
    else if (competition === 'medium') score += 5
  }

  return Math.min(100, score)
}

// ── Compute freshness score ───────────────────────────────────

function computeFreshnessScore(timestamp: string): number {
  const signalDate = new Date(timestamp)
  const now = new Date()
  const ageInHours = (now.getTime() - signalDate.getTime()) / (1000 * 60 * 60)

  // Freshness decays over time
  if (ageInHours < 24) return 100
  if (ageInHours < 168) return 80 // 1 week
  if (ageInHours < 720) return 50 // 1 month
  if (ageInHours < 2160) return 20 // 3 months
  return 0 // older than 3 months
}

// ── Score existing signal ─────────────────────────────────────

export async function scoreSignal(db: D1Database, signalId: string): Promise<Signal | null> {
  const signal = await db.prepare('SELECT * FROM signals WHERE id = ?')
    .bind(signalId)
    .first<SignalRow>()

  if (!signal) return null

  const evidence = JSON.parse(signal.evidence_json) as Array<{ source: string; url?: string; snippet?: string }>
  const raw = { evidence, timestamp: signal.created_at }

  const newDemandScore = computeDemandScore(evidence, raw)
  const newFreshnessScore = computeFreshnessScore(signal.created_at)

  await db.prepare(`
    UPDATE signals 
    SET demand_score = ?, freshness_score = ?, updated_at = datetime('now')
    WHERE id = ?
  `).bind(newDemandScore, newFreshnessScore, signalId).run()

  const updated = await db.prepare('SELECT * FROM signals WHERE id = ?')
    .bind(signalId)
    .first<SignalRow>()

  return updated ? mapSignalRow(updated) : null
}

// ── Promote signal to opportunity ───────────────────────────────

export async function promoteSignalToOpportunity(
  db: D1Database,
  signalId: string
): Promise<string | null> {
  const signal = await db.prepare('SELECT * FROM signals WHERE id = ?')
    .bind(signalId)
    .first<SignalRow>()

  if (!signal) return null

  const evidence = JSON.parse(signal.evidence_json) as Array<{ source: string; url?: string; snippet?: string }>

  // Create opportunity from signal
  const opportunityId = crypto.randomUUID().replace(/-/g, '')

  await db.prepare(`
    INSERT INTO opportunities (
      id, trend_name, target_buyer, product_idea, why_it_sells,
      evidence, competition_level, urgency, risk_level, suggested_format,
      difficulty, confidence_score,
      score_demand, score_competition_gap, score_buyer_urgency,
      score_ease, score_monetization, score_timing, score_safety,
      niche, source_signals, is_guess
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    opportunityId,
    signal.title,
    signal.extracted_audience || 'General audience',
    'To be defined', // Will be filled by venture factory
    signal.extracted_problem || 'Solves a market need',
    JSON.stringify(evidence),
    'medium',
    'medium',
    'low',
    'digital_product', // Default format
    'medium',
    Math.min(100, signal.demand_score + signal.freshness_score),
    Math.min(20, Math.round(signal.demand_score * 0.2)),
    10, // Default competition gap
    Math.min(15, Math.round(signal.freshness_score * 0.15)),
    10, // Default ease
    10, // Default monetization
    Math.min(10, Math.round(signal.freshness_score * 0.1)),
    5, // Default safety
    null,
    JSON.stringify([signalId]),
    0
  ).run()

  // Create a signal reference venture
  const ventureId = crypto.randomUUID().replace(/-/g, '')
  await db.prepare(`
    INSERT INTO ventures (
      id, opportunity_id, vertical, strategy, status, signal_id
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    ventureId,
    opportunityId,
    'digital', // Default vertical
    'Initial exploration from signal',
    'draft',
    signalId
  ).run()

  // Update signal status to linked
  await db.prepare(`
    UPDATE signals SET status = 'linked', updated_at = datetime('now') WHERE id = ?
  `).bind(signalId).run()

  return opportunityId
}

// ── Helper: Map signal row ─────────────────────────────────────

function mapSignalRow(row: SignalRow): Signal {
  return {
    id: row.id,
    source_type: row.source_type as Signal['source_type'],
    source_ref: row.source_ref,
    title: row.title,
    extracted_audience: row.extracted_audience,
    extracted_problem: row.extracted_problem,
    evidence_json: row.evidence_json,
    demand_score: row.demand_score,
    freshness_score: row.freshness_score,
    status: row.status as Signal['status'],
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}
