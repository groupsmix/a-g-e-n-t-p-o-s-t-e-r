import { describe, it, expect } from 'vitest'
import { InMemoryFirecrawl } from '../adapters/inmemory'
import { gatherContext } from './index'

describe('firecrawl helpers', () => {
  it('gatherContext concatenates search hits', async () => {
    const fc = new InMemoryFirecrawl()
    fc.setPage('https://a.example/p1', '# Acme launches X', 'Acme launches X')
    fc.setPage('https://b.example/p2', '# Unrelated', 'unrelated')
    const ctx = await gatherContext(fc, 'acme')
    expect(ctx).toContain('Acme launches X')
    expect(ctx).not.toContain('Unrelated')
  })

  it('monitorUrl flags change between snapshots', async () => {
    const fc = new InMemoryFirecrawl()
    fc.setPage('https://x.example', 'price: $19.99\nstock: 5')
    const first = await fc.monitorUrl({ url: 'https://x.example' })
    expect(first.changed).toBe(false)
    fc.setPage('https://x.example', 'price: $14.99\nstock: 2')
    const second = await fc.monitorUrl({ url: 'https://x.example', previous_markdown: first.markdown })
    expect(second.changed).toBe(true)
  })
})
