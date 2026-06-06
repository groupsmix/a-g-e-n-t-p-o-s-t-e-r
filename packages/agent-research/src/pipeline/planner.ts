/**
 * Planner — turns a user query into N sub-questions to research.
 *
 * Why an LLM instead of static templates:
 *   The shape of a good sub-question depends entirely on what the user
 *   asked.  "Should I invest in DeFi?" decomposes into market sizing,
 *   regulatory state, and risk profile.  "How do I cold-email VCs?"
 *   decomposes into list sourcing, message templates, and reply rates.
 *   No template handles both.
 *
 * Why JSON output:
 *   Robust parsing.  Free-form text → "lol I forgot the colon" pain.
 *
 * Why we tolerate parse failures:
 *   The pipeline shouldn't die because Anthropic returned prose.
 *   Falls back to a single-question plan (just the original query).
 */

import type {
  LLMClient,
  LLMMessage,
  ResearchConfig,
  ResearchPlan,
} from '../types.js'

const SYSTEM_PROMPT = `You are a research planner. Given a user query, produce 2 to {{MAX}} sub-questions that, when answered, give a thorough, citation-ready response to the query.

Rules:
- Each sub-question must be answerable by retrieving information (from web search or stored memory).
- Sub-questions should cover different angles (definition, comparison, risk, current state, examples).
- Do NOT repeat the original query verbatim as a sub-question.
- Output STRICTLY this JSON shape and nothing else:

{"rationale":"one sentence explaining your decomposition","subQuestions":["...","..."]}`

export async function planResearch(input: {
  query: string
  llm: LLMClient
  config: ResearchConfig
  signal?: AbortSignal
}): Promise<{ plan: ResearchPlan; usage: { input: number; output: number } }> {
  const systemPrompt = SYSTEM_PROMPT.replace('{{MAX}}', String(input.config.maxSubQuestions))
  const messages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: input.query.trim() },
  ]

  const completion = await input.llm.complete({
    messages,
    model: input.config.plannerModel,
    maxTokens: 600,
    temperature: 0.3,
    signal: input.signal,
  })

  const parsed = parsePlan(completion.text, input.config.maxSubQuestions)
  const subQuestions = parsed.subQuestions.length > 0 ? parsed.subQuestions : [input.query]

  return {
    plan: {
      query: input.query,
      subQuestions,
      rationale: parsed.rationale,
    },
    usage: {
      input: completion.usage.inputTokens,
      output: completion.usage.outputTokens,
    },
  }
}

/** Lenient parser — tolerates fenced blocks and leading prose. */
function parsePlan(
  raw: string,
  max: number,
): { subQuestions: string[]; rationale?: string } {
  // Try fenced JSON first.
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidates: string[] = []
  if (fenced) candidates.push(fenced[1])
  // Then any { ... } block.
  const braced = raw.match(/\{[\s\S]*\}/)
  if (braced) candidates.push(braced[0])
  candidates.push(raw)

  for (const candidate of candidates) {
    try {
      const obj = JSON.parse(candidate) as {
        subQuestions?: unknown
        rationale?: unknown
      }
      if (Array.isArray(obj.subQuestions)) {
        const qs = obj.subQuestions
          .filter((q): q is string => typeof q === 'string')
          .map((q) => q.trim())
          .filter((q) => q.length > 0)
          .slice(0, max)
        return {
          subQuestions: qs,
          rationale: typeof obj.rationale === 'string' ? obj.rationale : undefined,
        }
      }
    } catch {
      // try next candidate
    }
  }

  return { subQuestions: [] }
}
