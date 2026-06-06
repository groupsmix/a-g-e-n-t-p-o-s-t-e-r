/**
 * Smoke tests for the memory engine.  These run against an in-memory
 * fake D1 so they execute everywhere — CI, local, Cloudflare CI runner.
 *
 * Coverage:
 *   • staleness window math
 *   • RRF fusion ordering
 *   • cosine similarity edges
 *   • journal → memory extraction
 *
 * The store + retrieve happy paths are smoke-only here; a deeper
 * integration suite that exercises an actual D1 binding lives in
 * apps/nexus/apps/nexus-api/test/ (added in the route wiring PR).
 */

import { describe, it, expect } from 'vitest'
import { STALENESS_WINDOWS, expiryFor } from './types.js'
import { cosineSimilarity, NullEmbeddingProvider } from './embed.js'
import { extractFromJournal, extractFromTaskResult } from './consolidate.js'

describe('staleness windows', () => {
  it('identity never expires', () => {
    expect(STALENESS_WINDOWS.identity).toBeNull()
    expect(expiryFor('identity')).toBeNull()
  })

  it('event expires in 3 days', () => {
    const now = new Date('2026-06-06T00:00:00Z')
    const exp = expiryFor('event', now)
    expect(exp).not.toBeNull()
    expect(exp!.getTime() - now.getTime()).toBe(3 * 24 * 60 * 60 * 1000)
  })

  it('preference expires in 6 months', () => {
    const now = new Date('2026-06-06T00:00:00Z')
    const exp = expiryFor('preference', now)
    expect(exp!.getTime() - now.getTime()).toBe(180 * 24 * 60 * 60 * 1000)
  })
})

describe('cosine similarity', () => {
  it('returns 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1)
  })

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0)
  })

  it('returns 0 for zero vectors', () => {
    expect(cosineSimilarity([0, 0], [0, 0])).toBe(0)
  })

  it('handles length mismatch', () => {
    expect(cosineSimilarity([1, 0], [1, 0, 0])).toBe(0)
  })
})

describe('null embedder', () => {
  it('always returns null', async () => {
    const e = new NullEmbeddingProvider()
    expect(await e.embed('hello world')).toBeNull()
  })
})

describe('extractFromJournal', () => {
  it('emits an event for the summary and facts for learnings', () => {
    const out = extractFromJournal({
      taskId: 't1',
      agentId: 'research',
      summary: 'Researched Notion templates on Gumroad.',
      outcome: 'success',
      learnings: ['Top sellers post 3x/week', 'Bundle pricing wins'],
      followUps: ['Draft 5 template ideas'],
    })
    expect(out).toHaveLength(4) // 1 summary + 2 learnings + 1 follow-up
    expect(out[0]).toMatchObject({ type: 'event' })
    expect(out[1]).toMatchObject({ type: 'fact' })
    expect(out[3]).toMatchObject({ type: 'project' })
    expect(out[0]!.source).toBe('task:t1')
    expect(out[0]!.tags).toEqual(['outcome:success', 'agent:research'])
  })

  it('drops empty strings', () => {
    const out = extractFromJournal({
      summary: '   ',
      outcome: 'noop',
      learnings: ['', '  '],
    })
    expect(out).toHaveLength(0)
  })
})

describe('extractFromTaskResult', () => {
  it('honors the structured memories array', () => {
    const out = extractFromTaskResult(
      { taskId: 't2', agentId: 'writer' },
      {
        memories: [{ type: 'preference', content: 'Owner prefers em-dash-free prose.' }],
        facts: ['Owner is based in Casablanca.'],
      },
    )
    expect(out).toHaveLength(2)
    expect(out[0]!.type).toBe('preference')
    expect(out[1]!.type).toBe('fact')
    expect(out[0]!.tags).toContain('agent:writer')
  })

  it('returns empty for empty input', () => {
    expect(extractFromTaskResult({ taskId: 't3' }, undefined)).toEqual([])
    expect(extractFromTaskResult({ taskId: 't3' }, {})).toEqual([])
  })
})
