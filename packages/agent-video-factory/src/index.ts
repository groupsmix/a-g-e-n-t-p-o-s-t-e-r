/**
 * @posteragent/agent-video-factory
 *
 * TASK-602 — Video Factory.  Plans Storyboards, defers render to a
 * Remotion worker, uploads to R2 or YouTube.
 */

export * from './pipeline/index.js'
export { SCENE_TEMPLATES } from './scenes/index.js'
export type { SceneTemplateName } from './scenes/index.js'
export { createVideoFactoryHandler } from './handler.js'
export type { VideoFactoryPayload, VideoFactoryHandlerOutcome } from './handler.js'
export type {
  AspectRatio,
  SceneKind,
  VideoBrief,
  Scene,
  TextCarouselScene,
  DataVizScene,
  ProductShowcaseScene,
  NewsReelScene,
  QuoteCardScene,
  Storyboard,
  CaptionCue,
  RenderResult,
  UploadResult,
  VideoReport,
  LLMClient,
  Renderer,
  VideoUploader,
} from './types.js'
