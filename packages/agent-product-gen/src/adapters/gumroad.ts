/**
 * Gumroad storefront adapter.
 *
 * Gumroad's v2 API supports product create + content upload. We:
 *   1. POST /v2/products with name + price + description.
 *   2. For each asset, base64-upload via /v2/products/:id/content.
 *
 * Auth: GUMROAD_ACCESS_TOKEN as bearer query param (Gumroad's quirk).
 *
 * Errors are surfaced as ListedProduct.ok=false rather than thrown so
 * the orchestrator can still keep the packaged product for retry.
 */

import type { ProductAsset, StorefrontClient } from '../types.js'

export interface GumroadConfig {
  accessToken: string
  baseUrl?: string
  fetch?: typeof fetch
}

interface GumroadProductResponse {
  success?: boolean
  product?: { id?: string; short_url?: string }
  message?: string
}

function toBase64(asset: ProductAsset): string {
  if (typeof asset.body === 'string') {
    if (typeof Buffer !== 'undefined') return Buffer.from(asset.body, 'utf8').toString('base64')
    const bytes = new TextEncoder().encode(asset.body)
    let bin = ''
    for (const b of bytes) bin += String.fromCharCode(b)
    return btoa(bin)
  }
  if (typeof Buffer !== 'undefined') return Buffer.from(asset.body).toString('base64')
  let bin = ''
  for (const b of asset.body) bin += String.fromCharCode(b)
  return btoa(bin)
}

export function createGumroadStorefront(config: GumroadConfig): StorefrontClient {
  const base = (config.baseUrl ?? 'https://api.gumroad.com').replace(/\/$/, '')
  const f = config.fetch ?? fetch
  return {
    async list({ title, description, priceUsd, assets }) {
      const form = new URLSearchParams({
        access_token: config.accessToken,
        name: title,
        price: String(Math.round(priceUsd * 100)),
        description,
      })
      const created = await f(`${base}/v2/products`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
      })
      const data = (await created.json().catch(() => ({}))) as GumroadProductResponse
      if (!created.ok || !data.success || !data.product?.id) {
        return {
          ok: false,
          provider: 'gumroad',
          error: data.message ?? `HTTP ${created.status}`,
        }
      }
      const productId = data.product.id

      // Upload assets (failures are non-fatal — we still return the product).
      for (const a of assets) {
        const f2 = new URLSearchParams({
          access_token: config.accessToken,
          filename: a.filename,
          content_base64: toBase64(a),
        })
        await f(`${base}/v2/products/${productId}/files`, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: f2.toString(),
        }).catch(() => undefined)
      }
      return {
        ok: true,
        provider: 'gumroad',
        productId,
        productUrl: data.product.short_url,
      }
    },
  }
}
