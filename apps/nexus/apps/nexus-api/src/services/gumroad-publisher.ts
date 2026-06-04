// ============================================================
// Gumroad auto-publish service
// ============================================================
// Called automatically when a product is approved (if the setting
// is enabled) and also by the manual publish-gumroad route.

import type { Env } from '../env'
import { createProduct, type GumroadProduct } from './gumroad'

export interface GumroadPublishResult {
  ok: boolean
  gumroad_product_id?: string
  gumroad_url?: string
  error?: string
}

interface ProductRow {
  id: string
  name: string | null
  description: string | null
  price: number | null
  currency: string | null
  gumroad_product_id: string | null
  gumroad_url: string | null
  deliverable_url: string | null
}

export async function publishProductToGumroad(
  env: Env,
  productId: string,
): Promise<GumroadPublishResult> {
  const product = await env.DB.prepare(
    `SELECT id, name, description, price, currency, gumroad_product_id, gumroad_url, deliverable_url
     FROM products WHERE id = ?`,
  ).bind(productId).first<ProductRow>()

  if (!product) {
    return { ok: false, error: 'Product not found' }
  }

  if (product.gumroad_product_id) {
    return {
      ok: true,
      gumroad_product_id: product.gumroad_product_id,
      gumroad_url: product.gumroad_url ?? undefined,
    }
  }

  const result = await createProduct(env, {
    name: product.name ?? 'Untitled Product',
    price: product.price ?? 0,
    description: product.description ?? undefined,
  })

  if (!result.ok || !result.product) {
    return { ok: false, error: result.error ?? 'Gumroad API call failed' }
  }

  const gp: GumroadProduct = result.product
  const now = new Date().toISOString()

  await env.DB.prepare(
    `UPDATE products SET gumroad_product_id = ?, gumroad_url = ?, updated_at = ? WHERE id = ?`,
  ).bind(gp.id, gp.short_url, now, productId).run()

  return {
    ok: true,
    gumroad_product_id: gp.id,
    gumroad_url: gp.short_url,
  }
}
