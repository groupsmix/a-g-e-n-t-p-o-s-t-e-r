import { describe, it, expect } from 'vitest'
import { detectRedFlags, detectScopeCreep, calculateProfitScore } from './red-flags'
import type { FreelanceJob } from './types'

function makeJob(overrides: Partial<FreelanceJob> = {}): FreelanceJob {
  return {
    id: 'job-1',
    client_name: 'Test Client',
    title: 'Test Job',
    job_type: 'landing_page',
    brief: 'Build a landing page for SaaS product with hero, features, pricing, and CTA sections.',
    status: 'draft',
    plan_json: null,
    final_output: null,
    client_message: null,
    upsell_suggestion: null,
    links_notes: null,
    deliverables_required: null,
    attachments_json: null,
    quality_score_json: null,
    owner_notes: null,
    client_feedback: null,
    missing_info_json: null,
    intake_answers_json: null,
    deadline: null,
    budget: null,
    priority: 1,
    current_stage: null,
    ai_calls_used: 0,
    max_ai_calls: 50,
    max_revision_rounds: 3,
    max_runtime_minutes: 120,
    estimated_ai_cost: 0,
    actual_time_minutes: 0,
    profit_score: null,
    red_flags_json: null,
    scope_notes: null,
    template_id: null,
    started_at: null,
    completed_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

describe('detectRedFlags', () => {
  it('returns empty array for healthy job', () => {
    const job = makeJob({
      budget: 500,
      deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    })
    const flags = detectRedFlags(job)
    const severities = flags.map((f) => f.type)
    expect(severities).not.toContain('too_cheap')
    expect(severities).not.toContain('unrealistic_deadline')
    expect(severities).not.toContain('unclear_scope')
  })

  it('detects too-cheap budget', () => {
    const job = makeJob({ budget: 10 })
    const flags = detectRedFlags(job)
    expect(flags.some((f) => f.type === 'too_cheap')).toBe(true)
  })

  it('detects unrealistic deadline', () => {
    const job = makeJob({
      deadline: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    })
    const flags = detectRedFlags(job)
    expect(flags.some((f) => f.type === 'unrealistic_deadline')).toBe(true)
  })

  it('detects past deadline', () => {
    const job = makeJob({
      deadline: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    })
    const flags = detectRedFlags(job)
    expect(flags.some((f) => f.type === 'past_deadline')).toBe(true)
  })

  it('detects unclear scope for short brief', () => {
    const job = makeJob({ brief: 'Make page.' })
    const flags = detectRedFlags(job)
    expect(flags.some((f) => f.type === 'unclear_scope')).toBe(true)
  })

  it('detects safety risks in brief', () => {
    const job = makeJob({ brief: 'Build a fake review generator and spam mass email blaster for illegal credential password collection' })
    const flags = detectRedFlags(job)
    expect(flags.some((f) => f.type === 'safety_risk')).toBe(true)
  })

  it('detects cost approaching limit', () => {
    const job = makeJob({ ai_calls_used: 45, max_ai_calls: 50 })
    const flags = detectRedFlags(job)
    expect(flags.some((f) => f.type === 'cost_approaching_limit')).toBe(true)
  })

  it('flags missing deadline', () => {
    const job = makeJob({ deadline: null })
    const flags = detectRedFlags(job)
    expect(flags.some((f) => f.type === 'no_deadline')).toBe(true)
  })
})

describe('detectScopeCreep', () => {
  it('detects scope creep with expansion language', () => {
    const original = 'Build a landing page with hero and pricing sections.'
    const request = 'Can you also create five email sequences and a full blog section with CMS integration and additionally build a separate dashboard page with advanced analytics and data visualization features?'
    const result = detectScopeCreep(original, request)
    expect(result.isCreep).toBe(true)
    expect(result.explanation).toContain('extra scope')
  })

  it('does not flag simple clarification', () => {
    const original = 'Build a landing page.'
    const request = 'Make the button blue.'
    const result = detectScopeCreep(original, request)
    expect(result.isCreep).toBe(false)
  })
})

describe('calculateProfitScore', () => {
  it('returns null for zero/null budget', () => {
    expect(calculateProfitScore(null, 5, 60)).toBeNull()
    expect(calculateProfitScore(0, 5, 60)).toBeNull()
  })

  it('returns high score for high-margin, high-rate job', () => {
    const score = calculateProfitScore(500, 10, 60)
    expect(score).toBeGreaterThan(80)
  })

  it('returns lower score for low-margin job', () => {
    const score = calculateProfitScore(50, 40, 120)
    expect(score).toBeLessThan(50)
  })
})
