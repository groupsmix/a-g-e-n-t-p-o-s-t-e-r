import { describe, it, expect } from 'vitest'
import { monitor } from './monitor.js'
import type { Mention, MentionSource } from '../types.js'

function makeSource(name: string, mentions: Mention[]): MentionSource {
  return {
    name,
    platform: 'reddit',
    async scan() {
      return mentions.map((m) => ({ ...m }))
    },
  }
}

describe('monitor (end-to-end with mocks)', () => {
  it('runs the full pipeline and returns a report', async () => {
    const src = makeSource('mock', [
      {
        id: 'raw1',
        platform: 'reddit',
        url: 'https://r/1',
        title: 'I love PosterAgent',
        text: 'amazing tool',
        engagement: { upvotes: 1000, comments: 50 },
      },
      {
        id: 'raw2',
        platform: 'reddit',
        url: 'https://r/2',
        title: 'PosterAgent broke for me',
        text: 'terrible experience, avoid',
        engagement: { upvotes: 5, comments: 1 },
      },
    ])
    const r = await monitor({
      brand: ['PosterAgent'],
      sources: [src],
    })
    expect(r.mentions).toHaveLength(2)
    expect(r.summary.total).toBe(2)
    expect(r.timings.totalMs).toBeGreaterThanOrEqual(0)
    expect(r.brand).toEqual(['PosterAgent'])
  })

  it('throws when brand is empty', async () => {
    await expect(
      monitor({ brand: [], sources: [makeSource('m', [])] }),
    ).rejects.toThrow(/brand/)
  })

  it('throws when no sources', async () => {
    await expect(
      monitor({ brand: ['x'], sources: [] }),
    ).rejects.toThrow(/source/i)
  })

  it('dedupes the same URL coming from brand + competitor lanes', async () => {
    const src = makeSource('s', [
      {
        id: 'dup',
        platform: 'reddit',
        url: 'https://r/dup',
        title: 't',
        text: 'x',
      },
    ])
    const r = await monitor({
      brand: ['acme'],
      competitors: ['acme'],
      sources: [src],
    })
    expect(r.mentions).toHaveLength(1)
  })
})
