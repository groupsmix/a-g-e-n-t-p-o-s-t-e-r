import { describe, it, expect } from 'vitest'
import { runDocsWriter } from './docs-writer.js'

const snap = {
  name: 'foo',
  description: 'A foo tool',
  files: ['src/index.ts', 'package.json', 'README.md'],
  keyFiles: [
    { path: 'package.json', content: '{ "name": "foo" }' },
    { path: 'src/index.ts', content: 'export function foo() {}' },
  ],
  language: 'ts',
}

describe('runDocsWriter (no LLM)', () => {
  it('produces all four docs with stub bodies', async () => {
    const r = await runDocsWriter({ snapshot: snap })
    expect(r.docs.map((d) => d.kind).sort()).toEqual(['api', 'architecture', 'contributing', 'readme'])
    expect(r.docs.find((d) => d.kind === 'readme')!.content).toContain('foo')
  })

  it('respects kinds filter', async () => {
    const r = await runDocsWriter({ snapshot: snap, kinds: ['readme'] })
    expect(r.docs).toHaveLength(1)
    expect(r.docs[0]!.kind).toBe('readme')
  })

  it('falls back to stub when LLM throws', async () => {
    const llm = { async complete() { throw new Error('rate limited') } }
    const r = await runDocsWriter({ snapshot: snap, kinds: ['readme'] }, { llm })
    expect(r.docs[0]!.content).toContain('foo')
  })

  it('throws without snapshot and without fetcher', async () => {
    await expect(runDocsWriter({ repo: 'a/b' })).rejects.toThrow(/fetcher/)
  })
})
