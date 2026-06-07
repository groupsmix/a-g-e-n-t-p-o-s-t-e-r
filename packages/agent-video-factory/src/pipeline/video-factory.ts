/**
 * Top-level orchestrator: plan → captions → render → upload.
 *
 * Renderer + uploader are injected so tests run with dry-run versions
 * and prod runs with Remotion + storage adapters.
 */

import type {
  AspectRatio,
  CaptionCue,
  LLMClient,
  Renderer,
  Storyboard,
  VideoBrief,
  VideoReport,
  VideoUploader,
} from '../types.js'
import { planScenes, type PlannerOptions } from './planner.js'
import { generateCaptions } from './captions.js'

export interface VideoFactoryDeps {
  llm?: LLMClient
  renderer?: Renderer
  uploader?: VideoUploader
}

export interface VideoFactoryInput {
  brief: VideoBrief
  planner?: PlannerOptions
  /** When true, skip render + upload; useful for fast planning loops. */
  storyboardOnly?: boolean
}

export function dryRunRenderer(): Renderer {
  return {
    async render(story) {
      return {
        ok: true,
        videoBase64: 'dryrun',
        durationSec: story.durationSec,
      }
    },
  }
}

export async function runVideoFactory(
  input: VideoFactoryInput,
  deps: VideoFactoryDeps = {},
): Promise<VideoReport> {
  const storyboard = await planScenes(input.brief, input.planner ?? {}, deps.llm)
  const captions = generateCaptions(storyboard)
  if (input.storyboardOnly) {
    return {
      brief: input.brief,
      storyboard,
      captions,
      render: { ok: true, durationSec: storyboard.durationSec },
    }
  }
  const renderer = deps.renderer ?? dryRunRenderer()
  let render
  try {
    render = await renderer.render(storyboard)
  } catch (err) {
    render = { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
  let upload
  if (render.ok && deps.uploader) {
    try {
      upload = await deps.uploader.upload({
        title: input.brief.hook || input.brief.topic,
        description: input.brief.script.slice(0, 800),
        videoPath: render.videoPath,
        videoBase64: render.videoBase64,
        aspect: storyboard.aspect,
      })
    } catch (err) {
      upload = {
        ok: false,
        provider: 'unknown',
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }
  return { brief: input.brief, storyboard, captions, render, upload }
}
