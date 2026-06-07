/**
 * Video Factory types (TASK-602).
 *
 * The agent doesn't render pixels itself — it plans a typed
 * SceneGraph that a Remotion renderer (or any conforming renderer)
 * executes.  This keeps the agent testable in pure Node and lets
 * heavy rendering happen in a separate worker / container.
 *
 * Pipeline:
 *   parseBrief → planScenes → composeStoryboard → render → captions → upload
 */

export type AspectRatio = '9:16' | '16:9' | '1:1' | '4:5'
export type SceneKind =
  | 'text-carousel'
  | 'data-viz'
  | 'product-showcase'
  | 'news-reel'
  | 'quote-card'

export interface VideoBrief {
  topic: string
  /** Hook line — first 2 seconds. */
  hook: string
  /** Full script / talking-points. The planner segments it. */
  script: string
  aspect?: AspectRatio
  /** Target length in seconds (planner respects it). */
  durationSec?: number
  /** Optional product/data payloads the planner can use. */
  product?: { name: string; price?: string; imageUrl?: string; bullets?: string[] }
  data?: Array<{ label: string; value: number }>
  /** Optional brand palette. */
  palette?: { bg: string; fg: string; accent: string }
}

export interface SceneBase {
  id: string
  /** Duration in seconds. */
  durationSec: number
  caption: string
}

export interface TextCarouselScene extends SceneBase {
  kind: 'text-carousel'
  bullets: string[]
}

export interface DataVizScene extends SceneBase {
  kind: 'data-viz'
  title: string
  series: Array<{ label: string; value: number }>
}

export interface ProductShowcaseScene extends SceneBase {
  kind: 'product-showcase'
  name: string
  price?: string
  imageUrl?: string
  bullets: string[]
}

export interface NewsReelScene extends SceneBase {
  kind: 'news-reel'
  headline: string
  source?: string
}

export interface QuoteCardScene extends SceneBase {
  kind: 'quote-card'
  quote: string
  author?: string
}

export type Scene =
  | TextCarouselScene
  | DataVizScene
  | ProductShowcaseScene
  | NewsReelScene
  | QuoteCardScene

export interface Storyboard {
  brief: VideoBrief
  aspect: AspectRatio
  durationSec: number
  scenes: Scene[]
  palette: { bg: string; fg: string; accent: string }
}

export interface CaptionCue {
  start: number   // seconds
  end: number
  text: string
}

export interface RenderResult {
  ok: boolean
  videoPath?: string
  /** Inline base64 (used in tests / dry-run). */
  videoBase64?: string
  error?: string
  durationSec?: number
}

export interface UploadResult {
  ok: boolean
  url?: string
  id?: string
  provider: string
  error?: string
}

export interface VideoReport {
  brief: VideoBrief
  storyboard: Storyboard
  captions: CaptionCue[]
  render: RenderResult
  upload?: UploadResult
}

// ── Clients ─────────────────────────────────────────────────────────────────

export interface LLMClient {
  complete(args: {
    system?: string
    messages: Array<{ role: 'user' | 'assistant'; content: string }>
    maxTokens?: number
    temperature?: number
    json?: boolean
  }): Promise<{ content: string; inputTokens?: number; outputTokens?: number }>
}

export interface Renderer {
  render(storyboard: Storyboard): Promise<RenderResult>
}

export interface VideoUploader {
  upload(args: {
    title: string
    description: string
    videoPath?: string
    videoBase64?: string
    aspect: AspectRatio
  }): Promise<UploadResult>
}
