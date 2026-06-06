/**
 * Synthesizer — turns findings into a citation-marked narrative.
 *
 * The narrative uses inline [^id] markers where id matches a
 * SearchResult.id from one of the findings.  The dashboard renders
 * these as footnotes and links them to the source URL.
 *
 * Why a structured prompt with explicit refs:
 *   Free-form citation ("according to TechCrunch...") drifts.  Forcing
 *   the model to write [^s003] alongside every claim makes citations
 *   machine-checkable.
 *
 * Why we extract citations post-hoc:
 *   So citations are guaranteed to match real results.  Any marker
 *   pointing at an unknown id gets dropped from the citations list
 *   even if the model wrote it.
 */

import type {
  Citation,
  Finding,
  LLMClient,
  LLMMessage,
  ResearchConfig,
} from '../types.js'

const SYSTEM_PROMPT = `You are a research synthesizer. Given a user query, a research plan, and a set of findings (sub-questions + search results), produce a structured narrative answer.

Rules:
- Cite EVERY non-trivial claim with an inline [^id] marker, where id matches one of the result ids provided.
- Multiple citations per claim are allowed: [^s001][^s003].
- Do not invent ids — only cite from the provided list.
- Note gaps explicitly when a sub-question had no useful results.
- Output Markdown. No JSON, no preamble, no "Here is the answer".
- Be specific. Numbers, dates, and named entities beat generalities.
- 3 to 8 short paragraphs.`

export async function synthesize(input: {
  query: string
  findings: Finding[]
  llm: LLMClient
  config: ResearchConfig
  signal?: AbortSignal
}): Promise<{
  narrative: string
  citations: Citation[]
  usage: { input: number; output: number }
}> {
  const findingsBlock = renderFindings(input.findings)

  const messages: LLMMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `Query: ${input.query}\n\nFindings:\n${findingsBlock}\n\nWrite the synthesized answer now.`,
    },
  ]

  const completion = await input.llm.complete({
    messages,
    model: input.config.synthModel,
    maxTokens: 2400,
    temperature: 0.4,
    signal: input.signal,
  })

  const allResults = input.findings.flatMap((f) => f.results)
  const citations = extractCitations(completion.text, allResults)

  return {
    narrative: completion.text.trim(),
    citations,
    usage: {
      input: completion.usage.inputTokens,
      output: completion.usage.outputTokens,
    },
  }
}

// ─── helpers ───────────────────────────────────────────────────────────

function renderFindings(findings: Finding[]): string {
  const blocks: string[] = []
  for (const f of findings) {
    blocks.push(`### Sub-question: ${f.subQuestion}`)
    if (f.results.length === 0) {
      blocks.push('  (no results found)')
      continue
    }
    for (const r of f.results) {
      const snippet = r.snippet.length > 400 ? `${r.snippet.slice(0, 397)}…` : r.snippet
      blocks.push(`- [^${r.id}] ${r.title}\n  url: ${r.url}\n  ${snippet}`)
    }
  }
  return blocks.join('\n')
}

function extractCitations(
  narrative: string,
  allResults: Array<{ id: string; title: string; url: string }>,
): Citation[] {
  const byId = new Map(allResults.map((r) => [r.id, r]))
  const matches = narrative.matchAll(/\[\^([a-zA-Z0-9_-]+)\]/g)
  const seen = new Set<string>()
  const citations: Citation[] = []
  for (const m of matches) {
    const ref = m[1]
    if (seen.has(ref)) continue
    const src = byId.get(ref)
    if (!src) continue
    seen.add(ref)
    citations.push({ ref, url: src.url, title: src.title })
  }
  return citations
}
