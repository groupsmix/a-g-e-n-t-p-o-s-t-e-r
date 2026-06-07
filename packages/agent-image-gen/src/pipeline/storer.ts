/**
 * Stage 3 — push every generated image through the ImageStore.
 * Failures degrade gracefully: the image is still returned with a
 * data: URL so a downstream worker can re-upload later.
 */

import type { GeneratedImage, ImageStore, StoredImage } from '../types.js'

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
}

export async function storeImages(
  images: GeneratedImage[],
  baseName: string,
  store?: ImageStore,
): Promise<StoredImage[]> {
  const out: StoredImage[] = []
  for (const img of images) {
    const name = `${slug(baseName)}_${img.aspect.replace(':', 'x')}_${img.id}.${
      img.mime.includes('jpeg') ? 'jpg' : 'png'
    }`
    if (!store) {
      out.push({
        ...img,
        url: `data:${img.mime};base64,${img.imageBase64.slice(0, 80)}…`,
      })
      continue
    }
    try {
      const r = await store.put({ image: img, name })
      out.push({ ...img, url: r.url, storageId: r.storageId })
    } catch {
      out.push({
        ...img,
        url: `data:${img.mime};base64,${img.imageBase64.slice(0, 80)}…`,
      })
    }
  }
  return out
}
