import { describe, it, expect } from 'vitest'
import { writeFormats } from './writer.js'

const brief = {
  topic: 'AI tools for solopreneurs',
  angle: 'How indie hackers use Claude in 2026',
  voice: 'crisp, witty',
  audience: 'indie builders',
}

describe('writeFormats (no LLM, fallback)', () => {
  it('returns one draft per requested format', async () => {
    const r = await writeFormats(brief, ['blog', 'x-thread', 'linkedin'])
    expect(r.drafts).toHaveLength(3)
    expect(r.drafts.map((d) => d.format).sort()).toEqual(['blog', 'linkedin', 'x-thread'])
  })

  it('x-thread parts are each ≤ 280 chars', async () => {
    const r = await writeFormats(brief, ['x-thread'])
    expect(r.drafts[0]!.parts.every((p) => p.length <= 280)).toBe(true)
  })
})

describe('writeFormats parser handling', () => {
  it('parses numbered thread output from LLM', async () => {
    const llm = {
      async complete() {
        return {
          content: '1/ Hook line here.\n2/ Second beat.\n3/ Third beat.\n4/ CTA.',
          inputTokens: 10,
          outputTokens: 20,
        }
      },
    }
    const r = await writeFormats(brief, ['x-thread'], llm)
    expect(r.drafts[0]!.parts).toHaveLength(4)
    expect(r.drafts[0]!.parts[0]).toMatch(/^1\//)
    expect(r.usage.inputTokens).toBe(10)
  })

  it('parses youtube TITLE_CANDIDATES + DESCRIPTION + SCRIPT', async () => {
    const llm = {
      async complete() {
        return {
          content: `TITLE_CANDIDATES:\n1. Foo title\n2. Bar title\n3. Baz title\n\nDESCRIPTION:\nDesc text.\n\nSCRIPT:\nHook. Body. End.`,
        }
      },
    }
    const r = await writeFormats(brief, ['youtube'], llm)
    expect(r.drafts[0]!.title).toBe('Foo title')
    expect((r.drafts[0]!.meta as any).titleCandidates).toHaveLength(3)
    expect((r.drafts[0]!.meta as any).description).toContain('Desc text')
  })

  it('LLM error → fallback', async () => {
    const llm = { async complete() { throw new Error('rate') } }
    const r = await writeFormats(brief, ['blog'], llm)
    expect(r.drafts[0]!.format).toBe('blog')
    expect(r.drafts[0]!.parts[0]).toContain(brief.angle)
  })
})
