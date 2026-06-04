// ============================================================
// Storage Layer: R2 Helpers
// ============================================================
// Provides helpers for R2 bucket operations.
// Used for: product assets, mockups, exports, temp files.

import type { R2Bucket, R2Object, R2HTTPMetadata } from '@cloudflare/workers-types'

export type R2ObjectMetadata = R2Object

export interface R2Helper {
  put: R2Bucket['put']
  get: R2Bucket['get']
  delete: R2Bucket['delete']
  list: R2Bucket['list']
}

// ============================================================
// R2 Key Prefixes
// ============================================================

export const R2_KEYS = {
  // Product assets
  PRODUCT_IMAGES: (productId: string) => `products/${productId}/images`,
  PRODUCT_MOCKUPS: (productId: string) => `products/${productId}/mockups`,
  PRODUCT_PDF: (productId: string) => `products/${productId}/pdf`,
  PRODUCT_AUDIO: (productId: string) => `products/${productId}/audio`,
  PRODUCT_EXPORTS: (productId: string) => `products/${productId}/exports`,

  // Platform exports
  PLATFORM_EXPORT: (productId: string, platform: string) =>
    `products/${productId}/exports/${platform}`,

  // Temp files (cleaned up after workflow)
  TEMP: (workflowId: string, stepId: string) => `temp/${workflowId}/${stepId}`,
} as const

// ============================================================
// Generic R2 Operations
// ============================================================

export async function uploadFile(
  bucket: R2Bucket,
  key: string,
  data: ArrayBuffer | Uint8Array | string,
  options?: {
    httpMetadata?: R2HTTPMetadata
    customMetadata?: Record<string, string>
    contentType?: string
  }
): Promise<R2Object> {
  const httpMetadata: R2HTTPMetadata = options?.httpMetadata || {}

  if (options?.contentType) {
    httpMetadata.contentType = options.contentType
  }

  const result = await bucket.put(key, data as ArrayBuffer, {
    httpMetadata,
    customMetadata: options?.customMetadata,
  })
  if (!result) {
    throw new Error(`Failed to upload to R2 at key: ${key}`)
  }
  return result
}

export async function downloadFile(
  bucket: R2Bucket,
  key: string
): Promise<ArrayBuffer | null> {
  const object = await bucket.get(key)
  if (!object) return null
  return object.arrayBuffer()
}

export async function getFileMetadata(
  bucket: R2Bucket,
  key: string
): Promise<R2ObjectMetadata | null> {
  // R2 head request returns metadata without body
  const object = await bucket.head(key)
  return object
}

export async function deleteFile(bucket: R2Bucket, key: string): Promise<void> {
  await bucket.delete(key)
}

export async function deleteFiles(bucket: R2Bucket, keys: string[]): Promise<void> {
  await Promise.all(keys.map((key) => bucket.delete(key)))
}

export async function listFiles(
  bucket: R2Bucket,
  prefix: string,
  options?: { limit?: number; cursor?: string }
): Promise<{ keys: R2Object[]; cursor?: string }> {
  const result = await bucket.list({
    prefix,
    limit: options?.limit || 100,
    cursor: options?.cursor,
  })

  return {
    keys: result.objects,
    cursor: result.truncated ? result.cursor : undefined,
  }
}

// ============================================================
// Product Asset Operations
// ============================================================

export async function uploadProductImage(
  bucket: R2Bucket,
  productId: string,
  filename: string,
  data: ArrayBuffer | Uint8Array | string,
  contentType: string
): Promise<string> {
  const key = `${R2_KEYS.PRODUCT_IMAGES(productId)}/${filename}`
  await uploadFile(bucket, key, data, { contentType })
  return key
}

export async function uploadProductMockup(
  bucket: R2Bucket,
  productId: string,
  filename: string,
  data: ArrayBuffer | Uint8Array | string,
  contentType: string
): Promise<string> {
  const key = `${R2_KEYS.PRODUCT_MOCKUPS(productId)}/${filename}`
  await uploadFile(bucket, key, data, { contentType })
  return key
}

export async function uploadProductPdf(
  bucket: R2Bucket,
  productId: string,
  filename: string,
  data: ArrayBuffer | Uint8Array | string
): Promise<string> {
  const key = `${R2_KEYS.PRODUCT_PDF(productId)}/${filename}`
  await uploadFile(bucket, key, data, { contentType: 'application/pdf' })
  return key
}

export async function uploadProductAudio(
  bucket: R2Bucket,
  productId: string,
  filename: string,
  data: ArrayBuffer | Uint8Array | string,
  contentType: string
): Promise<string> {
  const key = `${R2_KEYS.PRODUCT_AUDIO(productId)}/${filename}`
  await uploadFile(bucket, key, data, { contentType })
  return key
}

export async function uploadPlatformExport(
  bucket: R2Bucket,
  productId: string,
  platform: string,
  filename: string,
  data: ArrayBuffer | Uint8Array | string,
  contentType: string
): Promise<string> {
  const key = `${R2_KEYS.PLATFORM_EXPORT(productId, platform)}/${filename}`
  await uploadFile(bucket, key, data, { contentType })
  return key
}

// ============================================================
// Temp File Operations
// ============================================================

export async function uploadTempFile(
  bucket: R2Bucket,
  workflowId: string,
  stepId: string,
  filename: string,
  data: ArrayBuffer | Uint8Array | string,
  contentType: string
): Promise<string> {
  const key = `${R2_KEYS.TEMP(workflowId, stepId)}/${filename}`
  await uploadFile(bucket, key, data, { contentType })
  return key
}

export async function cleanupTempFiles(bucket: R2Bucket, workflowId: string): Promise<void> {
  const { keys } = await listFiles(bucket, `temp/${workflowId}`)
  if (keys.length > 0) {
    await deleteFiles(bucket, keys.map((k) => k.key))
  }
}

// ============================================================
// Product Cleanup
// ============================================================

export async function deleteProductAssets(bucket: R2Bucket, productId: string): Promise<string[]> {
  const deletedKeys: string[] = []

  // List and delete all assets for this product
  const prefixes = [
    R2_KEYS.PRODUCT_IMAGES(productId),
    R2_KEYS.PRODUCT_MOCKUPS(productId),
    R2_KEYS.PRODUCT_PDF(productId),
    R2_KEYS.PRODUCT_AUDIO(productId),
    R2_KEYS.PRODUCT_EXPORTS(productId),
  ]

  for (const prefix of prefixes) {
    let cursor: string | undefined

    do {
      const result = await bucket.list({ prefix, cursor })
      const keys = result.objects.map((obj) => obj.key)

      if (keys.length > 0) {
        await deleteFiles(bucket, keys)
        deletedKeys.push(...keys)
      }

      cursor = result.truncated ? result.cursor : undefined
    } while (cursor)
  }

  return deletedKeys
}

// ============================================================
// Signed URL Generation (for private buckets)
// ============================================================

export function generateR2Key(
  productId: string,
  type: 'images' | 'mockups' | 'pdf' | 'audio' | 'exports',
  filename: string
): string {
  const folder = type === 'exports' ? `${productId}/exports` : `${productId}/${type}`
  return `${folder}/${filename}`
}

export function parseR2Key(key: string): { productId: string; type: string; filename: string } | null {
  const match = key.match(/products\/([^/]+)\/([^/]+)\/(.+)/)
  if (!match) return null

  return {
    productId: match[1],
    type: match[2],
    filename: match[3],
  }
}

// R2Object, R2HTTPMetadata, R2ObjectMetadata are imported from @cloudflare/workers-types above.
