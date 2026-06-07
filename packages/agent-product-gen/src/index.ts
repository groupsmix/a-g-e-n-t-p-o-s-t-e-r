/**
 * @posteragent/agent-product-gen
 *
 * TASK-502 — Digital Product Generator.
 *
 *   import { runProductGen, createProductGenHandler } from '@posteragent/agent-product-gen'
 *   import { createGumroadStorefront } from '@posteragent/agent-product-gen/adapters'
 *
 *   const handler = createProductGenHandler({
 *     llm,
 *     storefront: createGumroadStorefront({ accessToken }),
 *   })
 */

export * from './pipeline/index.js'
export { createProductGenHandler } from './handler.js'
export type { ProductGenPayload, ProductGenHandlerOutcome } from './handler.js'
export type {
  ProductKind,
  ProductBrief,
  ProductOutline,
  ProductAsset,
  PackagedProduct,
  ListedProduct,
  ProductReport,
  LLMClient,
  StorefrontClient,
} from './types.js'
