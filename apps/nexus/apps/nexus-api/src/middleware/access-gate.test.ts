/**
 * T17 — Worker API auth audit. Extended for audit 1.2 (fail-closed).
 *
 * Proves the access gate protects EVERY /api route (not a hand-maintained
 * per-route list) once a password is configured, keeps the by-design-open
 * surfaces reachable, and — fail-closed — refuses everything except
 * /api/auth/* when NO password is configured. Uses a tiny in-memory KV stub
 * and Hono's app.request() so we exercise the real middleware without
 * Miniflare.
 */

import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import type { Env } from '../env'
import { accessGate } from './access-gate'

// Minimal KV stub — just the get/put slice the gate + auth helpers touch.
function kvStub(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial))
  return {
    get: async (k: string) => store.get(k) ?? null,
    put: async (k: string, v: string) => void store.set(k, v),
    delete: async (k: string) => void store.delete(k),
  }
}

function env(over: Record<string, unknown> = {}): Env {
  return { CONFIG: kvStub(), ...over } as unknown as Env
}

// Wire an /api app exactly like production: gate mounted with a wildcard,
// then a few representative routes. We deliberately do NOT declare a handler
// for every path — an unknown /api/* path must still be gated, which proves
// coverage is blanket rather than per-route.
function makeApp() {
  const api = new Hono<{ Bindings: Env }>()
  api.use('*', accessGate())
  api.get('/products', (c) => c.json({ ok: true }))
  api.get('/auth/status', (c) => c.json({ ok: true }))
  api.get('/assets/r2/:key', (c) => c.json({ ok: true }))
  api.post('/email/subscribe', (c) => c.json({ ok: true }))
  const app = new Hono<{ Bindings: Env }>()
  app.route('/api', api)
  return app
}

const PASSWORD = { ACCESS_PASSWORD: 'a-sufficiently-long-password' }

describe('access gate — fail-closed when unconfigured (audit 1.2)', () => {
  it('refuses a normal route with 403 setup_required when no password is configured', async () => {
    const res = await makeApp().request('/api/products', {}, env())
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ code: 'setup_required' })
  })

  it('refuses UNKNOWN routes too when unconfigured — fail-closed is blanket', async () => {
    const res = await makeApp().request('/api/route-that-does-not-exist', {}, env())
    expect(res.status).toBe(403)
  })

  it('refuses /api/assets/* and /api/email/subscribe when unconfigured', async () => {
    const e = env()
    expect((await makeApp().request('/api/assets/r2/abc', {}, e)).status).toBe(403)
    expect(
      (await makeApp().request('/api/email/subscribe', { method: 'POST' }, e)).status,
    ).toBe(403)
  })

  it('keeps /api/auth/* reachable when unconfigured so the owner can bootstrap', async () => {
    const res = await makeApp().request('/api/auth/status', {}, env())
    expect(res.status).toBe(200)
  })

  it('never blocks OPTIONS preflight, even when unconfigured', async () => {
    const res = await makeApp().request('/api/products', { method: 'OPTIONS' }, env())
    expect(res.status).not.toBe(403)
    expect(res.status).not.toBe(401)
  })
})

describe('access gate (T17)', () => {

  it('returns 401 auth_required for a protected route with no token once locked', async () => {
    const res = await makeApp().request('/api/products', {}, env(PASSWORD))
    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ code: 'auth_required' })
  })

  it('gates UNKNOWN /api routes too — coverage is blanket, not per-route', async () => {
    const res = await makeApp().request('/api/route-that-does-not-exist', {}, env(PASSWORD))
    expect(res.status).toBe(401)
  })

  it('allows a protected route when a valid session token is presented', async () => {
    const token = 'valid-session-token'
    const e = env({ ...PASSWORD, CONFIG: kvStub({ ['session:' + token]: '1' }) })
    const res = await makeApp().request(
      '/api/products',
      { headers: { Authorization: 'Bearer ' + token } },
      e,
    )
    expect(res.status).toBe(200)
  })

  it('rejects an invalid / expired session token', async () => {
    const res = await makeApp().request(
      '/api/products',
      { headers: { Authorization: 'Bearer not-a-real-token' } },
      env(PASSWORD),
    )
    expect(res.status).toBe(401)
  })

  it('keeps /api/auth/* and /api/assets/* open even when locked', async () => {
    const e = env(PASSWORD)
    expect((await makeApp().request('/api/auth/status', {}, e)).status).toBe(200)
    expect((await makeApp().request('/api/assets/r2/abc', {}, e)).status).toBe(200)
  })

  it('never blocks OPTIONS preflight', async () => {
    const res = await makeApp().request('/api/products', { method: 'OPTIONS' }, env(PASSWORD))
    expect(res.status).not.toBe(401)
  })

  it('treats /api/email/subscribe as open but per-IP rate-limited', async () => {
    const app = makeApp()
    const e = env(PASSWORD)
    for (let i = 0; i < 5; i++) {
      const r = await app.request('/api/email/subscribe', { method: 'POST' }, e)
      expect(r.status).toBe(200)
    }
    const throttled = await app.request('/api/email/subscribe', { method: 'POST' }, e)
    expect(throttled.status).toBe(429)
  })
})
