import { Hono } from 'hono'
import type { Env } from '../env'

export const hyperbeamRoutes = new Hono<{ Bindings: Env }>()

hyperbeamRoutes.post('/session', async (c) => {
  const apiKey = c.env.HYPERBEAM_API_KEY
  if (!apiKey) {
    return c.json({ ok: false, error: 'Hyperbeam API key not configured' }, 500)
  }

  try {
    const body = await c.req.json<{ url?: string }>().catch(() => ({ url: undefined }))

    const payload: Record<string, unknown> = {
      timeout: { absolute: 3600 },
    }
    if (body.url) {
      payload.start_url = body.url
    }

    const res = await fetch('https://engine.hyperbeam.com/v0/vm', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const text = await res.text()
      return c.json({ ok: false, error: `Hyperbeam error: ${text}` }, 502)
    }

    const data = await res.json<{
      session_id: string
      embed_url: string
      admin_token: string
    }>()

    return c.json({
      ok: true,
      sessionId: data.session_id,
      embedUrl: data.embed_url,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return c.json({ ok: false, error: message }, 500)
  }
})

hyperbeamRoutes.delete('/session/:id', async (c) => {
  const apiKey = c.env.HYPERBEAM_API_KEY
  if (!apiKey) {
    return c.json({ ok: false, error: 'Hyperbeam API key not configured' }, 500)
  }

  const sessionId = c.req.param('id')

  try {
    const res = await fetch(`https://engine.hyperbeam.com/v0/vm/${sessionId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${apiKey}` },
    })

    return c.json({ ok: res.ok })
  } catch {
    return c.json({ ok: false, error: 'Failed to terminate session' }, 500)
  }
})
