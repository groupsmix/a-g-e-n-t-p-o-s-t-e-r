/**
 * Smoke test for /api/metrics/summary.  Uses a hand-rolled D1 stub since
 * worker tests in this repo don't pull in miniflare.
 */

import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import { metricsRoutes } from './metrics'

function stubDb(rows: {
  tt?: number; ty?: number; st?: number; sy?: number; agents?: number;
  hasLeads?: boolean; lt?: number; ly?: number;
}) {
  return {
    prepare(sql: string) {
      const binds: unknown[] = []
      const api: any = {
        bind(...args: unknown[]) {
          binds.push(...args)
          return api
        },
        async first<T>() {
          if (sql.includes("FROM sqlite_master")) {
            return rows.hasLeads ? ({ name: 'leads' } as unknown as T) : null
          }
          if (sql.includes('FROM leads')) {
            return { lt: rows.lt ?? 0, ly: rows.ly ?? 0 } as unknown as T
          }
          if (sql.includes('COUNT(DISTINCT agent_id)')) {
            return { n: rows.agents ?? 0 } as unknown as T
          }
          // tasks aggregate
          return {
            tt: rows.tt ?? 0,
            ty: rows.ty ?? 0,
            st: rows.st ?? 0,
            sy: rows.sy ?? 0,
          } as unknown as T
        },
      }
      return api
    },
  }
}

function makeApp(env: Record<string, unknown>) {
  const app = new Hono()
  app.route('/metrics', metricsRoutes as any)
  return { app, env }
}

describe('GET /api/metrics/summary', () => {
  it('returns live tasks + spend, unconfigured revenue when no token', async () => {
    const env = {
      DB: stubDb({ tt: 5, ty: 2, st: 1.5, sy: 0.5, agents: 3 }),
      SECRETS: { async get() { return null } },
    }
    const { app } = makeApp(env)
    const res = await app.request('/metrics/summary', {}, env)
    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(json.tasks_today.value).toBe(5)
    expect(json.tasks_today.display).toBe('5')
    expect(json.tasks_today.source).toBe('live')
    expect(json.ai_spend_today.value).toBeCloseTo(1.5)
    expect(json.active_agents.value).toBe(3)
    expect(json.revenue_24h.source).toBe('unconfigured')
    expect(json.leads_today.source).toBe('unconfigured')
  })

  it('counts leads when table exists', async () => {
    const env = {
      DB: stubDb({ hasLeads: true, lt: 4, ly: 1 }),
      SECRETS: { async get() { return null } },
    }
    const { app } = makeApp(env)
    const res = await app.request('/metrics/summary', {}, env)
    const json = (await res.json()) as any
    expect(json.leads_today.value).toBe(4)
    expect(json.leads_today.source).toBe('live')
    expect(json.leads_today.delta).toMatch(/\+/)
  })

  it('handles DB errors without throwing', async () => {
    const env = {
      DB: { prepare() { throw new Error('boom') } },
      SECRETS: { async get() { return null } },
    }
    const { app } = makeApp(env)
    const res = await app.request('/metrics/summary', {}, env)
    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(json.tasks_today.source).toBe('error')
  })
})
