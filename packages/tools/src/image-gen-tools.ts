import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { generateImage } from "@repo/generators";
import { buildPosterPrompt } from "@repo/generators";
import { uploadToCosmicCDN } from "@repo/cms";

const posterStyleSchema = z.enum([
  "modern_flat",
  "dark_luxury",
  "bright_viral",
  "minimalist",
  "bold_typographic",
  "photo_realistic",
]);

export const generatePosterImageTool = createTool({
  id: "generate-poster-image",
  description:
    "Generates a poster/image for social media using AI image generation (Replicate FLUX/SDXL)",
  inputSchema: z.object({
    topic: z.string(),
    niche: z.string(),
    style: posterStyleSchema.default("bright_viral"),
    aspectRatio: z.enum(["1:1", "9:16", "16:9", "4:5"]).default("1:1"),
    customPrompt: z.string().optional(),
    model: z
      .enum(["flux-1.1-pro", "sdxl", "flux-dev", "flux-schnell"])
      .default("flux-1.1-pro"),
  }),
  outputSchema: z.object({
    imageUrl: z.string(),
    cdnUrl: z.string(),
    cosmicObjectId: z.string().optional(),
    width: z.number(),
    height: z.number(),
  }),
  execute: async (input) => {
    const style = input.style ?? "bright_viral";
    const aspectRatio = input.aspectRatio ?? "1:1";
    const model = input.model ?? "flux-1.1-pro";

    const { prompt, negativePrompt, width, height } = buildPosterPrompt({
      topic: input.topic,
      niche: input.niche,
      style,
      aspectRatio,
    });

    const finalPrompt = input.customPrompt ?? prompt;

    const [imageUrl] = await generateImage({
      prompt: finalPrompt,
      negativePrompt,
      width,
      height,
      model,
    });

    const { cdnUrl, objectId } = await uploadToCosmicCDN(imageUrl, {
      folder: `posters/${input.niche}`,
      title: input.topic,
    });

    return {
      imageUrl,
      cdnUrl,
      cosmicObjectId: objectId,
      width,
      height,
    };
  },
});
