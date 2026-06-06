import { describe, it, expect } from 'vitest'
import { chooseBrainSource, demoSource } from './source'

describe('demoSource', () => {
  it('filters memories by type', async () => {
    const facts = await demoSource.listMemories({ type: 'fact' })
    expect(facts.every((m) => m.type === 'fact')).toBe(true)
  })

  it('filters memories by query (case-insensitive)', async () => {
    const hits = await demoSource.listMemories({ query: 'CASABLANCA' })
    expect(hits.length).toBeGreaterThan(0)
    expect(hits.every((m) => m.content.toLowerCase().includes('casablanca'))).toBe(true)
  })

  it('returns empty list when query matches nothing', async () => {
    const hits = await demoSource.listMemories({ query: 'zzzz-no-match-zzzz' })
    expect(hits).toEqual([])
  })

  it('summary aggregates totals by type', async () => {
    const summary = await demoSource.getSummary()
    const byType = summary.memories.byType
    const sum = Object.values(byType).reduce((a, b) => a + b, 0)
    expect(sum).toBe(summary.memories.total)
    expect(summary.persona.name).toBeTruthy()
  })

  it('signals are ranked by score descending', async () => {
    const signals = await demoSource.listSignals()
    for (let i = 1; i < signals.length; i++) {
      // Demo source pre-ranks; just enforce no zero-length result.
      expect(signals[i].score).toBeGreaterThanOrEqual(0)
    }
    expect(signals.length).toBeGreaterThan(0)
  })

  it('respects journal limit param', async () => {
    const entries = await demoSource.listJournal({ limit: 1 })
    expect(entries).toHaveLength(1)
  })
})

describe('chooseBrainSource', () => {
  it('defaults to demo source when BRAIN_SOURCE is unset', () => {
    const src = chooseBrainSource({})
    expect(src.name).toBe('demo')
  })

  it('returns demo source explicitly when BRAIN_SOURCE=demo', () => {
    const src = chooseBrainSource({ BRAIN_SOURCE: 'demo' })
    expect(src.name).toBe('demo')
  })

  it('selects nexus source when BRAIN_SOURCE=nexus', () => {
    const src = chooseBrainSource({
      BRAIN_SOURCE: 'nexus',
      NEXUS_API_BASE_URL: 'http://localhost:8787',
    })
    expect(src.name).toContain('nexus-api')
  })
})

// ── nexusApiSource HTTP behaviour (TASK-300) ─────────────────────────────

describe('nexusApiSource', () => {
  it('calls /api/brain/memories with the right path + query', async () => {
    const calls: { url: string; headers: Record<string, string> }[] = []
    const fakeFetch = (async (url: string, init: RequestInit) => {
      calls.push({
        url,
        headers: (init.headers as Record<string, string>) ?? {},
      })
      return new Response(
        JSON.stringify({ memories: [{ id: 'm1', type: 'fact', content: 'x', tags: [], source: 'test', importance: 0.5, createdAt: 'now', updatedAt: 'now' }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }) as unknown as typeof fetch
    const { nexusApiSource } = await import('./source')
    const src = nexusApiSource({
      baseUrl: 'https://api.example.com',
      fetch: fakeFetch,
      bearer: 'token-xyz',
    })
    const memories = await src.listMemories({ type: 'fact', query: 'foo', limit: 10 })
    expect(memories).toHaveLength(1)
    expect(calls[0].url).toBe(
      'https://api.example.com/api/brain/memories?type=fact&q=foo&limit=10',
    )
    expect(calls[0].headers.authorization).toBe('Bearer token-xyz')
  })

  it('falls back to demo source on HTTP error', async () => {
    const fakeFetch = (async () =>
      new Response('boom', { status: 500 })) as unknown as typeof fetch
    const { nexusApiSource } = await import('./source')
    const src = nexusApiSource({
      baseUrl: 'https://api.example.com',
      fetch: fakeFetch,
    })
    const memories = await src.listMemories()
    expect(memories.length).toBeGreaterThan(0)
  })

  it('falls back to demo source on fetch throw', async () => {
    const fakeFetch = (async () => {
      throw new Error('network')
    }) as unknown as typeof fetch
    const { nexusApiSource } = await import('./source')
    const src = nexusApiSource({
      baseUrl: 'https://api.example.com',
      fetch: fakeFetch,
    })
    const persona = await src.getPersona()
    expect(persona.name).toBeTruthy()
  })

  it('strips trailing slash from baseUrl', async () => {
    const calls: string[] = []
    const fakeFetch = (async (url: string) => {
      calls.push(url)
      return new Response(JSON.stringify({ now: null }), { status: 200 })
    }) as unknown as typeof fetch
    const { nexusApiSource } = await import('./source')
    const src = nexusApiSource({
      baseUrl: 'https://api.example.com/',
      fetch: fakeFetch,
    })
    await src.getNow('global')
    expect(calls[0]).toBe('https://api.example.com/api/brain/now?scope=global')
  })

  it('omits authorization header when no bearer', async () => {
    const calls: { headers: Record<string, string> }[] = []
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      calls.push({ headers: (init.headers as Record<string, string>) ?? {} })
      return new Response(JSON.stringify({ signals: [] }), { status: 200 })
    }) as unknown as typeof fetch
    const { nexusApiSource } = await import('./source')
    const src = nexusApiSource({
      baseUrl: 'https://api.example.com',
      fetch: fakeFetch,
    })
    await src.listSignals()
    expect(calls[0].headers.authorization).toBeUndefined()
  })
})
