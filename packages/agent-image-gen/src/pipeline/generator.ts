/**
 * Stage 2 — fan out across aspects × variants and provider.generate.
 * Per-call failures are recorded in `failures` so partial successes
 * still ship.
 */

import type {
  GeneratedImage,
  ImageAspect,
  ImageBrief,
  ImageProvider,
} from '../types.js'

const DEFAULT_ASPECTS: ImageAspect[] = ['1:1']

export async function generateBatch(
  brief: ImageBrief,
  prompt: string,
  provider: ImageProvider,
): Promise<{
  images: GeneratedImage[]
  failures: Array<{ aspect: ImageAspect; variant: number; error: string }>
}> {
  const aspects = brief.aspects?.length ? brief.aspects : DEFAULT_ASPECTS
  const variants = Math.max(1, brief.variants ?? 1)
  const images: GeneratedImage[] = []
  const failures: Array<{ aspect: ImageAspect; variant: number; error: string }> = []

  const tasks: Array<Promise<void>> = []
  for (const aspect of aspects) {
    for (let v = 0; v < variants; v++) {
      const seed = brief.seed != null ? brief.seed + v : undefined
      tasks.push(
        (async () => {
          try {
            const img = await provider.generate({
              prompt,
              aspect,
              seed,
              negative: brief.negative,
            })
            images.push({ ...img, id: img.id || `img_${aspect}_${v}` })
          } catch (err) {
            failures.push({
              aspect,
              variant: v,
              error: err instanceof Error ? err.message : String(err),
            })
          }
        })(),
      )
    }
  }
  await Promise.all(tasks)
  return { images, failures }
}
