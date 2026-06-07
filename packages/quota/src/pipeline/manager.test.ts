import { describe, it, expect } from 'vitest'
import { QuotaManager } from './manager'
import { InMemoryQuotaStore } from '../adapters/storage'

const ms = (n: number) => new Date(n)

describe('QuotaManager', () => {
  it('allows when under limit and consumes a token', async () => {
    const store = new InMemoryQuotaStore([{ provider: 'x', action: '*', limit: 2, window_ms: 60_000 }])
    let t = 0
    const m = new QuotaManager({ store, now: () => ms(t) })
    const a = await m.acquire('x'); expect(a.allowed).toBe(true)
    const b = await m.acquire('x'); expect(b.allowed).toBe(true)
    const c = await m.acquire('x'); expect(c.allowed).toBe(false)
    expect(c.reason).toBe('window')
    expect(c.retry_at_ms).toBeGreaterThan(0)
  })

  it('expires sliding window entries', async () => {
    const store = new InMemoryQuotaStore([{ provider: 'x', action: '*', limit: 1, window_ms: 100 }])
    let t = 0
    const m = new QuotaManager({ store, now: () => ms(t) })
    await m.acquire('x')
    const blocked = await m.acquire('x'); expect(blocked.allowed).toBe(false)
    t = 150
    const ok = await m.acquire('x'); expect(ok.allowed).toBe(true)
  })

  it('enforces daily ceiling and resets at UTC midnight', async () => {
    const store = new InMemoryQuotaStore([{ provider: 'x', action: '*', limit: 100, window_ms: 60_000, daily_limit: 2 }])
    let t = Date.parse('2026-06-07T23:55:00Z')
    const m = new QuotaManager({ store, now: () => new Date(t) })
    await m.acquire('x')
    await m.acquire('x')
    const blocked = await m.acquire('x'); expect(blocked.allowed).toBe(false); expect(blocked.reason).toBe('daily')
    t = Date.parse('2026-06-08T00:01:00Z')
    const after = await m.acquire('x'); expect(after.allowed).toBe(true)
  })

  it('honours cooldown after a recorded failure', async () => {
    const store = new InMemoryQuotaStore([{ provider: 'x', action: '*', limit: 5, window_ms: 60_000, cooldown_ms: 5_000 }])
    let t = 1000
    const m = new QuotaManager({ store, now: () => new Date(t) })
    await m.acquire('x')
    await m.recordFailure('x')
    const blocked = await m.acquire('x'); expect(blocked.allowed).toBe(false); expect(blocked.reason).toBe('cooldown')
    t = 7000
    const ok = await m.acquire('x'); expect(ok.allowed).toBe(true)
  })

  it('returns Infinity allowance when no policy exists', async () => {
    const m = new QuotaManager({ store: new InMemoryQuotaStore() })
    const d = await m.acquire('unknown')
    expect(d.allowed).toBe(true)
    expect(d.remaining_in_window).toBe(Infinity)
  })
})
