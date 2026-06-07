import { describe, it, expect } from 'vitest'
import { runVideoFactory } from './video-factory.js'
import { planScenes } from './planner.js'
import { generateCaptions, toSrt } from './captions.js'

const brief = {
  topic: 'AI for indie hackers',
  hook: 'Claude launches new agents API',
  script: 'Anthropic just shipped agents. Here is why it matters. You can now wire long tasks.',
  data: [{ label: 'tokens', value: 100 }, { label: 'users', value: 50 }],
  product: { name: 'Agent Starter Kit', bullets: ['x', 'y'] },
} as const

describe('planScenes', () => {
  it('always opens with the hook as a quote-card', async () => {
    const story = await planScenes(brief as any)
    expect(story.scenes[0]!.kind).toBe('quote-card')
    expect(story.scenes[0]!.caption).toBe(brief.hook)
  })

  it('includes data-viz and product-showcase when supplied', async () => {
    const story = await planScenes(brief as any)
    const kinds = story.scenes.map((s) => s.kind)
    expect(kinds).toContain('data-viz')
    expect(kinds).toContain('product-showcase')
  })

  it('news-reel triggers on launch-like hook', async () => {
    const story = await planScenes(brief as any)
    expect(story.scenes.map((s) => s.kind)).toContain('news-reel')
  })

  it('respects allowKinds filter', async () => {
    const story = await planScenes(brief as any, { allowKinds: ['quote-card', 'text-carousel'] })
    for (const s of story.scenes) {
      expect(['quote-card', 'text-carousel']).toContain(s.kind)
    }
  })

  it('scales scene durations to brief.durationSec', async () => {
    const story = await planScenes({ ...(brief as any), durationSec: 45 })
    const total = story.scenes.reduce((a, b) => a + b.durationSec, 0)
    expect(Math.abs(total - 45)).toBeLessThan(0.5)
  })
})

describe('captions', () => {
  it('produces cues covering the storyboard length', async () => {
    const story = await planScenes(brief as any)
    const cues = generateCaptions(story)
    expect(cues.length).toBeGreaterThan(0)
    expect(cues[cues.length - 1]!.end).toBeGreaterThan(0)
    expect(toSrt(cues)).toMatch(/-->/)
  })
})

describe('runVideoFactory', () => {
  it('storyboardOnly skips render', async () => {
    const r = await runVideoFactory({ brief: brief as any, storyboardOnly: true })
    expect(r.render.ok).toBe(true)
    expect(r.render.videoBase64).toBeUndefined()
  })

  it('dry-run render succeeds without uploader', async () => {
    const r = await runVideoFactory({ brief: brief as any })
    expect(r.render.ok).toBe(true)
    expect(r.upload).toBeUndefined()
  })
})
