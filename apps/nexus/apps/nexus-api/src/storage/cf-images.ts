// ============================================================
// Storage Layer: Cloudflare Images Helpers
// ============================================================
// Provides helpers for Cloudflare Images operations.
// Used for: product images, thumbnails, variants.

export interface CFImagesHelper {
  accountId: string
  apiToken: string
}

// ============================================================
// Image Variants
// ============================================================

export interface ImageVariant {
  variantId: string
  name: string
  width: number
  height: number
  fit: 'contain' | 'cover' | 'crop' | 'scale-down'
  format: 'webp' | 'avif' | 'json'
  quality?: number
}

export const IMAGE_VARIANTS: Record<string, ImageVariant> = {
  thumbnail: {
    variantId: 'thumbnail',
    name: 'Thumbnail',
    width: 300,
    height: 300,
    fit: 'cover',
    format: 'webp',
    quality: 80,
  },
  preview: {
    variantId: 'preview',
    name: 'Preview',
    width: 800,
    height: 800,
    fit: 'contain',
    format: 'webp',
    quality: 85,
  },
  full: {
    variantId: 'full',
    name: 'Full Size',
    width: 1920,
    height: 1920,
    fit: 'scale-down',
    format: 'webp',
    quality: 90,
  },
  mockup: {
    variantId: 'mockup',
    name: 'Mockup',
    width: 1200,
    height: 1200,
    fit: 'cover',
    format: 'webp',
    quality: 95,
  },
}

// ============================================================
// Cloudflare Images API
// ============================================================

export class CFImagesAPI {
  private accountId: string
  private apiToken: string
  private baseUrl: string

  constructor(accountId: string, apiToken: string) {
    this.accountId = accountId
    this.apiToken = apiToken
    this.baseUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v1`
  }

  private get headers(): HeadersInit {
    return {
      Authorization: `Bearer ${this.apiToken}`,
      'Content-Type': 'application/json',
    }
  }

  // ============================================================
  // Upload Image
  // ============================================================

  async uploadImage(
    file: ArrayBuffer | Uint8Array,
    filename: string,
    metadata?: Record<string, string>
  ): Promise<CFImageUploadResult> {
    const formData = new FormData()
    const blob = new Blob([file])
    formData.append('file', blob, filename)

    if (metadata) {
      Object.entries(metadata).forEach(([key, value]) => {
        formData.append(`metadata[${key}]`, value)
      })
    }

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
      },
      body: formData,
    })

    const result = await response.json() as any

    if (!response.ok) {
      throw new CFImagesError(result.errors?.[0]?.message || 'Upload failed', result)
    }

    return result.result
  }

  async uploadImageFromUrl(
    imageUrl: string,
    filename: string,
    metadata?: Record<string, string>
  ): Promise<CFImageUploadResult> {
    const body: Record<string, unknown> = {
      url: imageUrl,
      name: filename,
    }

    if (metadata) {
      body.metadata = metadata
    }

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
    })

    const result = await response.json() as any

    if (!response.ok) {
      throw new CFImagesError(result.errors?.[0]?.message || 'Upload failed', result)
    }

    return result.result
  }

  // ============================================================
  // Get Image Details
  // ============================================================

  async getImage(imageId: string): Promise<CFImageDetails | null> {
    const response = await fetch(`${this.baseUrl}/${imageId}`, {
      headers: this.headers,
    })

    if (response.status === 404) return null

    const result = await response.json() as any

    if (!response.ok) {
      throw new CFImagesError(result.errors?.[0]?.message || 'Get image failed', result)
    }

    return result.result
  }

  // ============================================================
  // List Images
  // ============================================================

  async listImages(options?: {
    limit?: number
    cursor?: string
    prefix?: string
  }): Promise<{ images: CFImageDetails[]; cursor?: string }> {
    const params = new URLSearchParams()
    if (options?.limit) params.set('limit', String(options.limit))
    if (options?.cursor) params.set('cursor', options.cursor)
    if (options?.prefix) params.set('prefix', options.prefix)

    const url = `${this.baseUrl}?${params.toString()}`
    const response = await fetch(url, { headers: this.headers })

    const result = await response.json() as any

    if (!response.ok) {
      throw new CFImagesError(result.errors?.[0]?.message || 'List images failed', result)
    }

    return {
      images: result.result.images,
      cursor: result.result.cursor,
    }
  }

  // ============================================================
  // Delete Image
  // ============================================================

  async deleteImage(imageId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/${imageId}`, {
      method: 'DELETE',
      headers: this.headers,
    })

    if (response.status === 404) return

    const result = await response.json() as any

    if (!response.ok) {
      throw new CFImagesError(result.errors?.[0]?.message || 'Delete failed', result)
    }
  }

  async deleteImages(imageIds: string[]): Promise<void> {
    await Promise.all(imageIds.map((id) => this.deleteImage(id)))
  }

  // ============================================================
  // CDN URLs
  // ============================================================

  getCdnUrl(imageId: string, variantId?: string): string {
    if (variantId) {
      return `https://imagedelivery.net/${this.accountId}/${imageId}/${variantId}`
    }
    return `https://imagedelivery.net/${this.accountId}/${imageId}/public`
  }

  getVariantUrl(imageId: string, variant: ImageVariant): string {
    return `https://imagedelivery.net/${this.accountId}/${imageId}/${variant.variantId}`
  }

  getDirectUploadUrl(): string {
    return this.baseUrl
  }
}

// ============================================================
// Helper Functions
// ============================================================

export function createCFImagesAPI(accountId: string, apiToken: string): CFImagesAPI {
  return new CFImagesAPI(accountId, apiToken)
}

export async function uploadProductImage(
  api: CFImagesAPI,
  productId: string,
  file: ArrayBuffer | Uint8Array,
  filename: string,
  metadata?: Record<string, string>
): Promise<{ imageId: string; cdnUrl: string; variants: Record<string, string> }> {
  const result = await api.uploadImage(file, filename, {
    product_id: productId,
    ...metadata,
  })

  const variants: Record<string, string> = {}
  for (const [key, variant] of Object.entries(IMAGE_VARIANTS)) {
    variants[key] = api.getVariantUrl(result.id, variant)
  }

  return {
    imageId: result.id,
    cdnUrl: api.getCdnUrl(result.id),
    variants,
  }
}

export async function deleteProductImages(
  api: CFImagesAPI,
  imageIds: string[]
): Promise<void> {
  await api.deleteImages(imageIds)
}

export function getImageCdnUrl(
  accountId: string,
  imageId: string,
  variant?: string
): string {
  if (variant) {
    return `https://imagedelivery.net/${accountId}/${imageId}/${variant}`
  }
  return `https://imagedelivery.net/${accountId}/${imageId}/public`
}

// ============================================================
// Types
// ============================================================

export interface CFImageUploadResult {
  id: string
  filename: string
  uploaded: string
  size: number
  width: number
  height: number
  url: string
  thumbnail_url: string
  variants: string[]
  metadata: Record<string, string>
}

export interface CFImageDetails {
  id: string
  filename: string
  uploaded: string
  size: number
  width: number
  height: number
  url: string
  thumbnail_url: string
  variants: string[]
  metadata: Record<string, string>
}

export class CFImagesError extends Error {
  constructor(
    message: string,
    public readonly response?: unknown
  ) {
    super(message)
    this.name = 'CFImagesError'
  }
}
