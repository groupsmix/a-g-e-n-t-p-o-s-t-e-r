import { Hono } from 'hono'
import type { Env } from '../env'
import type { Vertical } from '@posteragent/types/nexus'
import { rateLimit } from '../middleware/rate-limit'
import {
  createVenture,
  getVentureWithMetrics,
  updateVenture,
  killVenture,
  listVenturesForOpportunity,
} from '../services/venture-service'
import { dispatchVentureFactory } from '../services/factory/factory-dispatcher'

export const ventureRoutes = new Hono<{ Bindings: Env }>()

// ── Create venture ───────────────────────────────────────────────

ventureRoutes.post('/', rateLimit(10), async (c) => {
  const body = await c.req.json<{
    opportunity_id: string
    vertical: string
    strategy: string
    budget_cap_cents?: number
    test_quota_clicks?: number
    signal_id?: string
  }>()

  if (!body.opportunity_id || !body.vertical || !body.strategy) {
    return c.json(
      { error: 'Missing required fields: opportunity_id, vertical, strategy' },
      400
    )
  }

  try {
    const venture = await createVenture(c.env.DB, { ...body, vertical: body.vertical as Vertical })
    return c.json({ venture }, 201)
  } catch (err) {
    return c.json({ error: String(err) }, 400)
  }
})

// ── List ventures for opportunity ────────────────────────────────

ventureRoutes.get('/', async (c) => {
  const opportunityId = c.req.query('opportunity_id')
  
  if (!opportunityId) {
    return c.json({ error: 'opportunity_id query parameter is required' }, 400)
  }

  const ventures = await listVenturesForOpportunity(c.env.DB, opportunityId)
  return c.json({ ventures })
})

// ── Get single venture with metrics ────────────────────────────────

ventureRoutes.get('/:id', async (c) => {
  const { id } = c.req.param()
  const result = await getVentureWithMetrics(c.env.DB, id)
  
  if (!result) {
    return c.json({ error: 'Not found' }, 404)
  }

  return c.json(result)
})

// ── Update venture ───────────────────────────────────────────────

ventureRoutes.patch('/:id', async (c) => {
  const { id } = c.req.param()
  const body = await c.req.json<{
    status?: string
    budget_cap_cents?: number
    strategy?: string
    test_quota_clicks?: number
  }>()

  try {
    const venture = await updateVenture(c.env.DB, id, body)
    
    if (!venture) {
      return c.json({ error: 'Not found' }, 404)
    }

    return c.json({ venture })
  } catch (err) {
    return c.json({ error: String(err) }, 400)
  }
})

// ── Kill venture (soft delete) ────────────────────────────────────

ventureRoutes.delete('/:id', async (c) => {
  const { id } = c.req.param()
  const body = await c.req.json<{ reason?: string }>()
  const reason = body?.reason ?? 'manual_kill'

  try {
    await killVenture(c.env.DB, id, reason)
    return c.json({ ok: true })
  } catch (err) {
    return c.json({ error: String(err) }, 400)
  }
})

// ── Build venture (dispatch to factory) ─────────────────────────────

ventureRoutes.post('/:id/build', rateLimit(3), async (c) => {
  const { id } = c.req.param()

  try {
    const result = await dispatchVentureFactory(c.env.DB, id)
    return c.json(result)
  } catch (err) {
    return c.json({ error: String(err) }, 400)
  }
})
