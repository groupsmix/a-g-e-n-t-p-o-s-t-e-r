/**
 * @posteragent/agent-image-gen
 *
 * TASK-604 — Image generation. Multi-provider, aspect-aware, with
 * pluggable storage.
 */

export * from './pipeline/index.js'
export { createImageGenHandler } from './handler.js'
export type { ImageGenPayload, ImageGenHandlerOutcome } from './handler.js'
export type {
  ImageAspect,
  ImageBrief,
  GeneratedImage,
  StoredImage,
  ImageReport,
  ImageProvider,
  ImageStore,
  LLMClient,
} from './types.js'
