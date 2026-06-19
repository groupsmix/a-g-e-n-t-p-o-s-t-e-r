import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import type { Env } from '../env'
import { createLogger } from '@posteragent/logger/workers'

const logger = createLogger({ service: 'nexus-api', module: 'feedback-loop' })

const feedbackSchema = z.object({
  productId: z.string().uuid(),
  runId: z.string().uuid(),
  platform: z.string(),
  metrics: z.object({
    views: z.number().optional(),
    likes: z.number().optional(),
    comments: z.number().optional(),
    shares: z.number().optional(),
  }),
  status: z.enum(['published', 'failed', 'pending']),
})

export const feedbackLoopRoutes = new Hono<{ Bindings: Env }>()

feedbackLoopRoutes.post('/publish-result', zValidator('json', feedbackSchema), async (c) => {
  const body = c.req.valid('json')
  const env = c.env

  logger.info('Received publish feedback', {
    productId: body.productId,
    platform: body.platform,
    status: body.status,
  })

  try {
    // Update D1 with the publishing result
    await env.DB.prepare(
      `UPDATE products SET status = ?, metrics = ?, updated_at = ? WHERE id = ?`
    )
      .bind(
        body.status,
        JSON.stringify({ platform: body.platform, ...body.metrics }),
        new Date().toISOString(),
        body.productId
      )
      .run()

    // TODO: Trigger Mastra agent to analyze metrics and update Brain Cockpit memory
    
    return c.json({ success: true, message: 'Feedback recorded' })
  } catch (err) {
    logger.error('Failed to record feedback', err instanceof Error ? err : new Error(String(err)))
    return c.json({ error: 'Failed to record feedback' }, 500)
  }
})
