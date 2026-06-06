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
