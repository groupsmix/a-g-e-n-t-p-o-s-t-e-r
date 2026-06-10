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
 *
 * ── Authentication ─────────────────────────────────────────────────────
 * Every route here triggers paid Anthropic + Replicate + publisher
 * actions. The global access gate at index.ts only kicks in once the
 * owner sets a password. To prevent wallet drain while unprotected,
 * THIS router enforces its own static-token gate on every request:
 *
 *   Authorization: Bearer <MONEY_MACHINE_TOKEN>
 *
 * If MONEY_MACHINE_TOKEN is unset, every endpoint returns 503 — fail
 * closed. There is no "open mode" for money-machine.
 */

import { Hono } from 'hono'
import type { Env } from '../env'
import { createLogger } from '@posteragent/logger/workers'
import {
  runMoneyMachineChain,
  enqueueChainAsQueueDriven,
  validateChainInput,
  type MoneyMachineChainInput,
} from '../services/money-machine-chain'

const logger = createLogger({ service: 'route:money-machine' })

const moneyMachineRoutes = new Hono<{ Bindings: Env }>()

// ─── Auth gate ────────────────────────────────────────────────────────────
//
// Constant-time string compare to avoid leaking the token length / prefix
// through timing differences. We deliberately do NOT fall through to the
// global access gate — money-machine requires the dedicated token even when
// the dashboard password is set.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

moneyMachineRoutes.use('*', async (c, next) => {
  const expected = c.env.MONEY_MACHINE_TOKEN
  if (!expected) {
    // Fail closed. Without the token configured, the routes do nothing.
    return c.json(
      {
        error: 'money_machine_disabled',
        message:
          'Set MONEY_MACHINE_TOKEN as a Worker secret to enable the money-machine routes.',
      },
      503,
    )
  }
  const auth = c.req.header('Authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token || !timingSafeEqual(token, expected)) {
    return c.json({ error: 'unauthorized' }, 401)
  }
  return next()
})

moneyMachineRoutes.post('/run', async (c) => {
  const body = await c.req.json<MoneyMachineChainInput>().catch(() => null)
  if (!body) {
    return c.json({ error: 'invalid_json' }, 400)
  }
  const validation = validateChainInput(body)
  if (!validation.ok) {
    return c.json({ error: 'invalid_input', message: validation.error }, 400)
  }
  try {
    const result = await runMoneyMachineChain(c.env, validation.input)
    return c.json(result)
  } catch (err) {
    // Log the full detail server-side but never echo it back — error
    // messages from upstream (D1 / Anthropic / publisher) can leak SQL,
    // internal IDs, file paths, and auth fragments.
    logger.error(
      'money-machine inline run failed',
      err instanceof Error ? err : new Error(String(err)),
    )
    return c.json({ error: 'chain_failed' }, 500)
  }
})

moneyMachineRoutes.post('/queue', async (c) => {
  const body = await c.req.json<MoneyMachineChainInput>().catch(() => null)
  if (!body) {
    return c.json({ error: 'invalid_json' }, 400)
  }
  const validation = validateChainInput(body)
  if (!validation.ok) {
    return c.json({ error: 'invalid_input', message: validation.error }, 400)
  }
  try {
    const queued = await enqueueChainAsQueueDriven(c.env, validation.input)
    return c.json({ ...queued, status: 'queued' })
  } catch (err) {
    logger.error(
      'money-machine queue enqueue failed',
      err instanceof Error ? err : new Error(String(err)),
    )
    return c.json({ error: 'enqueue_failed' }, 500)
  }
})

moneyMachineRoutes.get('/:id', async (c) => {
  const chainId = c.req.param('id')
  try {
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
  } catch (err) {
    logger.error(
      'money-machine chain status query failed',
      err instanceof Error ? err : new Error(String(err)),
      { chainId },
    )
    return c.json({ error: 'lookup_failed' }, 500)
  }
})

export { moneyMachineRoutes }
