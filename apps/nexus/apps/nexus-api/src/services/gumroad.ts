// ============================================================
// Gumroad API client — wraps https://api.gumroad.com/v2/
// ============================================================
// Inspired by the antiwork/gumroad-cli patterns: thin fetch wrappers
// around the Gumroad REST API, auth via access_token param.

import type { Env } from '../env'
import { getSecret } from './publishers'

const GUMROAD_BASE = 'https://api.gumroad.com/v2'

export interface GumroadProduct {
  id: string
  name: string
  description: string | null
  price: number
  currency: string
  short_url: string
  published: boolean
  sales_count: number
  sales_usd_cents: number
  views_count: number
}

export interface GumroadSale {
  id: string
  email: string
  price: number
  product_id: string
  product_name: string
  created_at: string
  refunded: boolean
}

export interface GumroadAnalytics {
  product_id: string
  views: number
  sales: number
  revenue_cents: number
}

async function getToken(env: Env): Promise<string | null> {
  return getSecret(env, 'GUMROAD_ACCESS_TOKEN')
}

async function gumroadFetch<T>(
  env: Env,
  path: string,
  method: 'GET' | 'POST' | 'PUT' = 'GET',
  body?: Record<string, string>,
): Promise<{ ok: boolean; data?: T; error?: string }> {
  const token = await getToken(env)
  if (!token) return { ok: false, error: 'GUMROAD_ACCESS_TOKEN not configured' }

  const url = new URL(`${GUMROAD_BASE}${path}`)

  let init: RequestInit
  if (method === 'GET') {
    url.searchParams.set('access_token', token)
    init = { method }
  } else {
    const form = new URLSearchParams({ access_token: token, ...body })
    init = {
      method,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    }
  }

  const res = await fetch(url.toString(), init)
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>

  if (!res.ok || json.success === false) {
    return { ok: false, error: (json.message as string) || `Gumroad API error ${res.status}` }
  }

  return { ok: true, data: json as unknown as T }
}

export async function listProducts(
  env: Env,
): Promise<{ ok: boolean; products?: GumroadProduct[]; error?: string }> {
  const result = await gumroadFetch<{ products: GumroadProduct[] }>(env, '/products')
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true, products: result.data?.products ?? [] }
}

export async function createProduct(
  env: Env,
  data: { name: string; price: number; description?: string },
): Promise<{ ok: boolean; product?: GumroadProduct; error?: string }> {
  const body: Record<string, string> = {
    name: data.name.slice(0, 100),
    price: String(Math.max(0, Math.round(data.price * 100))),
  }
  if (data.description) body.description = data.description.slice(0, 8000)

  const result = await gumroadFetch<{ product: GumroadProduct }>(env, '/products', 'POST', body)
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true, product: result.data?.product }
}

export async function updateProduct(
  env: Env,
  productId: string,
  data: { name?: string; price?: number; description?: string },
): Promise<{ ok: boolean; product?: GumroadProduct; error?: string }> {
  const body: Record<string, string> = {}
  if (data.name) body.name = data.name.slice(0, 100)
  if (data.price !== undefined) body.price = String(Math.max(0, Math.round(data.price * 100)))
  if (data.description) body.description = data.description.slice(0, 8000)

  const result = await gumroadFetch<{ product: GumroadProduct }>(
    env,
    `/products/${encodeURIComponent(productId)}`,
    'PUT',
    body,
  )
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true, product: result.data?.product }
}

export async function listSales(
  env: Env,
  opts?: { after?: string; before?: string; page?: number },
): Promise<{ ok: boolean; sales?: GumroadSale[]; error?: string }> {
  let path = '/sales'
  const params: string[] = []
  if (opts?.after) params.push(`after=${encodeURIComponent(opts.after)}`)
  if (opts?.before) params.push(`before=${encodeURIComponent(opts.before)}`)
  if (opts?.page) params.push(`page=${opts.page}`)
  if (params.length) path += `?${params.join('&')}`

  const result = await gumroadFetch<{ sales: GumroadSale[] }>(env, path)
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true, sales: result.data?.sales ?? [] }
}

export async function getProductAnalytics(
  env: Env,
  productId: string,
): Promise<{ ok: boolean; analytics?: GumroadAnalytics; error?: string }> {
  const prodResult = await gumroadFetch<{ product: GumroadProduct }>(
    env,
    `/products/${encodeURIComponent(productId)}`,
  )
  if (!prodResult.ok) return { ok: false, error: prodResult.error }

  const p = prodResult.data?.product
  if (!p) return { ok: false, error: 'Product not found on Gumroad' }

  return {
    ok: true,
    analytics: {
      product_id: p.id,
      views: p.views_count ?? 0,
      sales: p.sales_count ?? 0,
      revenue_cents: p.sales_usd_cents ?? 0,
    },
  }
}
