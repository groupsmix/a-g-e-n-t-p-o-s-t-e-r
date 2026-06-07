/**
 * Stage 4 — list the packaged product on a storefront.
 * Default is a dry-run lister that just returns a fake product id.
 */

import type { ListedProduct, PackagedProduct, StorefrontClient } from '../types.js'

export function dryRunStorefront(): StorefrontClient {
  return {
    async list({ title }) {
      return {
        ok: true,
        provider: 'dry-run',
        productId: `dry_${Date.now().toString(36)}`,
        productUrl: `https://dry-run.local/p/${title.replace(/\s+/g, '-').toLowerCase()}`,
      }
    },
  }
}

export async function listProduct(
  packaged: PackagedProduct,
  client: StorefrontClient = dryRunStorefront(),
): Promise<ListedProduct> {
  const priceUsd = packaged.brief.priceUsd ?? defaultPrice(packaged.brief.kind)
  try {
    return await client.list({
      title: packaged.outline.title,
      description: packaged.salesCopy,
      priceUsd,
      assets: packaged.assets,
    })
  } catch (err) {
    return {
      ok: false,
      provider: 'dry-run',
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

function defaultPrice(kind: PackagedProduct['brief']['kind']): number {
  switch (kind) {
    case 'ebook': return 19
    case 'prompt-pack': return 12
    case 'template-pack': return 15
    case 'mini-course': return 49
  }
}
