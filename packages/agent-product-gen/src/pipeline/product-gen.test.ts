import { describe, it, expect } from 'vitest'
import { runProductGen } from './product-gen.js'
import { packageProduct } from './packager.js'

describe('runProductGen (stub)', () => {
  it('runs end-to-end without LLM, dry-run listing', async () => {
    const report = await runProductGen({
      kind: 'ebook',
      topic: 'AI side projects',
      units: 4,
    })
    expect(report.outline.units).toHaveLength(4)
    expect(report.listed.ok).toBe(true)
    expect(report.packaged.assets.length).toBeGreaterThanOrEqual(5) // README + 4 chapters
  })

  it('prompt-pack bundles a prompts.json + per-file markdown', () => {
    const outline = {
      kind: 'prompt-pack' as const,
      title: 'X Prompts',
      summary: 's',
      units: [
        { title: 'A', brief: 'a' },
        { title: 'B', brief: 'b' },
      ],
    }
    const pkg = packageProduct(
      { kind: 'prompt-pack', topic: 'x' },
      outline,
      [
        { title: 'A', body: 'BODY A' },
        { title: 'B', body: 'BODY B' },
      ],
    )
    const jsonAsset = pkg.assets.find((a) => a.filename === 'prompts.json')
    expect(jsonAsset).toBeDefined()
    const parsed = JSON.parse(jsonAsset!.body as string)
    expect(parsed).toHaveLength(2)
    expect(parsed[0].title).toBe('A')
    expect(pkg.assets.filter((a) => a.filename.startsWith('prompts/'))).toHaveLength(2)
  })

  it('mini-course produces course.json + lesson files', () => {
    const pkg = packageProduct(
      { kind: 'mini-course', topic: 'rust' },
      {
        kind: 'mini-course',
        title: 'Rust 101',
        summary: '',
        units: [
          { title: 'Intro', brief: '' },
          { title: 'Ownership', brief: '' },
        ],
      },
      [
        { title: 'Intro', body: '...' },
        { title: 'Ownership', body: '...' },
      ],
    )
    expect(pkg.assets.find((a) => a.filename === 'course.json')).toBeDefined()
    expect(pkg.assets.filter((a) => /^lesson-/.test(a.filename))).toHaveLength(2)
  })

  it('list failure does not throw', async () => {
    const storefront = { async list() { throw new Error('rate limit') } }
    const report = await runProductGen(
      { kind: 'ebook', topic: 'x', units: 1 },
      { storefront },
    )
    expect(report.listed.ok).toBe(false)
    expect(report.listed.error).toContain('rate limit')
  })
})
