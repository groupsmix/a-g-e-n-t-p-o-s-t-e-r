/**
 * @posteragent/orchestrator
 *
 * Phase 3 deliverable.  Public surface:
 *
 *   import {
 *     BaseAgent,
 *     AgentRegistry,
 *     defaultRegistry,
 *     runAgentTask,
 *     estimateCostUsd,
 *     MODEL_PRICING,
 *   } from '@posteragent/orchestrator'
 *
 * Plus handler types for users who want to write their own:
 *
 *   import type {
 *     AgentHandler, AgentContext, HandlerOutcome,
 *   } from '@posteragent/orchestrator'
 *
 * The package is intentionally pure — no Hono, no Mastra, no Cloudflare
 * binding imports.  Wire it into your runtime (nexus-api worker, Node
 * cron, Vercel API route) with a D1-compatible `prepare`/`bind`/`run`
 * surface and you're done.
 */

export { BaseAgent } from './base-agent.js'
export type { BaseAgentOptions } from './base-agent.js'

export { defaultRegistry, AgentRegistry } from './registry.js'
export { wireRegistry } from './wire.js'
export type { WireDeps } from './wire.js'
export {
  createWriteHandler,
  type WritePayload,
  type WriteFormat,
  type WriteHandlerDeps,
} from './handlers/real/write.js'
export {
  createGenerateImageHandler,
  type GenerateImagePayload,
  type ImageClient,
  type ImageModel,
  type PosterStyle,
  type AspectRatio,
} from './handlers/real/generate-image.js'
export {
  createGenerateVideoHandler,
  type GenerateVideoPayload,
  type VideoRenderer,
  type VideoComposition,
} from './handlers/real/generate-video.js'
export {
  createMemoryConsolidateHandler,
  type MemoryConsolidatePayload,
} from './handlers/real/memory-consolidate.js'

export { runAgentTask } from './run.js'
export type { RunAgentTaskDeps, RunAgentTaskOptions } from './run.js'

export {
  estimateCostUsd,
  preflightEstimate,
  MODEL_PRICING,
  UNKNOWN_MODEL_PRICE,
} from './cost.js'
export type { ModelPricing } from './cost.js'

export type {
  AgentContext,
  AgentHandler,
  AgentLogger,
  DispatchOptions,
  HandlerOutcome,
  OrchestratorDB,
} from './types.js'

export {
  defineStub,
  researchHandler,
  writeHandler,
  buildAppHandler,
  buildSiteHandler,
  publishHandler,
  analyseHandler,
  generateVideoHandler,
  generateImageHandler,
  leadScrapeHandler,
  emailCampaignHandler,
  financialAnalysisHandler,
  brandMonitorHandler,
  autonomeRunHandler,
  memoryConsolidateHandler,
} from './handlers/index.js'
