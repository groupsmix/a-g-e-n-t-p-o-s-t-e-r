import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import type { Env } from '../env'
import { createLogger } from '@posteragent/logger/workers'
import { ProductWorkflow } from '../services/workflow-engine'

const logger = createLogger({ service: 'nexus-api', module: 'brain-bridge' })

const intentionSchema = z.object({
  topic: z.string().min(1),
  tone: z.string().optional(),
  targetPlatforms: z.array(z.string()).min(1),
  agentIdentity: z.string().optional(),
  memoryContext: z.string().optional(),
})

export const brainBridgeRoutes = new Hono<{ Bindings: Env }>()

brainBridgeRoutes.post('/intention', zValidator('json', intentionSchema), async (c) => {
  const body = c.req.valid('json')
  const env = c.env
  
  logger.info('Received creative intention from Brain Cockpit', {
    topic: body.topic,
    platforms: body.targetPlatforms,
  })

  try {
    const productId = crypto.randomUUID()
    const runId = crypto.randomUUID()
    
    // Store intention in D1 for the workflow engine to consume
    await env.DB.prepare(
      `INSERT INTO products (id, user_input, status, created_at) 
       VALUES (?, ?, 'queued', ?)`
    )
      .bind(
        productId,
        JSON.stringify({
          topic: body.topic,
          tone: body.tone,
          platforms: body.targetPlatforms,
          agentIdentity: body.agentIdentity,
          memoryContext: body.memoryContext,
        }),
        new Date().toISOString()
      )
      .run()

    // Trigger the NEXUS autopilot/workflow engine
    const engine = new ProductWorkflow(env)
    c.executionCtx.waitUntil(
      engine.run(runId, productId, 'brain-intent', 'auto-generated', {
        topic: body.topic,
        tone: body.tone,
      }).catch((err) => {
        logger.error('Brain intention workflow failed', err instanceof Error ? err : new Error(String(err)))
      })
    )

    return c.json({
      success: true,
      message: 'Intention received. Autopilot engaged.',
      runId,
      productId,
    }, 202)
  } catch (err) {
    logger.error('Failed to process intention', err instanceof Error ? err : new Error(String(err)))
    return c.json({ error: 'Failed to process intention' }, 500)
  }
})
