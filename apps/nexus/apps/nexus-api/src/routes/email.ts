import { Hono } from 'hono'
import type { Env } from '../env'
import { callAISimple } from '../services/shared'
import { getSecret } from '../services/publishers'

interface SubscriberRow {
  id: string
  email: string
  name: string | null
}

interface SendAttempt {
  recipient: string
  trackingId: string
  sentAt: string
  ok: boolean
  providerId: string | null
  error: string | null
}

async function sendViaResend(
  config: { key: string; from: string },
  to: string,
  subject: string,
  html: string,
): Promise<{ ok: boolean; providerId: string | null; error: string | null }> {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.key}`,
      },
      body: JSON.stringify({
        from: config.from,
        to: [to],
        subject,
        html,
      }),
    })

    const payload = await res.json().catch(() => null) as { id?: string; message?: string; name?: string } | null
    if (res.ok) {
      return { ok: true, providerId: payload?.id ?? null, error: null }
    }

    return {
      ok: false,
      providerId: null,
      error: payload?.message ?? payload?.name ?? `Resend HTTP ${res.status}`,
    }
  } catch (err) {
    return {
      ok: false,
      providerId: null,
      error: err instanceof Error ? err.message : 'Unknown email delivery error',
    }
  }
}

async function recordSendAttempt(
  env: Env,
  campaignId: string,
  attempt: SendAttempt,
): Promise<void> {
  const errorText = attempt.error ? attempt.error.slice(0, 1000) : null
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO email_sends
         (tracking_id, campaign_id, step_id, recipient, provider, provider_id, ok, error, sent_at)
       VALUES (?, ?, ?, ?, 'resend', ?, ?, ?, ?)`,
    ).bind(
      attempt.trackingId,
      campaignId,
      'campaign-send',
      attempt.recipient,
      attempt.providerId,
      attempt.ok ? 1 : 0,
      errorText,
      attempt.sentAt,
    ),
    env.DB.prepare(
      `INSERT INTO email_events (tracking_id, kind, at, meta)
       VALUES (?, ?, ?, ?)`,
    ).bind(
      attempt.trackingId,
      attempt.ok ? 'sent' : 'failed',
      attempt.sentAt,
      JSON.stringify({
        provider: 'resend',
        provider_id: attempt.providerId,
        error: errorText,
      }),
    ),
  ])
}

async function ensureTables(env: Env): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS subscribers (
         id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT,
         source TEXT DEFAULT 'manual',
         subscribed_at TEXT NOT NULL DEFAULT (datetime('now')),
         unsubscribed_at TEXT)`,
    ),
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS email_campaigns (
         id TEXT PRIMARY KEY, subject TEXT NOT NULL, body TEXT NOT NULL,
         product_id TEXT, status TEXT NOT NULL DEFAULT 'draft',
         sent_at TEXT, open_count INTEGER NOT NULL DEFAULT 0,
         click_count INTEGER NOT NULL DEFAULT 0,
         created_at TEXT NOT NULL DEFAULT (datetime('now')))`,
    ),
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS email_sends (
         tracking_id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, step_id TEXT NOT NULL,
         recipient TEXT NOT NULL, provider TEXT NOT NULL, provider_id TEXT,
         ok INTEGER NOT NULL, error TEXT, sent_at TEXT NOT NULL DEFAULT (datetime('now')))`,
    ),
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS email_events (
         id INTEGER PRIMARY KEY AUTOINCREMENT, tracking_id TEXT NOT NULL,
         kind TEXT NOT NULL, at TEXT NOT NULL, meta TEXT)`,
    ),
  ]).catch(() => void 0)
}

export const emailRoutes = new Hono<{ Bindings: Env }>()

// POST /subscribe — public, no auth needed (handled at the gate level)
  .post('/subscribe', async (c) => {
  await ensureTables(c.env)
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return c.json({ error: 'Invalid email' }, 400)
  }
  const name = typeof body.name === 'string' ? body.name.trim() : null
  const source = typeof body.source === 'string' ? body.source : 'widget'
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  await c.env.DB.prepare(
    `INSERT INTO subscribers (id, email, name, source, subscribed_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(email) DO UPDATE SET
       name = COALESCE(excluded.name, subscribers.name),
       unsubscribed_at = NULL`,
  ).bind(id, email, name, source, now).run()

  return c.json({ ok: true, id })
})


// GET /subscribers — list with stats
  .get('/subscribers', async (c) => {
  await ensureTables(c.env)
  const rows = await c.env.DB.prepare(
    `SELECT id, email, name, source, subscribed_at, unsubscribed_at
       FROM subscribers ORDER BY subscribed_at DESC LIMIT 500`,
  ).all<{
    id: string
    email: string
    name: string | null
    source: string | null
    subscribed_at: string
    unsubscribed_at: string | null
  }>()

  const total = rows.results?.length ?? 0
  const active = rows.results?.filter((r) => !r.unsubscribed_at).length ?? 0

  return c.json({ subscribers: rows.results ?? [], total, active })
})


// DELETE /subscribers/:id — unsubscribe
  .delete('/subscribers/:id', async (c) => {
  await ensureTables(c.env)
  const id = c.req.param('id')
  const now = new Date().toISOString()
  await c.env.DB.prepare(
    `UPDATE subscribers SET unsubscribed_at = ? WHERE id = ?`,
  ).bind(now, id).run()
  return c.json({ ok: true })
})


// POST /campaigns — create campaign (AI generates email content)
  .post('/campaigns', async (c) => {
  await ensureTables(c.env)
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>
  const productId = typeof body.product_id === 'string' ? body.product_id : null

  let productName = 'a new product'
  let productDesc = ''
  if (productId) {
    const row = await c.env.DB.prepare(
      `SELECT name, description FROM products WHERE id = ? LIMIT 1`,
    ).bind(productId).first<{ name: string; description: string | null }>().catch(() => null)
    if (row) {
      productName = row.name
      productDesc = row.description ?? ''
    }
  }

  const userSubject = typeof body.subject === 'string' ? body.subject : ''
  const userBody = typeof body.body === 'string' ? body.body : ''

  let subject = userSubject
  let emailBody = userBody

  if (!subject || !emailBody) {
    const prompt = `Write a product launch email for "${productName}".
${productDesc ? `Product description: ${productDesc}` : ''}
Return JSON: {"subject":"catchy email subject line","body":"HTML email body with product highlights, call to action, and professional formatting. Keep it concise and compelling."}`
    try {
      const raw = await callAISimple(c.env, prompt, { taskType: 'content_generation', outputFormat: 'json' })
      const parsed = JSON.parse(raw) as { subject?: string; body?: string }
      if (!subject) subject = parsed.subject ?? `Introducing ${productName}`
      if (!emailBody) emailBody = parsed.body ?? `<p>Check out ${productName}!</p>`
    } catch {
      if (!subject) subject = `Introducing ${productName}`
      if (!emailBody) emailBody = `<p>We're excited to announce <b>${productName}</b>. Check it out!</p>`
    }
  }

  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  await c.env.DB.prepare(
    `INSERT INTO email_campaigns (id, subject, body, product_id, status, created_at)
     VALUES (?, ?, ?, ?, 'draft', ?)`,
  ).bind(id, subject, emailBody, productId, now).run()

  return c.json({ ok: true, campaign: { id, subject, body: emailBody, product_id: productId, status: 'draft', created_at: now } })
})


// GET /campaigns — list campaigns
  .get('/campaigns', async (c) => {
  await ensureTables(c.env)
  const rows = await c.env.DB.prepare(
    `SELECT c.id, c.subject, c.body, c.product_id, c.status, c.sent_at,
            c.open_count, c.click_count, c.created_at,
            p.name AS product_name
       FROM email_campaigns c
       LEFT JOIN products p ON p.id = c.product_id
      ORDER BY c.created_at DESC LIMIT 100`,
  ).all<{
    id: string
    subject: string
    body: string
    product_id: string | null
    status: string
    sent_at: string | null
    open_count: number
    click_count: number
    created_at: string
    product_name: string | null
  }>()

  return c.json({ campaigns: rows.results ?? [] })
})


// POST /campaigns/:id/send — send campaign
  .post('/campaigns/:id/send', async (c) => {
  await ensureTables(c.env)
  const id = c.req.param('id')
  const campaign = await c.env.DB.prepare(
    `SELECT id, subject, body, status FROM email_campaigns WHERE id = ? LIMIT 1`,
  ).bind(id).first<{ id: string; subject: string; body: string; status: string }>()

  if (!campaign) return c.json({ error: 'Campaign not found' }, 404)
  if (campaign.status === 'sent') return c.json({ error: 'Campaign already sent' }, 400)

  const resendKey = await getSecret(c.env, 'RESEND_API_KEY')
  if (!resendKey) {
    return c.json({ error: 'RESEND_API_KEY not configured' }, 503)
  }
  const resendFrom = (await getSecret(c.env, 'EMAIL_FROM')) || 'NEXUS <onboarding@resend.dev>'

  const subs = await c.env.DB.prepare(
    `SELECT id, email, name FROM subscribers WHERE unsubscribed_at IS NULL`,
  ).all<SubscriberRow>()
  const recipients = subs.results ?? []
  if (recipients.length === 0) {
    return c.json({ error: 'No active subscribers to send to' }, 400)
  }

  const now = new Date().toISOString()
  let sentCount = 0
  let failedCount = 0
  const errors: string[] = []

  for (const recipient of recipients) {
    const trackingId = crypto.randomUUID()
    const sentAt = new Date().toISOString()
    const result = await sendViaResend(
      { key: resendKey, from: resendFrom },
      recipient.email,
      campaign.subject,
      campaign.body,
    )
    await recordSendAttempt(c.env, id, {
      recipient: recipient.email,
      trackingId,
      sentAt,
      ok: result.ok,
      providerId: result.providerId,
      error: result.error,
    })
    if (result.ok) {
      sentCount++
    } else {
      failedCount++
      errors.push(`${recipient.email}: ${result.error ?? 'send failed'}`)
    }
  }

  const finalStatus = sentCount > 0 ? 'sent' : 'failed'
  await c.env.DB.prepare(
    `UPDATE email_campaigns SET status = ?, sent_at = ? WHERE id = ?`,
  ).bind(finalStatus, sentCount > 0 ? now : null, id).run()

  return c.json({
    ok: sentCount > 0,
    sent_to: sentCount,
    failed_to: failedCount,
    campaign_id: id,
    sent_at: sentCount > 0 ? now : null,
    status: finalStatus,
    errors: errors.slice(0, 10),
  })
})
