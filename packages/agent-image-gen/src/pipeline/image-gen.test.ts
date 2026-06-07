import { describe, it, expect } from 'vitest'
import { runImageGen } from './image-gen.js'
import { buildPrompt } from './prompt-builder.js'

describe('buildPrompt', () => {
  it('appends style suffix', async () => {
    const p = await buildPrompt({ prompt: 'a cat', style: 'photo' })
    expect(p).toContain('cinematic photography')
  })

  it('falls back when LLM throws', async () => {
    const llm = { async complete() { throw new Error('rate') } }
    const p = await buildPrompt({ prompt: 'a cat' }, llm)
    expect(p).toContain('a cat')
  })
})

describe('runImageGen (dry-run)', () => {
  it('produces one image per aspect × variant', async () => {
    const r = await runImageGen({
      prompt: 'a cat',
      aspects: ['1:1', '16:9'],
      variants: 2,
    })
    expect(r.images).toHaveLength(4)
    expect(new Set(r.images.map((i) => i.aspect))).toEqual(new Set(['1:1', '16:9']))
  })

  it('records failures without dropping successes', async () => {
    let n = 0
    const provider = {
      name: 'flaky',
      async generate(args: any) {
        n += 1
        if (n === 2) throw new Error('boom')
        return {
          id: `img_${n}`,
          prompt: args.prompt,
          aspect: args.aspect,
          imageBase64: 'AA',
          mime: 'image/png',
          provider: 'flaky',
        }
      },
    }
    const r = await runImageGen(
      { prompt: 'a cat', variants: 3 },
      { provider },
    )
    expect(r.images.length + r.failures.length).toBe(3)
    expect(r.failures.length).toBe(1)
  })
})
