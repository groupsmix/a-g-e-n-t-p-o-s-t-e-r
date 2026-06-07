/**
 * /api/revenue — read summaries, ingest Gumroad webhooks and Amazon
 * CSV exports, kick a polling tick for affiliate / AdSense sources.
 *
 *   GET   /summary?period=day|week|month|all
 *   GET   /events?since=&source=
 *   POST  /gumroad/webhook       (Gumroad ping URL target)
 *   POST  /amazon/csv            (raw text/csv body)
 *   POST  /tick                  (manually run affiliate + adsense pollers)
 */

import { Hono } from 'hono'
import type { Env } from '../env'
import {
  aggregate,
  D1RevenueStore,
  parseGumroadSale,
  parseAmazonCsv,
  AffiliatePollAdapter,
  AdsenseAdapter,
  runRevenueOnce,
} from '@posteragent/agent-revenue'
import { getSecret } from '../services/publishers'

export const revenueRoutes = new Hono<{ Bindings: Env }>()

function windowFor(period: string, now: Date): { start: Date; end: Date } {
  const end = now
  const start = new Date(now)
  if (period === 'day') start.setUTCHours(0, 0, 0, 0)
  else if (period === 'week') {
    start.setUTCHours(0, 0, 0, 0)
    const dow = (start.getUTCDay() + 6) % 7
    start.setUTCDate(start.getUTCDate() - dow)
  } else if (period === 'month') {
    start.setUTCHours(0, 0, 0, 0)
    start.setUTCDate(1)
  } else {
    start.setUTCFullYear(start.getUTCFullYear() - 5) // 'all'
  }
  return { start, end }
}

revenueRoutes.get('/summary', async (c) => {
  const period = c.req.query('period') ?? 'month'
  try {
    const store = new D1RevenueStore(c.env.DB)
    const { start, end } = windowFor(period, new Date())
    const events = await store.list({ since: start.toISOString(), until: end.toISOString() })
    return c.json({
      source: 'live' as const,
      period,
      summary: aggregate(events, start.toISOString(), end.toISOString()),
    })
  } catch (err) {
    return c.json({
      source: 'unconfigured' as const,
      period,
      summary: null,
      note: err instanceof Error ? err.message : String(err),
    })
  }
})

revenueRoutes.get('/events', async (c) => {
  const since = c.req.query('since') ?? new Date(Date.now() - 30 * 86_400_000).toISOString()
  const sourceParam = c.req.query('source') as
    | 'gumroad' | 'amazon' | 'affiliate' | 'adsense' | 'youtube' | 'tiktok' | 'newsletter' | 'direct' | 'other' | undefined
  try {
    const store = new D1RevenueStore(c.env.DB)
    const events = await store.list({
      since,
      until: new Date().toISOString(),
      source: sourceParam,
    })
    return c.json({ events })
  } catch (err) {
    return c.json({ events: [], note: err instanceof Error ? err.message : String(err) })
  }
})

revenueRoutes.post('/gumroad/webhook', async (c) => {
  // Gumroad pings with application/x-www-form-urlencoded — accept both.
  try {
    const ct = c.req.header('content-type') ?? ''
    let payload: Record<string, unknown>
    if (ct.includes('application/json')) {
      payload = (await c.req.json()) as Record<string, unknown>
    } else {
      const text = await c.req.text()
      payload = Object.fromEntries(new URLSearchParams(text).entries())
    }
    const event = parseGumroadSale(payload as unknown as Parameters<typeof parseGumroadSale>[0])
    const store = new D1RevenueStore(c.env.DB)
    await store.upsert([event])
    // Mirror into gumroad_sales so TASK-900's progress source counts it.
    await c.env.DB.prepare(
      `INSERT INTO gumroad_sales (id, sale_id, product_id, amount_usd_cents, buyer_email, referrer, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
    )
      .bind(
        event.id,
        event.external_id,
        event.product_id ?? null,
        event.amount_usd_cents,
        event.buyer_email ?? null,
        event.attribution.referring_url ?? null,
        event.occurred_at,
      )
      .run()
      .catch(() => undefined)
    return c.json({ ok: true, id: event.id })
  } catch (err) {
    return c.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 400)
  }
})

revenueRoutes.post('/amazon/csv', async (c) => {
  try {
    const csv = await c.req.text()
    const events = parseAmazonCsv(csv)
    const store = new D1RevenueStore(c.env.DB)
    const inserted = await store.upsert(events)
    return c.json({ ok: true, parsed: events.length, inserted })
  } catch (err) {
    return c.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 400)
  }
})

function buildPollers(env: Env): Array<AffiliatePollAdapter | AdsenseAdapter> {
  const out: Array<AffiliatePollAdapter | AdsenseAdapter> = []
  const impactUrl = (env as unknown as Record<string, string | undefined>).IMPACT_REPORTS_URL
  const impactAuth = (env as unknown as Record<string, string | undefined>).IMPACT_AUTH
  if (impactUrl) {
    out.push(
      new AffiliatePollAdapter({
        label: 'impact',
        url: impactUrl,
        headers: impactAuth ? { authorization: impactAuth } : undefined,
        rowsPath: 'Records',
        mapRow: (row: Record<string, unknown>) => ({
          external_id: String(row.Id ?? row.ActionId ?? row.Oid ?? ''),
          amount_usd_cents: Math.round(Number(row.Payout ?? row.Earnings ?? 0) * 100),
          currency: String(row.Currency ?? 'USD'),
          occurred_at: String(row.EventDate ?? row.CreationDate ?? new Date().toISOString()),
          affiliate_subid: row.SubId1 ? String(row.SubId1) : undefined,
        }),
      }),
    )
  }
  return out
}

revenueRoutes.post('/tick', async (c) => {
  try {
    const store = new D1RevenueStore(c.env.DB)
    const adapters = buildPollers(c.env)
    const result = await runRevenueOnce({ adapters, store })
    return c.json({ ok: true, result })
  } catch (err) {
    return c.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500)
  }
})

export async function runRevenueTick(env: Env): Promise<void> {
  const store = new D1RevenueStore(env.DB)
  const adapters = buildPollers(env)
  if (adapters.length === 0) return
  await runRevenueOnce({ adapters, store }).catch(() => undefined)
}

// Reference getSecret so we keep the import alive if we end up needing it for
// AdSense OAuth refresh in a follow-up; harmless tree-shake otherwise.
void getSecret
