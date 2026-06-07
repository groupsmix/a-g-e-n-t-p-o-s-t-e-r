/**
 * Top-level orchestrator: buildPrompt → generateBatch → storeImages.
 */

import type {
  ImageBrief,
  ImageProvider,
  ImageReport,
  ImageStore,
  LLMClient,
} from '../types.js'
import { buildPrompt } from './prompt-builder.js'
import { generateBatch } from './generator.js'
import { storeImages } from './storer.js'

export interface ImageGenDeps {
  provider?: ImageProvider
  store?: ImageStore
  llm?: LLMClient
}

export function dryRunProvider(): ImageProvider {
  return {
    name: 'dry-run',
    async generate({ prompt, aspect, seed }) {
      const id = `dry_${aspect}_${seed ?? 0}`
      return {
        id,
        prompt,
        aspect,
        imageBase64: 'dryrun',
        mime: 'image/png',
        provider: 'dry-run',
      }
    },
  }
}

export async function runImageGen(
  brief: ImageBrief,
  deps: ImageGenDeps = {},
): Promise<ImageReport> {
  const prompt = await buildPrompt(brief, deps.llm)
  const provider = deps.provider ?? dryRunProvider()
  const { images, failures } = await generateBatch(brief, prompt, provider)
  const stored = await storeImages(images, brief.prompt, deps.store)
  return { brief, prompt, images: stored, failures }
}
