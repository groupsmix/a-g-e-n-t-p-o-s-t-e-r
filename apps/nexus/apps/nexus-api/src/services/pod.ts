// ============================================================
// Print on Demand (POD) — Printify API client + design helpers
// ============================================================

import type { Env } from '../env'
import { getSecret } from './publishers'

const PRINTIFY_BASE = 'https://api.printify.com/v1'

// --------------- Printify types ---------------

export interface PrintifyShop {
  id: number
  title: string
  sales_channel: string
}

export interface PrintifyBlueprint {
  id: number
  title: string
  description: string
  brand: string
  model: string
  images: string[]
}

export interface PrintifyImage {
  id: string
  file_name: string
  height: number
  width: number
  size: number
  mime_type: string
  preview_url: string
  upload_time: string
}

export interface PrintifyProduct {
  id: string
  title: string
  description: string
  tags: string[]
  options: unknown[]
  variants: unknown[]
  images: unknown[]
  created_at: string
  updated_at: string
  visible: boolean
  is_locked: boolean
  blueprint_id: number
  shop_id: number
}

// --------------- Design metadata ---------------

export interface PODDesignSpec {
  prompt: string
  productType: string
  niche: string
  dimensions: { width: number; height: number }
  style: string
  elements: {
    title: string
    tagline: string
    layout: 'centered' | 'top-bottom' | 'diagonal'
  }
}

// Product type → recommended print area dimensions (px)
const PRODUCT_DIMENSIONS: Record<string, { width: number; height: number }> = {
  't-shirt': { width: 4500, height: 5400 },
  'mug': { width: 2700, height: 1100 },
  'poster': { width: 7200, height: 10800 },
  'hoodie': { width: 4500, height: 5400 },
  'tote-bag': { width: 3600, height: 3600 },
}

// --------------- Printify API helpers ---------------

async function getToken(env: Env): Promise<string | null> {
  return getSecret(env, 'PRINTIFY_TOKEN')
}

async function printifyFetch<T>(
  env: Env,
  path: string,
  method: 'GET' | 'POST' = 'GET',
  body?: unknown,
): Promise<{ ok: boolean; data?: T; error?: string }> {
  const token = await getToken(env)
  if (!token) return { ok: false, error: 'PRINTIFY_TOKEN not configured' }

  const init: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'NEXUS-POD/1.0',
    },
  }

  if (body && method === 'POST') {
    init.body = JSON.stringify(body)
  }

  try {
    const res = await fetch(`${PRINTIFY_BASE}${path}`, init)
    const json = await res.json().catch(() => ({}))

    if (!res.ok) {
      const errMsg = (json as Record<string, string>).message ||
        (json as Record<string, string>).error ||
        `Printify API error ${res.status}`
      return { ok: false, error: errMsg }
    }

    return { ok: true, data: json as T }
  } catch (err) {
    return { ok: false, error: `Printify request failed: ${(err as Error).message}` }
  }
}

// --------------- Public API functions ---------------

export async function listShops(
  env: Env,
): Promise<{ ok: boolean; shops?: PrintifyShop[]; error?: string }> {
  const result = await printifyFetch<PrintifyShop[]>(env, '/shops.json')
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true, shops: result.data ?? [] }
}

export async function listBlueprints(
  env: Env,
): Promise<{ ok: boolean; blueprints?: PrintifyBlueprint[]; error?: string }> {
  const result = await printifyFetch<PrintifyBlueprint[]>(env, '/catalog/blueprints.json')
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true, blueprints: result.data ?? [] }
}

export async function createProduct(
  env: Env,
  shopId: string,
  blueprint: { id: number; title: string },
  design: { title: string; description: string; tags?: string[] },
): Promise<{ ok: boolean; product?: PrintifyProduct; error?: string }> {
  const body = {
    title: design.title,
    description: design.description,
    blueprint_id: blueprint.id,
    print_areas: {},
    variants: [],
    tags: design.tags ?? [],
  }

  const result = await printifyFetch<PrintifyProduct>(
    env,
    `/shops/${encodeURIComponent(shopId)}/products.json`,
    'POST',
    body,
  )
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true, product: result.data }
}

export async function publishProduct(
  env: Env,
  shopId: string,
  productId: string,
): Promise<{ ok: boolean; error?: string }> {
  const body = {
    title: true,
    description: true,
    images: true,
    variants: true,
    tags: true,
    keyFeatures: true,
    shipping_template: true,
  }

  const result = await printifyFetch<unknown>(
    env,
    `/shops/${encodeURIComponent(shopId)}/products/${encodeURIComponent(productId)}/publish.json`,
    'POST',
    body,
  )
  return { ok: result.ok, error: result.error }
}

export async function uploadImage(
  env: Env,
  imageUrl: string,
  fileName: string = 'design.png',
): Promise<{ ok: boolean; image?: PrintifyImage; error?: string }> {
  const result = await printifyFetch<PrintifyImage>(
    env,
    '/uploads/images.json',
    'POST',
    { file_name: fileName, url: imageUrl },
  )
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true, image: result.data }
}

// --------------- Design generation ---------------

export function generatePODDesign(niche: string, productType: string): PODDesignSpec {
  const dims = PRODUCT_DIMENSIONS[productType] ?? PRODUCT_DIMENSIONS['t-shirt']
  const cleanNiche = niche.trim()

  const titleVariants = [
    cleanNiche.toUpperCase(),
    `${cleanNiche} Life`,
    `I ❤️ ${cleanNiche}`,
    `Born to ${cleanNiche}`,
  ]

  const taglineVariants = [
    `The ultimate ${cleanNiche.toLowerCase()} design`,
    `For true ${cleanNiche.toLowerCase()} enthusiasts`,
    `Live. Love. ${cleanNiche}.`,
  ]

  const title = titleVariants[Math.floor(Math.random() * titleVariants.length)]
  const tagline = taglineVariants[Math.floor(Math.random() * taglineVariants.length)]

  const layouts: Array<'centered' | 'top-bottom' | 'diagonal'> = ['centered', 'top-bottom', 'diagonal']
  const layout = layouts[Math.floor(Math.random() * layouts.length)]

  const prompt = [
    `Create a ${productType} design for the "${cleanNiche}" niche.`,
    `Title text: "${title}"`,
    `Tagline: "${tagline}"`,
    `Layout: ${layout} arrangement`,
    `Print area: ${dims.width}x${dims.height}px`,
    `Style: Bold, modern, high-contrast, print-ready with transparent background.`,
  ].join(' ')

  return {
    prompt,
    productType,
    niche: cleanNiche,
    dimensions: dims,
    style: 'bold-modern',
    elements: { title, tagline, layout },
  }
}
