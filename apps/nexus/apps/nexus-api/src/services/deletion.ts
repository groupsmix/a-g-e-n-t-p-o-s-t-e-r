// ============================================================
// Deletion Service
// ============================================================
// Synchronously deletes assets across D1, R2, CF Images, and KV.
// All storage layers are cleaned up in parallel for speed.

import type { D1Database, KVNamespace, R2Bucket } from '@cloudflare/workers-types'
import { getAssetKeysByProduct, deleteProduct as deleteProductFromDB } from '../storage/d1'
import { deleteProductAssets } from '../storage/r2'
import { deleteProductImages, createCFImagesAPI } from '../storage/cf-images'
import { invalidateConfig } from '../storage/kv'

export interface DeletionResult {
  success: boolean
  deleted: {
    d1: boolean
    r2Files: string[]
    cfImages: string[]
    kvKeys: string[]
  }
  errors: string[]
}

/**
 * Delete a product and all associated assets across all storage layers.
 * Runs all deletions in parallel for maximum speed.
 */
export async function deleteProduct(
  productId: string,
  env: {
    DB: D1Database
    CONFIG: KVNamespace
    ASSETS: R2Bucket
    CF_ACCOUNT_ID: string
    CF_API_TOKEN: string
  }
): Promise<DeletionResult> {
  const errors: string[] = []
  const deleted = {
    d1: false,
    r2Files: [] as string[],
    cfImages: [] as string[],
    kvKeys: [] as string[],
  }

  try {
    // 1. Get all asset keys before deleting records
    const assetKeys = await getAssetKeysByProduct(env.DB, productId)

    const r2Keys = assetKeys
      .filter((a: any) => a.r2_key)
      .map((a: any) => a.r2_key)

    const cfImageIds = assetKeys
      .filter((a: any) => a.cf_image_id)
      .map((a: any) => a.cf_image_id)

    // 2. Run all deletions in PARALLEL
    await Promise.allSettled([
      // Delete D1 records (cascades to workflow_steps, platform_variants, etc.)
      deleteProductFromDB(env.DB, productId).then(() => {
        deleted.d1 = true
      }),

      // Delete all R2 files
      ...(r2Keys.length > 0
        ? [
            deleteProductAssets(env.ASSETS, productId).then((keys) => {
              deleted.r2Files = keys
            }),
          ]
        : [Promise.resolve()]),

      // Delete all CF Images
      ...(cfImageIds.length > 0
        ? [
            deleteProductImages(
              createCFImagesAPI(env.CF_ACCOUNT_ID, env.CF_API_TOKEN),
              cfImageIds
            ).then(() => {
              deleted.cfImages = cfImageIds
            }),
          ]
        : [Promise.resolve()]),

      // Invalidate KV cache
      invalidateConfig(env.CONFIG, `product:${productId}`).then(() => {
        deleted.kvKeys.push(`product:${productId}`)
      }),
    ])

    return {
      success: true,
      deleted,
      errors,
    }
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err))
    return {
      success: false,
      deleted,
      errors,
    }
  }
}

/**
 * Delete a domain and all associated categories from KV cache.
 */
export async function deleteDomain(
  domainId: string,
  env: {
    DB: D1Database
    CONFIG: KVNamespace
  }
): Promise<DeletionResult> {
  const errors: string[] = []

  try {
    await Promise.allSettled([
      // Delete from D1 (categories cascade via FK)
      env.DB.prepare('DELETE FROM domains WHERE id = ?').bind(domainId).run(),

      // Invalidate KV cache
      invalidateConfig(env.CONFIG, `config:domains`),
      invalidateConfig(env.CONFIG, `config:categories:${domainId}`),
    ])

    return {
      success: true,
      deleted: {
        d1: true,
        r2Files: [],
        cfImages: [],
        kvKeys: [`config:domains`, `config:categories:${domainId}`],
      },
      errors,
    }
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err))
    return {
      success: false,
      deleted: {
        d1: false,
        r2Files: [],
        cfImages: [],
        kvKeys: [],
      },
      errors,
    }
  }
}

/**
 * Delete a platform's cached config from KV.
 */
export async function deletePlatform(
  platformId: string,
  env: {
    DB: D1Database
    CONFIG: KVNamespace
  }
): Promise<DeletionResult> {
  const errors: string[] = []

  try {
    await Promise.allSettled([
      // Delete from D1
      env.DB.prepare('DELETE FROM platforms WHERE id = ?').bind(platformId).run(),

      // Invalidate KV cache
      invalidateConfig(env.CONFIG, `config:platforms`),
      invalidateConfig(env.CONFIG, `prompts:platform:${platformId}`),
    ])

    return {
      success: true,
      deleted: {
        d1: true,
        r2Files: [],
        cfImages: [],
        kvKeys: [`config:platforms`, `prompts:platform:${platformId}`],
      },
      errors,
    }
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err))
    return {
      success: false,
      deleted: {
        d1: false,
        r2Files: [],
        cfImages: [],
        kvKeys: [],
      },
      errors,
    }
  }
}

/**
 * Delete a social channel's cached config from KV.
 */
export async function deleteSocialChannel(
  channelId: string,
  env: {
    DB: D1Database
    CONFIG: KVNamespace
  }
): Promise<DeletionResult> {
  const errors: string[] = []

  try {
    await Promise.allSettled([
      // Delete from D1
      env.DB.prepare('DELETE FROM social_channels WHERE id = ?').bind(channelId).run(),

      // Invalidate KV cache
      invalidateConfig(env.CONFIG, `config:social_channels`),
      invalidateConfig(env.CONFIG, `prompts:social:${channelId}`),
    ])

    return {
      success: true,
      deleted: {
        d1: true,
        r2Files: [],
        cfImages: [],
        kvKeys: [`config:social_channels`, `prompts:social:${channelId}`],
      },
      errors,
    }
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err))
    return {
      success: false,
      deleted: {
        d1: false,
        r2Files: [],
        cfImages: [],
        kvKeys: [],
      },
      errors,
    }
  }
}

/**
 * Delete a single asset from all storage layers.
 */
export async function deleteAsset(
  assetId: string,
  env: {
    DB: D1Database
    ASSETS: R2Bucket
    CF_ACCOUNT_ID: string
    CF_API_TOKEN: string
  }
): Promise<DeletionResult> {
  const errors: string[] = []

  try {
    // Get asset details
    const asset = await env.DB
      .prepare('SELECT * FROM assets WHERE id = ?')
      .bind(assetId)
      .first()

    if (!asset) {
      return {
        success: false,
        deleted: {
          d1: false,
          r2Files: [],
          cfImages: [],
          kvKeys: [],
        },
        errors: ['Asset not found'],
      }
    }

    const r2Key = (asset as any).r2_key
    const cfImageId = (asset as any).cf_image_id

    // Delete from all layers in parallel
    await Promise.allSettled([
      // Delete D1 record
      env.DB.prepare('DELETE FROM assets WHERE id = ?').bind(assetId).run(),

      // Delete R2 file
      ...(r2Key ? [env.ASSETS.delete(r2Key)] : [Promise.resolve()]),

      // Delete CF Image
      ...(cfImageId
        ? [
            deleteProductImages(
              createCFImagesAPI(env.CF_ACCOUNT_ID, env.CF_API_TOKEN),
              [cfImageId]
            ),
          ]
        : [Promise.resolve()]),
    ])

    return {
      success: true,
      deleted: {
        d1: true,
        r2Files: r2Key ? [r2Key] : [],
        cfImages: cfImageId ? [cfImageId] : [],
        kvKeys: [],
      },
      errors,
    }
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err))
    return {
      success: false,
      deleted: {
        d1: false,
        r2Files: [],
        cfImages: [],
        kvKeys: [],
      },
      errors,
    }
  }
}
