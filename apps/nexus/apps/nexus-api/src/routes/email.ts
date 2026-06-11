import { Hono } from 'hono'
import type { Env } from '../env'
import { callAISimple } from '../services/shared'


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

  const subs = await c.env.DB.prepare(
    `SELECT email FROM subscribers WHERE unsubscribed_at IS NULL`,
  ).all<{ email: string }>()
  const recipients = subs.results ?? []

  // Log the send (actual email delivery would use an email service)
  const now = new Date().toISOString()
  console.log(`[email] Sending campaign "${campaign.subject}" to ${recipients.length} subscribers`)

  await c.env.DB.prepare(
    `UPDATE email_campaigns SET status = 'sent', sent_at = ? WHERE id = ?`,
  ).bind(now, id).run()

  return c.json({
    ok: true,
    sent_to: recipients.length,
    campaign_id: id,
    sent_at: now,
  })
})
