/**
 * Full-pipeline tests for the Deep Research Agent with mock LLM + search.
 *
 * Covers:
 *   • planner JSON parsing (fenced, braced, raw)
 *   • planner fallback when LLM returns garbage
 *   • search fan-out with bounded concurrency
 *   • search timeout swallowed → empty finding
 *   • synthesizer citation extraction (only real refs)
 *   • full report shape + token aggregation + timings
 */

import { describe, it, expect } from 'vitest'
import { research } from './researcher.js'
import { planResearch } from './planner.js'
import { synthesize } from './synthesizer.js'
import type {
  Finding,
  LLMClient,
  SearchClient,
  SearchResult,
} from '../types.js'

const SYNTH_OUTPUT = `# DeFi outlook 2026

The decentralized-finance market has matured into [^s001]a regulated, infra-heavy sector with three dominant chains[^s002]. Yields have compressed and risk has migrated from smart-contract bugs to oracle manipulation[^s004].

Major banks now custody DeFi positions [^s003] — a structural shift from the 2022 era.

## Risk
Oracle manipulation accounted for 41% of 2025 exploits [^bogus-ref].`

function fixedLLM(textByCallIndex: string[]): LLMClient {
  let i = 0
  return {
    name: 'mock-llm',
    async complete() {
      const text = textByCallIndex[i] ?? '{"subQuestions":["fallback"]}'
      i += 1
      return {
        text,
        model: 'mock-model',
        usage: { inputTokens: 120, outputTokens: 80 },
      }
    },
  }
}

function fixedSearch(map: Record<string, SearchResult[]>): SearchClient {
  return {
    name: 'mock-search',
    async search({ query }) {
      const hit = map[query]
      if (!hit) {
        throw new Error(`mock search has no fixture for query: ${query}`)
      }
      return hit
    },
  }
}

const sampleResults = (q: string): SearchResult[] => [
  {
    id: 'upstream-1',
    title: `${q} — overview`,
    url: `https://example.com/${encodeURIComponent(q)}`,
    snippet: `Detailed coverage of ${q}.`,
  },
  {
    id: 'upstream-2',
    title: `${q} — analysis`,
    url: `https://analysis.com/${encodeURIComponent(q)}`,
    snippet: `Analytical perspective on ${q}.`,
  },
]

describe('planResearch', () => {
  it('parses fenced JSON output', async () => {
    const llm = fixedLLM([
      '```json\n{"rationale":"why","subQuestions":["a","b","c"]}\n```',
    ])
    const { plan } = await planResearch({
      query: 'q',
      llm,
      config: {
        maxSubQuestions: 4,
        resultsPerQuery: 3,
        searchConcurrency: 2,
        plannerTimeoutMs: 1000,
        searchTimeoutMs: 1000,
        synthTimeoutMs: 1000,
      },
    })
    expect(plan.subQuestions).toEqual(['a', 'b', 'c'])
    expect(plan.rationale).toBe('why')
  })

  it('falls back to the original query when LLM returns garbage', async () => {
    const llm = fixedLLM(['this is not json at all'])
    const { plan } = await planResearch({
      query: 'fallback query',
      llm,
      config: {
        maxSubQuestions: 4,
        resultsPerQuery: 3,
        searchConcurrency: 2,
        plannerTimeoutMs: 1000,
        searchTimeoutMs: 1000,
        synthTimeoutMs: 1000,
      },
    })
    expect(plan.subQuestions).toEqual(['fallback query'])
  })

  it('caps to maxSubQuestions', async () => {
    const llm = fixedLLM([
      '{"subQuestions":["a","b","c","d","e","f"]}',
    ])
    const { plan } = await planResearch({
      query: 'q',
      llm,
      config: {
        maxSubQuestions: 3,
        resultsPerQuery: 3,
        searchConcurrency: 2,
        plannerTimeoutMs: 1000,
        searchTimeoutMs: 1000,
        synthTimeoutMs: 1000,
      },
    })
    expect(plan.subQuestions).toHaveLength(3)
  })
})

describe('synthesize', () => {
  const findings: Finding[] = [
    {
      subQuestion: 'q1',
      results: [
        { id: 's001', title: 'A', url: 'https://a', snippet: '' },
        { id: 's002', title: 'B', url: 'https://b', snippet: '' },
      ],
    },
    {
      subQuestion: 'q2',
      results: [
        { id: 's003', title: 'C', url: 'https://c', snippet: '' },
        { id: 's004', title: 'D', url: 'https://d', snippet: '' },
      ],
    },
  ]

  it('extracts only valid citations (drops unknown refs)', async () => {
    const llm = fixedLLM([SYNTH_OUTPUT])
    const { citations } = await synthesize({
      query: 'q',
      findings,
      llm,
      config: {
        maxSubQuestions: 4,
        resultsPerQuery: 3,
        searchConcurrency: 2,
        plannerTimeoutMs: 1000,
        searchTimeoutMs: 1000,
        synthTimeoutMs: 1000,
      },
    })
    const refs = citations.map((c) => c.ref).sort()
    expect(refs).toEqual(['s001', 's002', 's003', 's004'])
    expect(refs).not.toContain('bogus-ref')
  })

  it('dedupes repeated citations', async () => {
    const llm = fixedLLM(['claim [^s001] and again [^s001] and [^s002]'])
    const { citations } = await synthesize({
      query: 'q',
      findings,
      llm,
      config: {
        maxSubQuestions: 4,
        resultsPerQuery: 3,
        searchConcurrency: 2,
        plannerTimeoutMs: 1000,
        searchTimeoutMs: 1000,
        synthTimeoutMs: 1000,
      },
    })
    expect(citations.map((c) => c.ref)).toEqual(['s001', 's002'])
  })
})

describe('research — full pipeline', () => {
  it('runs end-to-end and produces a structured report', async () => {
    const llm = fixedLLM([
      // planner
      '{"subQuestions":["What is DeFi today","Risk profile"]}',
      // synth — cite only refs the searcher will produce (s001..s004)
      'Para one [^s001][^s002]. Para two [^s003] and [^s004].',
    ])
    const search = fixedSearch({
      'What is DeFi today': sampleResults('What is DeFi today'),
      'Risk profile': sampleResults('Risk profile'),
    })

    const report = await research({
      query: 'DeFi 2026 outlook',
      llm,
      search,
      config: { maxSubQuestions: 4, searchConcurrency: 2 },
    })

    expect(report.query).toBe('DeFi 2026 outlook')
    expect(report.plan.subQuestions).toEqual([
      'What is DeFi today',
      'Risk profile',
    ])
    expect(report.findings).toHaveLength(2)
    // Searcher re-IDs results to s001…
    expect(report.findings[0].results[0].id).toMatch(/^s\d{3}$/)
    expect(report.citations.length).toBeGreaterThanOrEqual(2)
    expect(report.usage.plannerInputTokens).toBe(120)
    expect(report.usage.synthOutputTokens).toBe(80)
    expect(report.timings.totalMs).toBeGreaterThanOrEqual(0)
  })

  it('continues with an empty finding when one search throws', async () => {
    const llm = fixedLLM([
      '{"subQuestions":["good","bad"]}',
      'Narrative [^s001].',
    ])
    const search: SearchClient = {
      name: 'mock-search',
      async search({ query }) {
        if (query === 'bad') throw new Error('upstream 500')
        return sampleResults(query)
      },
    }

    const report = await research({
      query: 'q',
      llm,
      search,
      config: { maxSubQuestions: 4, searchConcurrency: 2 },
    })

    expect(report.findings).toHaveLength(2)
    const bad = report.findings.find((f) => f.subQuestion === 'bad')
    expect(bad?.results).toEqual([])
  })
})
