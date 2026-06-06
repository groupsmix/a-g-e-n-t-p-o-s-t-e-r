/**
 * Full-pipeline tests for the Deep Research Agent with mock clients.
 *
 * Covers:
 *   • planner JSON parsing (fenced, braced, raw)
 *   • planner fallback when LLM returns garbage
 *   • search fan-out with bounded concurrency
 *   • search timeout swallowed → empty finding
 *   • synthesizer citation extraction (web + memory refs)
 *   • full report shape + token aggregation + timings
 *   • TASK-401: memory-only mode (no SearchClient)
 *   • TASK-401: hybrid mode (web + memory in parallel)
 *   • TASK-401: at-least-one-lane guard
 */

import { describe, it, expect } from 'vitest'
import { research } from './researcher.js'
import { planResearch } from './planner.js'
import { synthesize } from './synthesizer.js'
import { DEFAULT_CONFIG } from '../types.js'
import type {
  Finding,
  LLMClient,
  MemoryClient,
  ResearchConfig,
  RetrievedMemory,
  SearchClient,
  SearchResult,
} from '../types.js'

const SYNTH_OUTPUT = `# DeFi outlook 2026

The decentralized-finance market has matured into [^s001]a regulated, infra-heavy sector with three dominant chains[^s002]. Yields have compressed and risk has migrated from smart-contract bugs to oracle manipulation[^s004].

Major banks now custody DeFi positions [^s003] — a structural shift from the 2022 era.

## Risk
Oracle manipulation accounted for 41% of 2025 exploits [^bogus-ref].`

function testConfig(overrides: Partial<ResearchConfig> = {}): ResearchConfig {
  return {
    ...DEFAULT_CONFIG,
    maxSubQuestions: 4,
    resultsPerQuery: 3,
    searchConcurrency: 2,
    plannerTimeoutMs: 1000,
    searchTimeoutMs: 1000,
    synthTimeoutMs: 1000,
    memoriesPerQuery: 3,
    memoryTimeoutMs: 1000,
    memoryConcurrency: 2,
    ...overrides,
  }
}

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

function fixedMemory(map: Record<string, RetrievedMemory[]>): MemoryClient {
  return {
    name: 'mock-memory',
    async retrieve({ query }) {
      return map[query] ?? []
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

const sampleMemories = (q: string): RetrievedMemory[] => [
  {
    id: 'mem-upstream-a',
    type: 'fact',
    content: `User already noted: ${q} is important to track.`,
    source: 'journal:2026-05-01',
    tags: ['research'],
    score: 0.82,
  },
  {
    id: 'mem-upstream-b',
    type: 'preference',
    content: `User prefers deep dives over surveys when researching ${q}.`,
    source: 'user',
    score: 0.61,
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
      config: testConfig(),
    })
    expect(plan.subQuestions).toEqual(['a', 'b', 'c'])
    expect(plan.rationale).toBe('why')
  })

  it('falls back to the original query when LLM returns garbage', async () => {
    const llm = fixedLLM(['this is not json at all'])
    const { plan } = await planResearch({
      query: 'fallback query',
      llm,
      config: testConfig(),
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
      config: testConfig({ maxSubQuestions: 3 }),
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
      config: testConfig(),
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
      config: testConfig(),
    })
    expect(citations.map((c) => c.ref)).toEqual(['s001', 's002'])
  })

  it('TASK-401: tags web vs memory citations with `kind`', async () => {
    const mixedFindings: Finding[] = [
      {
        subQuestion: 'q1',
        results: [{ id: 's001', title: 'Web src', url: 'https://w', snippet: '' }],
        memories: [
          {
            id: 'm001',
            type: 'fact',
            content: 'Brain note about the topic',
            source: 'journal:2026-06-01',
          },
        ],
      },
    ]
    const llm = fixedLLM(['Web claim [^s001]. Brain context [^m001].'])
    const { citations } = await synthesize({
      query: 'q',
      findings: mixedFindings,
      llm,
      config: testConfig(),
    })
    const web = citations.find((c) => c.ref === 's001')
    const mem = citations.find((c) => c.ref === 'm001')
    expect(web?.kind).toBe('web')
    expect(web?.url).toBe('https://w')
    expect(mem?.kind).toBe('memory')
    expect(mem?.url).toBe('memory://m001')
    expect(mem?.title).toContain('[fact]')
  })

  it('TASK-401: prompt mentions both lanes when memories present', async () => {
    let captured = ''
    const mixedFindings: Finding[] = [
      {
        subQuestion: 'q1',
        results: [{ id: 's001', title: 'Web', url: 'https://w', snippet: 'web body' }],
        memories: [
          {
            id: 'm001',
            type: 'fact',
            content: 'Memory body content',
            source: 'journal:2026-06-01',
            tags: ['t1', 't2'],
          },
        ],
      },
    ]
    const capturingLLM: LLMClient = {
      name: 'capturing',
      async complete({ messages }) {
        captured = messages.map((m) => m.content).join('\n---\n')
        return {
          text: '[^s001][^m001]',
          model: 'm',
          usage: { inputTokens: 1, outputTokens: 1 },
        }
      },
    }
    await synthesize({
      query: 'q',
      findings: mixedFindings,
      llm: capturingLLM,
      config: testConfig(),
    })
    expect(captured).toContain('From web search:')
    expect(captured).toContain('From your memory:')
    expect(captured).toContain('Memory body content')
    expect(captured).toContain('tags: t1, t2')
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
    expect(report.timings.memoryMs).toBe(0) // no memory client provided
    // Web-only — memories should be undefined on findings
    expect(report.findings[0].memories).toBeUndefined()
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

  // ─── TASK-401: memory lane ─────────────────────────────────────────

  it('TASK-401: throws when neither search nor memory is provided', async () => {
    const llm = fixedLLM(['{"subQuestions":["x"]}', 'narrative'])
    await expect(
      research({ query: 'q', llm }),
    ).rejects.toThrow(/at least one of/i)
  })

  it('TASK-401: memory-only mode produces a report with brain citations only', async () => {
    const llm = fixedLLM([
      '{"subQuestions":["What does the user know about X","User preferences"]}',
      'Brain context [^m001] and [^m003].',
    ])
    const memory = fixedMemory({
      'What does the user know about X': sampleMemories('X'),
      'User preferences': sampleMemories('Y'),
    })

    const report = await research({
      query: 'What do I think about X',
      llm,
      memory,
      config: { maxSubQuestions: 4 },
    })

    expect(report.findings).toHaveLength(2)
    // Memory-only — results array empty, memories present + stamped m001…
    expect(report.findings[0].results).toEqual([])
    expect(report.findings[0].memories?.[0].id).toMatch(/^m\d{3}$/)
    expect(report.findings[0].memories).toHaveLength(2)
    // Citations all kind=memory
    expect(report.citations.length).toBeGreaterThan(0)
    for (const c of report.citations) {
      expect(c.kind).toBe('memory')
      expect(c.url.startsWith('memory://')).toBe(true)
    }
    expect(report.timings.searchMs).toBe(0)
    expect(report.timings.memoryMs).toBeGreaterThanOrEqual(0)
  })

  it('TASK-401: hybrid mode runs web + memory in parallel and produces mixed citations', async () => {
    const llm = fixedLLM([
      '{"subQuestions":["sq-one","sq-two"]}',
      'Web claim [^s001]. Brain context [^m001]. Another web [^s003].',
    ])
    const search = fixedSearch({
      'sq-one': sampleResults('sq-one'),
      'sq-two': sampleResults('sq-two'),
    })
    const memory = fixedMemory({
      'sq-one': sampleMemories('sq-one'),
      'sq-two': sampleMemories('sq-two'),
    })

    const report = await research({
      query: 'hybrid query',
      llm,
      search,
      memory,
      config: { maxSubQuestions: 4 },
    })

    expect(report.findings).toHaveLength(2)
    // Each finding has BOTH lanes populated
    expect(report.findings[0].results.length).toBeGreaterThan(0)
    expect(report.findings[0].memories?.length).toBeGreaterThan(0)
    // Mixed citations
    const kinds = new Set(report.citations.map((c) => c.kind))
    expect(kinds.has('web')).toBe(true)
    expect(kinds.has('memory')).toBe(true)
    // Both lanes have timings
    expect(report.timings.searchMs).toBeGreaterThanOrEqual(0)
    expect(report.timings.memoryMs).toBeGreaterThanOrEqual(0)
  })

  it('TASK-401: memory lane errors do not kill the run', async () => {
    const llm = fixedLLM([
      '{"subQuestions":["good","bad"]}',
      'Narrative [^m001].',
    ])
    const memory: MemoryClient = {
      name: 'flaky',
      async retrieve({ query }) {
        if (query === 'bad') throw new Error('D1 down')
        return sampleMemories(query)
      },
    }

    const report = await research({
      query: 'q',
      llm,
      memory,
      config: { maxSubQuestions: 4 },
    })

    expect(report.findings).toHaveLength(2)
    const good = report.findings.find((f) => f.subQuestion === 'good')
    const bad = report.findings.find((f) => f.subQuestion === 'bad')
    expect(good?.memories?.length).toBeGreaterThan(0)
    expect(bad?.memories).toEqual([])
  })
})
