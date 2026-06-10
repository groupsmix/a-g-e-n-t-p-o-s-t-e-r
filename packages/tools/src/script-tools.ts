import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { generateObject } from "ai";

const SCRIPT_MODEL = "anthropic/claude-sonnet-4-5";

const scriptLineSchema = z.object({
  text: z.string(),
  startFrame: z.number(),
  durationFrames: z.number(),
  style: z.enum(["headline", "subtitle", "caption"]),
  voiceText: z.string(),
});

const scriptOutputSchema = z.object({
  script: z.array(scriptLineSchema),
  fullVoiceoverText: z.string(),
  estimatedDurationSeconds: z.number(),
  compositionId: z.string(),
});

export const generateVideoScriptTool = createTool({
  id: "generate-video-script",
  description: "Generates a timed script for a short-form video",
  inputSchema: z.object({
    topic: z.string(),
    niche: z.string(),
    format: z.enum([
      "did_you_know",
      "how_to",
      "vs_comparison",
      "story",
      "countdown",
      "news_reaction",
      "motivational",
    ]),
    targetDurationSeconds: z.number().default(30),
    includeHook: z.boolean().default(true),
    includeCTA: z.boolean().default(true),
    ctaTarget: z.string().default("link in bio"),
  }),
  outputSchema: scriptOutputSchema,
  execute: async (input) => {
    const targetDurationSeconds = input.targetDurationSeconds ?? 30;
    // Audit #20: schema-enforced output instead of regex + JSON.parse.
    const { object } = await generateObject({
      model: SCRIPT_MODEL,
      schema: scriptOutputSchema,
      prompt: `Create a ${input.format} short-form video script for this topic: "${input.topic}" in the ${input.niche} niche.

Target duration: ${input.targetDurationSeconds} seconds at 30fps.
${input.includeHook ? "Start with a 3-second attention hook that creates curiosity or shock." : ""}
${input.includeCTA ? `End with a CTA pointing to: ${input.ctaTarget}` : ""}

Rules:
- "text" is the display text on screen — each card max 8 words, short and punchy
- "voiceText" is what the AI voice says — can be 1-2 sentences per card
- "fullVoiceoverText" is the complete voiceover script as one string
- Use ${targetDurationSeconds * 30} total frames
- Hook = first 3 seconds (90 frames)
- CTA = last 3 seconds
- "compositionId" is "ShortVideo"`,
    });

    return object;
  },
});
