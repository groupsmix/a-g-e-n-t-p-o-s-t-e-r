import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { generateText } from "ai";

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

function parseJsonFromModel<T>(text: string): T {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = fenced ? fenced[1].trim() : trimmed;
  return JSON.parse(jsonStr) as T;
}

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
    const { text } = await generateText({
      model: SCRIPT_MODEL,
      prompt: `Create a ${input.format} short-form video script for this topic: "${input.topic}" in the ${input.niche} niche.

Target duration: ${input.targetDurationSeconds} seconds at 30fps.
${input.includeHook ? "Start with a 3-second attention hook that creates curiosity or shock." : ""}
${input.includeCTA ? `End with a CTA pointing to: ${input.ctaTarget}` : ""}

Return JSON only:
{
  "script": [
    {
      "text": "display text on screen (short, punchy)",
      "startFrame": 0,
      "durationFrames": 90,
      "style": "headline",
      "voiceText": "what the AI voice says (can be longer than display text)"
    }
  ],
  "fullVoiceoverText": "complete voiceover script as one string",
  "estimatedDurationSeconds": 30,
  "compositionId": "ShortVideo"
}

Rules:
- Each text card max 8 words on screen
- Voice text can be 1-2 sentences
- Use ${targetDurationSeconds * 30} total frames
- Hook = first 3 seconds (90 frames)
- CTA = last 3 seconds`,
    });

    return parseJsonFromModel<z.infer<typeof scriptOutputSchema>>(text);
  },
});
