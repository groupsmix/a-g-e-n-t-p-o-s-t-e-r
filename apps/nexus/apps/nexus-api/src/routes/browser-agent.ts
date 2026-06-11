import { Hono } from 'hono'
import type { Env } from '../env'
import { runAgent } from '../services/browser-agent'

export const browserAgentRoutes = new Hono<{ Bindings: Env }>()

// ---------------------------------------------------------------------------
// POST /browser-agent/run
//
// Server-Sent Events stream of the Devin-style agent loop. Each event is the
// JSON-serialized AgentEvent so the dashboard renders steps live as the
// browser drives itself: started → observation → thinking → action → … → done.
//
// The client closes the response to abort (AbortController on fetch); the
// generator naturally tears down the Chromium session in its `finally`.
// ---------------------------------------------------------------------------

  .post('/run', async (c) => {
  const body = await c.req
    .json<{ goal?: string; startUrl?: string; maxSteps?: number; liveMode?: boolean }>()
    .catch(() => ({} as { goal?: string; startUrl?: string; maxSteps?: number; liveMode?: boolean }))

  const goal = (body.goal || '').trim()
  if (!goal) return c.json({ ok: false, error: 'goal is required' }, 400)

  const startUrl = (body.startUrl || '').trim() || undefined
  const maxSteps =
    typeof body.maxSteps === 'number' && body.maxSteps > 0 && body.maxSteps <= 30
      ? Math.floor(body.maxSteps)
      : undefined
  // Default to live frame streaming on. Clients can opt out (e.g. for slow
  // connections or to save Browser Rendering ops) by sending liveMode: false.
  const liveMode = body.liveMode !== false

  const enc = new TextEncoder()
  const env = c.env

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => {
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`))
        } catch {
          /* stream may be closed by client abort */
        }
      }

      // Initial heartbeat so the client knows the channel is open immediately.
      send({ type: 'started', step: 0, goal, message: 'Connected.' })

      try {
        for await (const event of runAgent(env, goal, startUrl, maxSteps, liveMode)) {
          send(event)
        }
      } catch (err) {
        send({
          type: 'error',
          step: -1,
          error: err instanceof Error ? err.message : 'agent_failed',
        })
      } finally {
        try {
          controller.close()
        } catch {
          /* noop */
        }
      }
    },
  })

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      'x-accel-buffering': 'no',
      'connection': 'keep-alive',
    },
  })
})
