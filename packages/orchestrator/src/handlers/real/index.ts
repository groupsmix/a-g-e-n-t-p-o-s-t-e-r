/**
 * Barrel for real (non-stub) handler factories. The stubs continue to
 * live under handlers/*.ts so the default registry remains exhaustive.
 * Production wiring (see wire.ts) overrides stubs with these.
 */

export { createWriteHandler } from './write.js'
export type { WritePayload, WriteFormat, WriteHandlerDeps, WriteHandlerData, WritePiece } from './write.js'

export { createGenerateImageHandler } from './generate-image.js'
export type {
  GenerateImagePayload,
  GenerateImageData,
  GenerateImageHandlerDeps,
  ImageClient,
  ImageModel,
  PosterStyle,
  AspectRatio,
} from './generate-image.js'

export { createGenerateVideoHandler } from './generate-video.js'
export type {
  GenerateVideoPayload,
  GenerateVideoData,
  GenerateVideoHandlerDeps,
  VideoRenderer,
  VideoComposition,
} from './generate-video.js'

export { createMemoryConsolidateHandler } from './memory-consolidate.js'
export type {
  MemoryConsolidatePayload,
  MemoryConsolidateData,
  MemoryConsolidateHandlerDeps,
} from './memory-consolidate.js'
