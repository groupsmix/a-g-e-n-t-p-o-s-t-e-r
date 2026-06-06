import { describe, it, expect } from 'vitest'
import { heuristicParse, parseSpec } from './parser.js'

describe('heuristicParse', () => {
  it('picks hono-api for a worker prompt', () => {
    const s = heuristicParse('build a Cloudflare worker API that echoes payloads')
    expect(s.template).toBe('hono-api')
    expect(s.pages.length).toBeGreaterThan(0)
  })

  it('detects features from keywords', () => {
    const s = heuristicParse('a SaaS landing with stripe checkout and posthog analytics')
    expect(s.features).toContain('payments')
    expect(s.features).toContain('analytics')
  })

  it('slugs name from quoted phrase', () => {
    const s = heuristicParse('build "Idea Forge" — a brainstorm tool')
    expect(s.name).toBe('idea-forge')
  })
})

describe('parseSpec with LLM', () => {
  it('uses LLM JSON when available', async () => {
    const llm = {
      async complete() {
        return {
          content: JSON.stringify({
            name: 'cool-tool',
            pitch: 'A cool tool',
            template: 'react-spa',
            pages: [{ path: '/', purpose: 'home' }],
            features: ['ai'],
          }),
          inputTokens: 10,
          outputTokens: 20,
        }
      },
    }
    const spec = await parseSpec('something cool', llm)
    expect(spec.name).toBe('cool-tool')
    expect(spec.template).toBe('react-spa')
  })

  it('falls back when LLM throws', async () => {
    const llm = {
      async complete() {
        throw new Error('boom')
      },
    }
    const spec = await parseSpec('a hono api for users', llm)
    expect(spec.template).toBe('hono-api')
  })
})
