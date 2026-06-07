/**
 * /api/insights — cross-source queries exposed for the dashboard.
 *
 *   GET /:queryId?since=&until=&limit=    UnifiedQuery via D1 (or MindsDB
 *                                         when MINDSDB_URL is set).
 *   POST /raw                             raw SQL — only allowed when
 *                                         MindsDB is configured; we
 *                                         never forward raw SQL to D1.
 *
 *   queryId ∈ revenue_by_platform | revenue_by_content | leads_by_source
 *           | top_posts_by_revenue | engagement_vs_revenue
 */

import { Hono } from 'hono'
import type { Env } from '../env'
import {
  D1UnifiedQueryRunner,
  MindsDBHttpClient,
  UnifiedQueryRouter,
  type UnifiedQueryId,
} from '@posteragent/agent-mindsdb'

export const insightsRoutes = new Hono<{ Bindings: Env }>()

function buildRouter(env: Env): UnifiedQueryRouter {
  const local = new D1UnifiedQueryRunner(env.DB)
  const url = (env as unknown as Record<string, string | undefined>).MINDSDB_URL
  const auth = (env as unknown as Record<string, string | undefined>).MINDSDB_AUTH
  const remote = url ? new MindsDBHttpClient({ baseUrl: url, authHeader: auth }) : undefined
  return new UnifiedQueryRouter({ local, remote })
}

insightsRoutes.get('/:queryId', async (c) => {
  const id = c.req.param('queryId') as UnifiedQueryId
  const since = c.req.query('since')
  const until = c.req.query('until')
  const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!, 10) : undefined
  try {
    const router = buildRouter(c.env)
    const result = await router.run(id, { since, until, limit })
    return c.json({ source: 'live' as const, ...result })
  } catch (err) {
    return c.json({
      source: 'unconfigured' as const,
      columns: [],
      rows: [],
      note: err instanceof Error ? err.message : String(err),
    })
  }
})

insightsRoutes.post('/raw', async (c) => {
  try {
    const body = (await c.req.json()) as { sql: string }
    const router = buildRouter(c.env)
    const out = await router.raw(body.sql)
    return c.json(out)
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 400)
  }
})
