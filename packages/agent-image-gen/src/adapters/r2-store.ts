/**
 * R2 / S3 image store. Mirrors video-factory's R2Uploader shape but
 * for images.
 */

import type { GeneratedImage, ImageStore } from '../types.js'

export interface R2ImageStoreConfig {
  endpoint: string
  bucket: string
  publicBaseUrl?: string
  fetch?: typeof fetch
}

export function createR2ImageStore(config: R2ImageStoreConfig): ImageStore {
  const f = config.fetch ?? fetch
  return {
    async put({ image, name }) {
      if (!image.imageBase64 || image.imageBase64 === 'dryrun') {
        throw new Error('no image bytes')
      }
      const key = `images/${name}`
      const body = typeof Buffer !== 'undefined'
        ? Buffer.from(image.imageBase64, 'base64')
        : Uint8Array.from(atob(image.imageBase64), (c) => c.charCodeAt(0))
      const url = `${config.endpoint.replace(/\/$/, '')}/${config.bucket}/${key}`
      const res = await f(url, {
        method: 'PUT',
        headers: {
          'content-type': image.mime,
          'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
        },
        body,
      })
      if (!res.ok) throw new Error(`R2 HTTP ${res.status}`)
      return {
        url: config.publicBaseUrl
          ? `${config.publicBaseUrl.replace(/\/$/, '')}/${key}`
          : url,
        storageId: key,
      }
    },
  }
}
