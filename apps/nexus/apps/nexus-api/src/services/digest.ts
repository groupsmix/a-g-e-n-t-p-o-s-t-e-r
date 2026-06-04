import type { Env } from '../env'
import { getSecret } from './publishers'
import { sendEmail } from '../routes/schedules'

// ============================================================
// Daily digest — the "while you slept" morning report. One glance at what got
// built, what sold, what needs review, and what it cost. Surfaced on the
// dashboard (GET /api/digest) and emailed each morning from the cron.
// ============================================================

export interface DigestScheduleRun {
  name: string
  status: string
  ran_at: string
}

export interface DigestError {
  product_name: string | null
  failed_step: string | null
  created_at: string
}

export interface Digest {
  date: string
  built_24h: number
  needs_review: number
  published: number
  approved: number
  spend_today: number
  spend_cap: number
  sales_configured: boolean
  total_sales: number
  total_revenue: number
  best_seller: string | null
  recent: { name: string; created_at: string }[]
  schedules_ran: number
  schedules_succeeded: number
  schedules_failed: number
  schedule_runs: DigestScheduleRun[]
  errors: DigestError[]
  top_product: string | null
}

export interface DigestRecord {
  id: string
  date: string
  data: Digest
  created_at: string
}

interface CountRow { n: number }

async function spend(env: Env): Promise<{ today: number; cap: number }> {
  try {
    const res = await env.AI_WORKER.fetch(new Request('https://nexus-ai/spend'))
    if (res.ok) {
      const d = (await res.json()) as { today?: number; cap?: number }
      return { today: Number(d.today) || 0, cap: Number(d.cap) || 0 }
    }
  } catch { /* free models, no meter */ }
  return { today: 0, cap: 0 }
}

interface GumroadProduct { name: string; sales_count?: number; sales_usd_cents?: number }

async function sales(env: Env): Promise<{
  configured: boolean
  total_sales: number
  total_revenue: number
  best_seller: string | null
}> {
  const token = await getSecret(env, 'GUMROAD_ACCESS_TOKEN')
  if (!token) return { configured: false, total_sales: 0, total_revenue: 0, best_seller: null }
  try {
    const res = await fetch(`https://api.gumroad.com/v2/products?access_token=${encodeURIComponent(token)}`)
    const data = (await res.json().catch(() => ({}))) as { success?: boolean; products?: GumroadProduct[] }
    if (!res.ok || !data.success) return { configured: true, total_sales: 0, total_revenue: 0, best_seller: null }
    const products = (data.products || []).map((p) => ({
      name: p.name,
      sales: p.sales_count ?? 0,
      revenue: Math.round(p.sales_usd_cents ?? 0) / 100,
    }))
    products.sort((a, b) => b.revenue - a.revenue)
    return {
      configured: true,
      total_sales: products.reduce((s, p) => s + p.sales, 0),
      total_revenue: Math.round(products.reduce((s, p) => s + p.revenue, 0) * 100) / 100,
      best_seller: products.find((p) => p.sales > 0)?.name || null,
    }
  } catch {
    return { configured: true, total_sales: 0, total_revenue: 0, best_seller: null }
  }
}

async function scheduleStats(env: Env, since: string): Promise<{
  ran: number
  succeeded: number
  failed: number
  runs: DigestScheduleRun[]
}> {
  try {
    const rows = await env.DB.prepare(
      `SELECT d.title AS name,
              CASE WHEN d.webhook_status = 'error' OR d.email_status = 'error' THEN 'failed' ELSE 'ok' END AS status,
              d.created_at AS ran_at
       FROM deliveries d
       WHERE d.created_at >= ?
       ORDER BY d.created_at DESC LIMIT 20`,
    ).bind(since).all<DigestScheduleRun>()
    const list = rows.results ?? []
    const succeeded = list.filter((r) => r.status === 'ok').length
    return { ran: list.length, succeeded, failed: list.length - succeeded, runs: list }
  } catch {
    return { ran: 0, succeeded: 0, failed: 0, runs: [] }
  }
}

async function recentErrors(env: Env, since: string): Promise<DigestError[]> {
  try {
    const rows = await env.DB.prepare(
      `SELECT p.name AS product_name, w.failed_step, w.created_at
       FROM workflow_runs w
       LEFT JOIN products p ON p.id = w.product_id
       WHERE w.status = 'failed' AND w.created_at >= ?
       ORDER BY w.created_at DESC LIMIT 10`,
    ).bind(since).all<DigestError>()
    return rows.results ?? []
  } catch {
    return []
  }
}

async function topProduct(env: Env, since: string): Promise<string | null> {
  try {
    const row = await env.DB.prepare(
      `SELECT p.name FROM products p
       JOIN workflow_runs w ON w.product_id = p.id
       WHERE w.status = 'completed' AND w.created_at >= ?
       ORDER BY w.completed_at DESC LIMIT 1`,
    ).bind(since).first<{ name: string }>()
    return row?.name ?? null
  } catch {
    return null
  }
}

export async function buildDigest(env: Env): Promise<Digest> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const [built, review, published, approved, recent, sp, sl, sched, errs, top] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS n FROM products WHERE created_at >= ?`).bind(since).first<CountRow>(),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM products WHERE status = 'pending_review'`).first<CountRow>(),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM products WHERE status = 'published'`).first<CountRow>(),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM products WHERE status = 'approved'`).first<CountRow>(),
    env.DB.prepare(
      `SELECT name, created_at FROM products WHERE created_at >= ? ORDER BY created_at DESC LIMIT 8`,
    ).bind(since).all<{ name: string; created_at: string }>(),
    spend(env),
    sales(env),
    scheduleStats(env, since),
    recentErrors(env, since),
    topProduct(env, since),
  ])

  return {
    date: new Date().toISOString().slice(0, 10),
    built_24h: built?.n ?? 0,
    needs_review: review?.n ?? 0,
    published: published?.n ?? 0,
    approved: approved?.n ?? 0,
    spend_today: sp.today,
    spend_cap: sp.cap,
    sales_configured: sl.configured,
    total_sales: sl.total_sales,
    total_revenue: sl.total_revenue,
    best_seller: sl.best_seller,
    recent: (recent?.results ?? []).map((r) => ({ name: r.name, created_at: r.created_at })),
    schedules_ran: sched.ran,
    schedules_succeeded: sched.succeeded,
    schedules_failed: sched.failed,
    schedule_runs: sched.runs,
    errors: errs,
    top_product: top,
  }
}

export async function generateAndStoreDigest(env: Env, date?: string): Promise<Digest> {
  const digest = await buildDigest(env)
  const d = date ?? digest.date
  const id = crypto.randomUUID()
  try {
    await env.DB.prepare(
      `INSERT INTO digests (id, date, data, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(date) DO UPDATE SET data = excluded.data, created_at = excluded.created_at`,
    ).bind(id, d, JSON.stringify(digest), new Date().toISOString()).run()
  } catch (err) {
    console.error('[digest] failed to store digest:', err)
  }
  return digest
}

export async function getDigestHistory(env: Env, limit = 30): Promise<DigestRecord[]> {
  try {
    const rows = await env.DB.prepare(
      `SELECT id, date, data, created_at FROM digests ORDER BY date DESC LIMIT ?`,
    ).bind(limit).all<{ id: string; date: string; data: string; created_at: string }>()
    return (rows.results ?? []).map((r) => ({
      id: r.id,
      date: r.date,
      data: JSON.parse(r.data) as Digest,
      created_at: r.created_at,
    }))
  } catch {
    return []
  }
}

export function digestMarkdown(d: Digest): string {
  const lines = [
    `# Your NEXUS morning report — ${d.date}`,
    '',
    `While you slept:`,
    '',
    `- **${d.built_24h}** product${d.built_24h === 1 ? '' : 's'} built in the last 24h`,
    `- **${d.needs_review}** waiting for your review`,
    `- **${d.published}** published · **${d.approved}** approved`,
    d.sales_configured
      ? `- **$${d.total_revenue.toFixed(2)}** in sales across ${d.total_sales} order${d.total_sales === 1 ? '' : 's'}${d.best_seller ? ` (best seller: ${d.best_seller})` : ''}`
      : `- Sales: connect Gumroad to track real revenue`,
    `- AI spend today: **$${d.spend_today.toFixed(2)}**${d.spend_cap > 0 ? ` of $${d.spend_cap.toFixed(2)} cap` : ' (free models)'}`,
    `- **${d.schedules_ran}** schedule${d.schedules_ran === 1 ? '' : 's'} ran (${d.schedules_succeeded} ok, ${d.schedules_failed} failed)`,
  ]
  if (d.recent.length) {
    lines.push('', '## Built overnight')
    for (const r of d.recent) lines.push(`- ${r.name}`)
  }
  if (d.errors.length) {
    lines.push('', '## Needs attention')
    for (const e of d.errors) lines.push(`- ${e.product_name ?? 'Unknown'} — failed at ${e.failed_step ?? 'unknown step'}`)
  }
  if (d.needs_review > 0) {
    lines.push('', `You have ${d.needs_review} product${d.needs_review === 1 ? '' : 's'} to review on your dashboard.`)
  }
  return lines.join('\n')
}

export function digestEmailHtml(d: Digest): string {
  const md = digestMarkdown(d)
  const lines = md.split('\n')
  const out: string[] = []
  let inList = false
  for (const raw of lines) {
    const line = raw.trimEnd()
    const h = /^(#{1,4})\s+(.*)$/.exec(line)
    const li = /^\s*[-*]\s+(.*)$/.exec(line)
    const inline = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    if (li) {
      if (!inList) { out.push('<ul style="margin:8px 0;padding-left:20px">'); inList = true }
      out.push(`<li style="margin:4px 0">${inline(li[1])}</li>`)
      continue
    }
    if (inList) { out.push('</ul>'); inList = false }
    if (h) {
      const lvl = Math.min(h[1].length + 1, 4)
      out.push(`<h${lvl} style="margin:16px 0 8px">${inline(h[2])}</h${lvl}>`)
    } else if (!line.trim()) {
      // skip blank
    } else {
      out.push(`<p style="margin:4px 0">${inline(line)}</p>`)
    }
  }
  if (inList) out.push('</ul>')

  return `<div style="font-family:system-ui,'Segoe UI',Arial,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a;max-width:640px;margin:0 auto;padding:24px">${out.join('\n')}</div>`
}

export async function sendDailyDigest(env: Env): Promise<void> {
  try {
    const d = await generateAndStoreDigest(env)
    const status = await sendEmail(env, null, `NEXUS morning report — ${d.date}`, digestMarkdown(d))
    console.log(`[cron] daily digest email: ${status}`)
  } catch (err) {
    console.error('[cron] daily digest failed:', err)
  }
}
