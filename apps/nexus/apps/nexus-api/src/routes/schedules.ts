import { Hono } from 'hono'
import type { Env } from '../env'
import { ProductWorkflow } from '../services/workflow-engine'
import { callAISimple } from '../services/shared'
import { checkNiche } from '../services/niche-dedup'

// ============================================================
// Scheduler — define a recurring AI task once ("every day write a blog
// post for site A in my style") and NEXUS runs it on schedule. Output
// lands in the Deliveries inbox and is POSTed to a free webhook (if set)
// so it reaches you. Runs from the daily cron in index.ts.
// ============================================================

export const scheduleRoutes = new Hono<{ Bindings: Env }>()

interface ScheduleRow {
  id: string
  name: string
  task_type: string
  domain_slug: string | null
  category_slug: string | null
  topic: string | null
  instructions: string | null
  frequency: string
  active: number
  last_run_at: string | null
  created_at: string
  email: string | null
}

// --- List schedules -----------------------------------------------------
scheduleRoutes.get('/', async (c) => {
  const rows = await c.env.DB.prepare(
    'SELECT * FROM schedules ORDER BY created_at DESC',
  ).all<ScheduleRow>()
  return c.json({ schedules: rows.results ?? [] })
})

// --- Create a schedule --------------------------------------------------
scheduleRoutes.post('/', async (c) => {
  const b = await c.req.json().catch(() => ({})) as Record<string, unknown>
  const name = typeof b.name === 'string' && b.name.trim() ? b.name.trim() : null
  if (!name) return c.json({ error: 'name is required' }, 400)
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const taskType = b.task_type === 'product' ? 'product' : 'blog'
  const frequency = b.frequency === 'weekly' ? 'weekly' : 'daily'
  const email = typeof b.email === 'string' && b.email.trim() ? b.email.trim() : null
  await c.env.DB.prepare(
    `INSERT INTO schedules (id, name, task_type, domain_slug, category_slug, topic, instructions, frequency, active, created_at, email)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
  ).bind(
    id, name, taskType,
    typeof b.domain_slug === 'string' ? b.domain_slug : null,
    typeof b.category_slug === 'string' ? b.category_slug : null,
    typeof b.topic === 'string' ? b.topic : null,
    typeof b.instructions === 'string' ? b.instructions : null,
    frequency, now, email,
  ).run()
  return c.json({ id, ok: true })
})

// --- Toggle active / delete --------------------------------------------
scheduleRoutes.patch('/:id', async (c) => {
  const id = c.req.param('id')
  const b = await c.req.json().catch(() => ({})) as Record<string, unknown>
  if (typeof b.active === 'boolean') {
    await c.env.DB.prepare('UPDATE schedules SET active = ? WHERE id = ?').bind(b.active ? 1 : 0, id).run()
  }
  return c.json({ ok: true })
})

scheduleRoutes.delete('/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM schedules WHERE id = ?').bind(c.req.param('id')).run()
  return c.json({ ok: true })
})

// --- Run a schedule now (test without waiting for cron) ----------------
scheduleRoutes.post('/:id/run', async (c) => {
  const row = await c.env.DB.prepare('SELECT * FROM schedules WHERE id = ?')
    .bind(c.req.param('id')).first<ScheduleRow>()
  if (!row) return c.json({ error: 'not found' }, 404)
  const delivery = await runSchedule(c.env, c.executionCtx, row)
  return c.json({ ok: true, delivery })
})

// --- Deliveries inbox ---------------------------------------------------
scheduleRoutes.get('/deliveries/list', async (c) => {
  const rows = await c.env.DB.prepare(
    'SELECT id, schedule_id, title, kind, product_id, webhook_status, email_status, created_at FROM deliveries ORDER BY created_at DESC LIMIT 100',
  ).all()
  return c.json({ deliveries: rows.results ?? [] })
})

scheduleRoutes.get('/deliveries/:id', async (c) => {
  const row = await c.env.DB.prepare('SELECT * FROM deliveries WHERE id = ?')
    .bind(c.req.param('id')).first()
  if (!row) return c.json({ error: 'not found' }, 404)
  return c.json({ delivery: row })
})

// ============================================================
// Execution
// ============================================================

interface ScheduleExecCtx { waitUntil(p: Promise<unknown>): void }

async function callAI(env: Env, prompt: string, outputFormat: 'text' | 'json' = 'text'): Promise<string> {
  return callAISimple(env, prompt, { taskType: 'generate_long_form', outputFormat, timeoutMs: 90000 })
}

async function postWebhook(env: Env, payload: Record<string, unknown>): Promise<string> {
  let url: string | null = null
  try { url = await env.CONFIG.get('secret:PUBLISH_WEBHOOK_URL') } catch {}
  if (!url) return 'no_webhook'
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    return res.ok ? 'sent' : `failed_${res.status}`
  } catch {
    return 'error'
  }
}

async function getSecret(env: Env, name: string): Promise<string | null> {
  try {
    const v = await env.CONFIG.get(`secret:${name}`)
    if (v) return v
  } catch { /* ignore */ }
  const envVal = (env as unknown as Record<string, unknown>)[name]
  return typeof envVal === 'string' && envVal ? envVal : null
}

// Minimal, safe Markdown → HTML for the email body. Handles headings, bold,
// links, and lists — enough to make the blog post readable in an inbox.
export function mdToHtml(md: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const inline = (s: string) => esc(s)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>')
  const out: string[] = []
  let inList = false
  for (const raw of md.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trimEnd()
    const h = /^(#{1,4})\s+(.*)$/.exec(line)
    const li = /^\s*[-*]\s+(.*)$/.exec(line)
    if (li) {
      if (!inList) { out.push('<ul>'); inList = true }
      out.push(`<li>${inline(li[1])}</li>`)
      continue
    }
    if (inList) { out.push('</ul>'); inList = false }
    if (h) {
      const lvl = Math.min(h[1].length + 1, 4)
      out.push(`<h${lvl}>${inline(h[2])}</h${lvl}>`)
    } else if (!line.trim()) {
      // skip blank
    } else {
      out.push(`<p>${inline(line)}</p>`)
    }
  }
  if (inList) out.push('</ul>')
  return `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a;max-width:640px">${out.join('\n')}</div>`
}

// Send the delivery by email via Resend (free tier). Returns a status string
// stored on the delivery. Honest: if no key/recipient is configured, it says
// so instead of pretending to send.
export async function sendEmail(env: Env, to: string | null, subject: string, markdown: string): Promise<string> {
  const key = await getSecret(env, 'RESEND_API_KEY')
  const recipient = (to && to.trim()) || (await getSecret(env, 'EMAIL_TO'))
  if (!key) return 'no_key'
  if (!recipient) return 'no_recipient'
  const from = (await getSecret(env, 'EMAIL_FROM')) || 'NEXUS <onboarding@resend.dev>'
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({ from, to: [recipient], subject, html: mdToHtml(markdown) }),
    })
    if (res.ok) return 'sent'
    const detail = await res.text().catch(() => '')
    console.error('[email] resend failed', res.status, detail.slice(0, 200))
    return `failed_${res.status}`
  } catch (err) {
    console.error('[email] error', err)
    return 'error'
  }
}

// Run a single schedule: generate the deliverable, store it in the inbox,
// push to the webhook, and stamp last_run_at.
export async function runSchedule(env: Env, ctx: ScheduleExecCtx, row: ScheduleRow): Promise<{ id: string; title: string; kind: string }> {
  const now = new Date().toISOString()
  const deliveryId = crypto.randomUUID()

  if (row.task_type === 'product') {
    // Niche dedup guard — refuse to spin up a duplicate / generic product
    // build from a scheduled task. The scheduler used to fire blindly,
    // which is one of the paths that produced repeated "Retro Gaming" /
    // "essentials" rows.
    const topicNiche = row.topic || row.name
    const guard = await checkNiche(env, topicNiche)
    if (!guard.ok) {
      const title = `Skipped scheduled build: ${topicNiche}`
      await env.DB.prepare(
        `INSERT INTO deliveries (id, schedule_id, title, body, kind, webhook_status, created_at)
         VALUES (?, ?, ?, ?, 'product', 'skipped', ?)`,
      ).bind(deliveryId, row.id, title, guard.reason, now).run()
      await env.DB.prepare('UPDATE schedules SET last_run_at = ? WHERE id = ?').bind(now, row.id).run()
      return { id: deliveryId, title, kind: 'product' }
    }

    // Dispatch the full agent team to build a product for this topic.
    const productId = crypto.randomUUID()
    const runId = crypto.randomUUID()
    const domainSlug = row.domain_slug || 'digital'
    const categorySlug = row.category_slug || 'templates'
    const domain = await env.DB.prepare('SELECT id FROM domains WHERE slug = ? LIMIT 1').bind(domainSlug).first<{ id: string }>()
    const category = await env.DB.prepare('SELECT id FROM categories WHERE slug = ? LIMIT 1').bind(categorySlug).first<{ id: string }>()
    const userInput = { product_name: row.topic || row.name, niche: row.topic, description: row.instructions, let_ai_price: true }
    await env.DB.prepare(
      `INSERT INTO products (id, domain_id, category_id, name, niche, user_input, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'running', ?, ?)`,
    ).bind(productId, domain?.id ?? null, category?.id ?? null, row.topic || row.name, row.topic ?? null, JSON.stringify(userInput), now, now).run()
    await env.DB.prepare(`INSERT INTO workflow_runs (id, product_id, status, created_at) VALUES (?, ?, 'queued', ?)`).bind(runId, productId, now).run()
    const engine = new ProductWorkflow(env)
    ctx.waitUntil(engine.run(runId, productId, domainSlug, categorySlug, userInput))
    const title = `New product: ${row.topic || row.name}`
    await env.DB.prepare(
      `INSERT INTO deliveries (id, schedule_id, title, body, kind, product_id, webhook_status, created_at)
       VALUES (?, ?, ?, ?, 'product', ?, ?, ?)`,
    ).bind(deliveryId, row.id, title, `Dispatched the 15-step agent team to build "${row.topic || row.name}".`, productId, 'pending', now).run()
    const webhook = await postWebhook(env, { type: 'product', schedule: row.name, title, product_id: productId })
    const emailStatus = await sendEmail(env, row.email, title, `**${title}**\n\nThe 15-step agent team is building this product now. Check the Review queue on your dashboard to approve and publish it.`)
    await env.DB.prepare('UPDATE deliveries SET webhook_status = ?, email_status = ? WHERE id = ?').bind(webhook, emailStatus, deliveryId).run()
    await env.DB.prepare('UPDATE schedules SET last_run_at = ? WHERE id = ?').bind(now, row.id).run()
    return { id: deliveryId, title, kind: 'product' }
  }

  // Blog task: write a post that understands the project/site + style.
  const prompt = `You are NEXUS's content writer for the owner's project. Write a complete, ready-to-publish blog post.
Site / topic: ${row.topic || row.name}.
${row.domain_slug ? `Domain: ${row.domain_slug}.` : ''}
Owner's instructions & style: ${row.instructions || 'Clear, helpful, engaging; match a personal brand voice.'}
Return the post in Markdown: a strong H1 title, a short intro, 3-5 H2 sections, and a concise conclusion. 700-1100 words. No preamble, output the post only.`
  let body = ''
  try { body = await callAI(env, prompt, 'text') } catch (e) { body = `Generation failed: ${e instanceof Error ? e.message : 'error'}` }
  const firstLine = body.split('\n').find((l) => l.trim()) || row.name
  const title = firstLine.replace(/^#+\s*/, '').slice(0, 120)
  await env.DB.prepare(
    `INSERT INTO deliveries (id, schedule_id, title, body, kind, webhook_status, created_at)
     VALUES (?, ?, ?, ?, 'blog', ?, ?)`,
  ).bind(deliveryId, row.id, title, body, 'pending', now).run()
  const webhook = await postWebhook(env, { type: 'blog', schedule: row.name, title, body })
  const emailStatus = await sendEmail(env, row.email, title, body)
  await env.DB.prepare('UPDATE deliveries SET webhook_status = ?, email_status = ? WHERE id = ?').bind(webhook, emailStatus, deliveryId).run()
  await env.DB.prepare('UPDATE schedules SET last_run_at = ? WHERE id = ?').bind(now, row.id).run()
  return { id: deliveryId, title, kind: 'blog' }
}

// Find and run every schedule that is due. Called by the daily cron.
export async function runDueSchedules(env: Env, ctx: ScheduleExecCtx): Promise<void> {
  const rows = await env.DB.prepare('SELECT * FROM schedules WHERE active = 1').all<ScheduleRow>()
  const nowMs = Date.now()
  for (const row of rows.results ?? []) {
    const last = row.last_run_at ? Date.parse(row.last_run_at) : 0
    const intervalMs = row.frequency === 'weekly' ? 7 * 24 * 3600_000 : 20 * 3600_000 // daily ~ once/day
    if (nowMs - last < intervalMs) continue
    try {
      await runSchedule(env, ctx, row)
    } catch (err) {
      console.error(`[cron] schedule ${row.id} failed:`, err)
    }
  }
}
