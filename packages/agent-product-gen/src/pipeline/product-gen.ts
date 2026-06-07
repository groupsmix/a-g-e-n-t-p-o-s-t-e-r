/**
 * runProductGen — outline → write → package → list.
 */

import type { LLMClient, ProductBrief, ProductReport, StorefrontClient } from '../types.js'
import { outlineProduct } from './outliner.js'
import { writeUnits } from './writer.js'
import { packageProduct } from './packager.js'
import { listProduct } from './lister.js'

export interface ProductGenDeps {
  llm?: LLMClient
  storefront?: StorefrontClient
}

export async function runProductGen(
  brief: ProductBrief,
  deps: ProductGenDeps = {},
): Promise<ProductReport> {
  const outline = await outlineProduct(brief, deps.llm)
  const { units } = await writeUnits(outline, deps.llm)
  const packaged = packageProduct(brief, outline, units)
  const listed = await listProduct(packaged, deps.storefront)
  return { brief, outline, packaged, listed }
}
