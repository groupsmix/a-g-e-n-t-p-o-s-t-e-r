import { describe, it, expect } from 'vitest'
import { UnifiedQueryRouter } from './router'
import type { SqlResult, UnifiedQueryRunner } from '../types'

const fakeLocal: UnifiedQueryRunner = {
  async run(id) {
    return { columns: ['x'], rows: [{ x: id }] } as SqlResult
  },
}

describe('UnifiedQueryRouter', () => {
  it('delegates to the local runner', async () => {
    const r = new UnifiedQueryRouter({ local: fakeLocal })
    const out = await r.run('revenue_by_platform')
    expect(out.rows[0]!.x).toBe('revenue_by_platform')
  })
  it('raw requires a remote client', async () => {
    const r = new UnifiedQueryRouter({ local: fakeLocal })
    await expect(r.raw('SELECT 1')).rejects.toThrow(/not configured/)
  })
  it('raw forwards to remote when present', async () => {
    const r = new UnifiedQueryRouter({
      local: fakeLocal,
      remote: { query: async () => ({ columns: ['n'], rows: [{ n: 1 }] }) },
    })
    const out = await r.raw('SELECT 1')
    expect(out.rows[0]!.n).toBe(1)
  })
})
