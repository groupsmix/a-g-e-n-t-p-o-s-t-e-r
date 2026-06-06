/**
 * Synthesizer — turns findings into a citation-marked narrative.
 *
 * The narrative uses inline [^id] markers where id matches a
 * SearchResult.id OR a RetrievedMemory.id from one of the findings.
 * The dashboard renders these as footnotes and links them to either
 * the source URL (web) or the memory item (brain).
 *
 * Why a structured prompt with explicit refs:
 *   Free-form citation ("according to TechCrunch...") drifts.  Forcing
 *   the model to write [^s003] or [^m012] alongside every claim makes
 *   citations machine-checkable.
 *
 * Why memory hits get their own "From your memory" sub-block:
 *   The LLM treats brain hits differently — they're context the user
 *   already has, not external sources to discover.  Separating them
 *   in the prompt gives the LLM a hint to lead with what the user
 *   already knows.
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
  RetrievedMemory,
  SearchResult,
} from '../types.js'

const SYSTEM_PROMPT = `You are a research synthesizer. Given a user query, a research plan, and a set of findings (sub-questions + sources), produce a structured narrative answer.

Each finding may include two kinds of sources:
- Web results (ids start with "s") — external information from search providers.
- Memory hits (ids start with "m") — things the user already knows, retrieved from their personal memory store. Prefer to anchor the narrative in what the user already knows when relevant.

Rules:
- Cite EVERY non-trivial claim with an inline [^id] marker, where id matches one of the source ids provided.
- Multiple citations per claim are allowed: [^s001][^m004].
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

  const allWeb = input.findings.flatMap((f) => f.results)
  const allMem = input.findings.flatMap((f) => f.memories ?? [])
  const citations = extractCitations(completion.text, allWeb, allMem)

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
    if (f.results.length === 0 && (f.memories?.length ?? 0) === 0) {
      blocks.push('  (no results found)')
      continue
    }

    if (f.results.length > 0) {
      blocks.push('From web search:')
      for (const r of f.results) {
        const snippet = r.snippet.length > 400 ? `${r.snippet.slice(0, 397)}…` : r.snippet
        blocks.push(`- [^${r.id}] ${r.title}\n  url: ${r.url}\n  ${snippet}`)
      }
    }

    if (f.memories && f.memories.length > 0) {
      blocks.push('From your memory:')
      for (const m of f.memories) {
        const content = m.content.length > 400 ? `${m.content.slice(0, 397)}…` : m.content
        const tagPart = m.tags && m.tags.length ? ` tags: ${m.tags.join(', ')}` : ''
        blocks.push(`- [^${m.id}] (${m.type}) ${content}\n  source: ${m.source}${tagPart}`)
      }
    }
  }
  return blocks.join('\n')
}

function extractCitations(
  narrative: string,
  webResults: SearchResult[],
  memories: RetrievedMemory[],
): Citation[] {
  const webById = new Map(webResults.map((r) => [r.id, r]))
  const memById = new Map(memories.map((m) => [m.id, m]))
  const matches = narrative.matchAll(/\[\^([a-zA-Z0-9_-]+)\]/g)
  const seen = new Set<string>()
  const citations: Citation[] = []
  for (const m of matches) {
    const ref = m[1]
    if (seen.has(ref)) continue
    const web = webById.get(ref)
    if (web) {
      seen.add(ref)
      citations.push({ ref, url: web.url, title: web.title, kind: 'web' })
      continue
    }
    const mem = memById.get(ref)
    if (mem) {
      seen.add(ref)
      citations.push({
        ref,
        url: `memory://${ref}`,
        title: memoryTitle(mem),
        kind: 'memory',
      })
    }
  }
  return citations
}

function memoryTitle(m: RetrievedMemory): string {
  // First 80 chars of content, plus the type as a prefix label.
  const head = m.content.length > 80 ? `${m.content.slice(0, 77)}…` : m.content
  return `[${m.type}] ${head}`
}
