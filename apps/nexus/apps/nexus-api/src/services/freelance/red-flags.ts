import type { FreelanceJob, RedFlag } from './types'
import { RED_FLAG_CHECKS, SAFETY_KEYWORDS } from './types'

export function detectRedFlags(job: FreelanceJob): RedFlag[] {
  const flags: RedFlag[] = []

  // Too cheap
  const minBudget = RED_FLAG_CHECKS.min_budget[job.job_type as keyof typeof RED_FLAG_CHECKS.min_budget]
  if (job.budget !== null && minBudget && job.budget < minBudget) {
    flags.push({
      type: 'too_cheap',
      severity: 'warning',
      message: `Budget $${job.budget} is below minimum $${minBudget} for ${job.job_type.replace('_', ' ')}. Consider declining or negotiating.`,
    })
  }

  // Unrealistic deadline
  if (job.deadline) {
    const hoursUntil = (new Date(job.deadline).getTime() - Date.now()) / (1000 * 60 * 60)
    if (hoursUntil < RED_FLAG_CHECKS.min_deadline_hours && hoursUntil > 0) {
      flags.push({
        type: 'unrealistic_deadline',
        severity: 'critical',
        message: `Deadline is less than ${RED_FLAG_CHECKS.min_deadline_hours} hours away. High risk of rushed, low-quality output.`,
      })
    }
    if (hoursUntil < 0) {
      flags.push({
        type: 'past_deadline',
        severity: 'critical',
        message: 'Deadline has already passed.',
      })
    }
  }

  // Unclear brief
  if (job.brief.length < RED_FLAG_CHECKS.max_brief_length_for_unclear) {
    flags.push({
      type: 'unclear_scope',
      severity: 'warning',
      message: 'Brief is very short. Likely missing critical details — will need follow-up questions.',
    })
  }

  // Safety / legal risks
  const lower = job.brief.toLowerCase()
  const safetyHits = SAFETY_KEYWORDS.filter((kw) => lower.includes(kw))
  if (safetyHits.length > 0) {
    flags.push({
      type: 'safety_risk',
      severity: 'critical',
      message: `Brief contains risky keywords: ${safetyHits.join(', ')}. Review before proceeding.`,
    })
  }

  // Too many revisions already
  if (job.ai_calls_used > job.max_ai_calls * 0.8) {
    flags.push({
      type: 'cost_approaching_limit',
      severity: 'warning',
      message: `AI calls at ${job.ai_calls_used}/${job.max_ai_calls} (${Math.round((job.ai_calls_used / job.max_ai_calls) * 100)}%). Approaching limit.`,
    })
  }

  // No deadline set
  if (!job.deadline) {
    flags.push({
      type: 'no_deadline',
      severity: 'warning',
      message: 'No deadline set. Set one to prioritize work and avoid scope creep.',
    })
  }

  return flags
}

export function detectScopeCreep(
  originalBrief: string,
  newRequest: string,
): { isCreep: boolean; explanation: string } {
  const originalWords = originalBrief.toLowerCase().split(/\s+/).length
  const newWords = newRequest.toLowerCase().split(/\s+/).length

  // Simple heuristic: if the new request is more than 30% of the original brief length
  // and contains expansion keywords, it's likely scope creep
  const expansionKeywords = [
    'also', 'additionally', 'plus', 'and also', 'can you also',
    'one more thing', 'while you\'re at it', 'extra', 'another',
    'as well', 'on top of', 'in addition', 'more', 'few more',
    'different version', 'new version', 'change everything',
  ]
  const lowerNew = newRequest.toLowerCase()
  const hasExpansionLanguage = expansionKeywords.some((kw) => lowerNew.includes(kw))
  const isSubstantial = newWords > 20

  if (hasExpansionLanguage && isSubstantial) {
    return {
      isCreep: true,
      explanation: `This looks like extra scope beyond the original job. Original brief was ${originalWords} words. The new request adds substantial work. Recommend discussing additional charges.`,
    }
  }

  return { isCreep: false, explanation: '' }
}

export function calculateProfitScore(
  budget: number | null,
  aiCost: number,
  timeMinutes: number,
): number | null {
  if (!budget || budget <= 0) return null

  const hourlyRate = timeMinutes > 0 ? ((budget - aiCost) / (timeMinutes / 60)) : 0
  const marginPercent = ((budget - aiCost) / budget) * 100

  // Score: 0-100 based on margin + hourly rate
  // 80%+ margin and $50+/hr effective = 100
  const marginScore = Math.min(marginPercent / 0.8, 100)
  const rateScore = Math.min(hourlyRate / 50 * 100, 100)

  return Math.round((marginScore * 0.6 + rateScore * 0.4))
}
