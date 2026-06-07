import { describe, it, expect, vi } from 'vitest'
import { runPublisher, drainScheduled } from './publisher.js'
import { normaliseJob } from './normaliser.js'

const ok = (platform: any) => ({
  platform,
  async publish() {
    return { ok: true, platform, postId: 'p1', url: `https://${platform}/p1` }
  },
})
const fail = (platform: any) => ({
  platform,
  async publish() { throw new Error('rate limit') },
})

describe('normaliseJob', () => {
  it('fills idempotency key when missing', () => {
    const j = normaliseJob({ platform: 'x', title: 't', parts: ['a', 'b'] } as any)
    expect(j.idempotencyKey).toMatch(/^x:/)
  })
  it('keeps idempotency key when present', () => {
    const j = normaliseJob({ platform: 'x', title: 't', parts: ['a'], idempotencyKey: 'fixed' } as any)
    expect(j.idempotencyKey).toBe('fixed')
  })
})

describe('runPublisher', () => {
  it('routes jobs to matching adapters', async () => {
    const report = await runPublisher(
      { jobs: [
        { platform: 'x', title: 'a', parts: ['hi'] } as any,
        { platform: 'linkedin', title: 'b', parts: ['hi'] } as any,
      ] },
      { adapters: [ok('x'), ok('linkedin')] },
    )
    expect(report.results.every((r) => r.ok)).toBe(true)
  })

  it('records unrouted jobs', async () => {
    const report = await runPublisher(
      { jobs: [{ platform: 'tiktok', title: 'a', parts: ['hi'] } as any] },
      { adapters: [ok('x')] },
    )
    expect(report.unrouted).toHaveLength(1)
  })

  it('catches adapter exceptions', async () => {
    const report = await runPublisher(
      { jobs: [{ platform: 'x', title: 'a', parts: ['hi'] } as any] },
      { adapters: [fail('x')] },
    )
    expect(report.results[0]!.ok).toBe(false)
    expect(report.results[0]!.error).toContain('rate limit')
  })

  it('future jobs are marked scheduled without dispatch', async () => {
    const publish = vi.fn(async (_job: any) => ({ ok: true, platform: 'x', postId: 'x1' }))
    const report = await runPublisher(
      { jobs: [{ platform: 'x', title: 'a', parts: ['hi'], publishAt: new Date(Date.now() + 60_000).toISOString() } as any] },
      { adapters: [{ platform: 'x', publish } as any] },
    )
    expect(report.results[0]!.scheduled).toBe(true)
    expect(publish).not.toHaveBeenCalled()
  })

  it('drainScheduled with empty store returns empty report', async () => {
    const r = await drainScheduled({ adapters: [ok('x')] })
    expect(r.results).toEqual([])
  })
})
