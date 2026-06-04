import { Hono } from 'hono'
import type { Env } from '../env'
import { getSecret } from '../services/publishers'

// ============================================================
// Revenue — REAL sales pulled from Gumroad (not estimates).
// When GUMROAD_ACCESS_TOKEN is set we read the seller's products and
// their actual sales counts / gross. When it's not set we say so
// honestly instead of inventing numbers.
// ============================================================

interface GumroadProduct {
  id: string
  name: string
  sales_count?: number
  sales_usd_cents?: number
  short_url?: string
  published?: boolean
}

export const revenueRoutes = new Hono<{ Bindings: Env }>()

revenueRoutes.get('/', async (c) => {
  const token = await getSecret(c.env, 'GUMROAD_ACCESS_TOKEN')
  if (!token) {
    return c.json({
      configured: false,
      message: 'Connect Gumroad (add GUMROAD_ACCESS_TOKEN on the API keys page) to track real sales.',
    })
  }

  try {
    const res = await fetch(
      `https://api.gumroad.com/v2/products?access_token=${encodeURIComponent(token)}`,
    )
    const data = (await res.json().catch(() => ({}))) as {
      success?: boolean
      products?: GumroadProduct[]
      message?: string
    }
    if (!res.ok || !data.success) {
      return c.json(
        { configured: true, error: data.message || `Gumroad error ${res.status}` },
        502,
      )
    }

    const products = (data.products || []).map((p) => ({
      id: p.id,
      name: p.name,
      sales: p.sales_count ?? 0,
      revenue: Math.round((p.sales_usd_cents ?? 0)) / 100,
      url: p.short_url || null,
      published: Boolean(p.published),
    }))

    products.sort((a, b) => b.revenue - a.revenue)

    const totalSales = products.reduce((s, p) => s + p.sales, 0)
    const totalRevenue = products.reduce((s, p) => s + p.revenue, 0)

    return c.json({
      configured: true,
      currency: 'USD',
      total_sales: totalSales,
      total_revenue: Math.round(totalRevenue * 100) / 100,
      product_count: products.length,
      best_seller: products.find((p) => p.sales > 0)?.name || null,
      products,
    })
  } catch (err) {
    console.error('Revenue fetch failed:', err)
    return c.json({ configured: true, error: 'Failed to reach Gumroad' }, 502)
  }
})

// ── Sync sales from Gumroad and ingest as economic events ─────────

revenueRoutes.post('/sync', async (c) => {
  const token = await getSecret(c.env, 'GUMROAD_ACCESS_TOKEN')
  if (!token) {
    return c.json({
      configured: false,
      message: 'Connect Gumroad (add GUMROAD_ACCESS_TOKEN on the API keys page) to sync sales.',
    })
  }

  try {
    // Fetch sales from Gumroad
    const res = await fetch(
      `https://api.gumroad.com/v2/sales?access_token=${encodeURIComponent(token)}`,
    )
    const data = (await res.json().catch(() => ({}))) as {
      success?: boolean
      sales?: Array<{
        id: string
        product_id: string
        product_name: string
        purchase_email: string
        created_at: string
        total_gross_cents?: number
        fee_cents?: number
        currency?: string
      }>
      message?: string
    }

    if (!res.ok || !data.success) {
      return c.json(
        { configured: true, error: data.message || `Gumroad error ${res.status}` },
        502,
      )
    }

    const sales = data.sales || []

    // Map Gumroad sales to economic events
    const events = sales.map((sale) => ({
      event_type: 'revenue' as const,
      external_event_id: `gumroad_${sale.id}`,
      external_provider: 'gumroad',
      amount_cents: sale.total_gross_cents || 0,
      currency: sale.currency || 'USD',
      description: `Gumroad sale: ${sale.product_name}`,
      metadata_json: {
        gumroad_sale_id: sale.id,
        product_id: sale.product_id,
        product_name: sale.product_name,
        purchase_email: sale.purchase_email,
        created_at: sale.created_at,
      },
      occurred_at: sale.created_at,
    }))

    // Also ingest fees as separate events
    const feeEvents = sales
      .filter((sale) => sale.fee_cents && sale.fee_cents > 0)
      .map((sale) => ({
        event_type: 'fee' as const,
        external_event_id: `gumroad_fee_${sale.id}`,
        external_provider: 'gumroad',
        amount_cents: sale.fee_cents || 0,
        currency: sale.currency || 'USD',
        description: `Gumroad platform fee for: ${sale.product_name}`,
        category: 'platform',
        metadata_json: {
          gumroad_sale_id: sale.id,
          product_id: sale.product_id,
          product_name: sale.product_name,
        },
        occurred_at: sale.created_at,
      }))

    const allEvents = [...events, ...feeEvents]

    // Ingest events via internal API call
    const ingestRes = await c.env.AI_WORKER.fetch(new Request(`${c.req.url}/events/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: allEvents }),
    }))

    const ingestResult = (await ingestRes.json()) as {
      inserted?: number
      skipped_duplicates?: number
    }

    return c.json({
      configured: true,
      synced: sales.length,
      events_ingested: ingestResult.inserted,
      skipped_duplicates: ingestResult.skipped_duplicates,
    })
  } catch (err) {
    console.error('Revenue sync failed:', err)
    return c.json({ configured: true, error: 'Failed to sync from Gumroad' }, 502)
  }
})
