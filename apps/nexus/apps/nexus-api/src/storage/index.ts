// ============================================================
// Storage Layer Index
// ============================================================

export * from './d1'
export * from './kv'
export * from './r2'
// cf-images re-exports a helper with the same name as r2's uploadProductImage;
// import directly from './cf-images' when you need the CF Images uploader.
export {
  CFImagesAPI,
  createCFImagesAPI,
  IMAGE_VARIANTS,
  type CFImageUploadResult,
  type CFImageDetails,
  type ImageVariant,
  deleteProductImages,
  CFImagesError,
} from './cf-images'

import type { D1Database, KVNamespace, R2Bucket } from '@cloudflare/workers-types'
import { createCFImagesAPI, type CFImagesAPI } from './cf-images'

export interface Storage {
  db: D1Database
  kv: KVNamespace
  r2: R2Bucket
  images: CFImagesAPI
  accountId: string
  apiToken: string
}

export function createStorage(
  db: D1Database,
  kv: KVNamespace,
  r2: R2Bucket,
  accountId: string,
  apiToken: string
): Storage {
  return {
    db,
    kv,
    r2,
    images: createCFImagesAPI(accountId, apiToken),
    accountId,
    apiToken,
  }
}
