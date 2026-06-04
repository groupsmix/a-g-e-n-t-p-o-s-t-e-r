import type { Env } from '../../env'
import type { FreelanceJob, PortfolioEntry } from './types'
import { UPSELL_SUGGESTIONS } from './types'
import { runAgent } from './agents'
import { logEvent, incrementAiCalls } from './events'

export async function generatePortfolioEntry(
  env: Env,
  job: FreelanceJob,
): Promise<PortfolioEntry | null> {
  if (job.status !== 'delivered' && job.status !== 'archived') return null

  try {
    await incrementAiCalls(env, job.id)
    const result = await runAgent(env, 'client_comm', `
Create a portfolio case study and testimonial request for this completed job.

JOB: ${job.title}
CLIENT: ${job.client_name}
TYPE: ${job.job_type}
BRIEF: ${job.brief.slice(0, 500)}
FINAL OUTPUT SUMMARY: ${(job.final_output ?? '').slice(0, 500)}

Return in your deliverable field a JSON with:
- challenge: 2-3 sentences describing what the client needed
- approach: 2-3 sentences describing how you solved it
- result: 2-3 sentences describing the outcome and value delivered
- testimonial_request: A short professional message asking the client for a testimonial

Keep it specific and professional. No generic filler.`)

    let parsed: Record<string, string>
    try {
      parsed = JSON.parse(result.deliverable)
    } catch {
      parsed = {
        challenge: result.summary,
        approach: `Delivered a ${job.job_type.replace('_', ' ')} for ${job.client_name}`,
        result: 'Successfully completed all deliverables on time.',
        testimonial_request: `Hi ${job.client_name}, I really enjoyed working on ${job.title}. If you're happy with the results, would you mind sharing a short testimonial? Even 1-2 sentences would be amazing for my portfolio.`,
      }
    }

    const entry: PortfolioEntry = {
      job_id: job.id,
      client_name: job.client_name,
      job_type: job.job_type,
      title: job.title,
      challenge: parsed.challenge ?? '',
      approach: parsed.approach ?? '',
      result: parsed.result ?? '',
      testimonial_request: parsed.testimonial_request ?? '',
      created_at: new Date().toISOString(),
    }

    const id = crypto.randomUUID()
    await env.DB.prepare(
      `INSERT INTO freelance_portfolio (id, job_id, client_name, job_type, title, challenge, approach, result, testimonial_request)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(id, entry.job_id, entry.client_name, entry.job_type, entry.title, entry.challenge, entry.approach, entry.result, entry.testimonial_request)
      .run()

    await logEvent(env, job.id, 'ceo', 'portfolio_created', 'Portfolio case study generated')
    return entry
  } catch {
    return null
  }
}

export function getUpsellSuggestions(jobType: string): string[] {
  return UPSELL_SUGGESTIONS[jobType as keyof typeof UPSELL_SUGGESTIONS] ?? []
}

export async function saveTemplate(
  env: Env,
  job: FreelanceJob,
  name: string,
): Promise<string> {
  const id = crypto.randomUUID()
  await env.DB.prepare(
    `INSERT INTO freelance_templates (id, name, job_type, description, source_job_id, plan_json, intake_answers_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      name,
      job.job_type,
      `Template from "${job.title}" for ${job.client_name}`,
      job.id,
      job.plan_json ?? '{}',
      job.intake_answers_json ?? null,
    )
    .run()

  await logEvent(env, job.id, 'owner', 'template_created', `Template "${name}" saved`)
  return id
}
