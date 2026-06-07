/**
 * /api/money-machine — the auto money machine endpoint.
 *
 *   POST /api/money-machine/run    Run the full research→write→
 *                                   generate→publish chain inline and
 *                                   return the result. Use for tests
 *                                   and one-off launches.
 *
 *   POST /api/money-machine/queue  Queue the same chain through the
 *                                   normal agent_tasks queue (drained
 *                                   by the scheduled cron). Returns
 *                                   the chainId and first taskId.
 *
 *   GET  /api/money-machine/:id   Status of a chain by chainId.
 */

import { Hono } from 'hono'
import type { Env } from '../env'
import { createLogger } from '@nexus/logger'
import {
  runMoneyMachineChain,
  enqueueChainAsQueueDriven,
  type MoneyMachineChainInput,
} from '../services/money-machine-chain'

const logger = createLogger({ service: 'route:money-machine' })

const moneyMachineRoutes = new Hono<{ Bindings: Env }>()

moneyMachineRoutes.post('/run', async (c) => {
  const body = await c.req.json<MoneyMachineChainInput>().catch(() => null)
  if (!body || !body.topic || !body.niche) {
    return c.json({ error: 'topic and niche are required' }, 400)
  }
  try {
    const result = await runMoneyMachineChain(c.env, body)
    return c.json(result)
  } catch (err) {
    logger.error(
      'money-machine inline run failed',
      err instanceof Error ? err : new Error(String(err)),
    )
    return c.json(
      {
        error: 'chain failed',
        message: err instanceof Error ? err.message : String(err),
      },
      500,
    )
  }
})

moneyMachineRoutes.post('/queue', async (c) => {
  const body = await c.req.json<MoneyMachineChainInput>().catch(() => null)
  if (!body || !body.topic || !body.niche) {
    return c.json({ error: 'topic and niche are required' }, 400)
  }
  const queued = await enqueueChainAsQueueDriven(c.env, body)
  return c.json({ ...queued, status: 'queued' })
})

moneyMachineRoutes.get('/:id', async (c) => {
  const chainId = c.req.param('id')
  const tasks = await c.env.DB
    .prepare(
      `SELECT id, type, status, error, created_at, updated_at,
              actual_cost_usd, duration_ms
       FROM agent_tasks
       WHERE agent_id = ?
       ORDER BY created_at ASC`,
    )
    .bind(`chain:${chainId}`)
    .all()
  return c.json({ chainId, tasks: tasks.results ?? [] })
})

export { moneyMachineRoutes }
