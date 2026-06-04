import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { generateVoiceover } from "@repo/generators";
import { uploadToCosmicCDN } from "@repo/cms";

export const generateVoiceoverTool = createTool({
  id: "generate-voiceover",
  description: "Generates an AI voiceover for a script using ElevenLabs",
  inputSchema: z.object({
    text: z.string(),
    contentQueueId: z.string().optional(),
  }),
  outputSchema: z.object({
    localPath: z.string(),
    cdnUrl: z.string(),
    durationSeconds: z.number(),
  }),
  execute: async (input) => {
    const localPath = await generateVoiceover(input.text);
    const { cdnUrl } = await uploadToCosmicCDN(localPath, {
      folder: "voiceovers",
      title: `voiceover_${Date.now()}`,
    });
    const wordCount = input.text.split(/\s+/).filter(Boolean).length;
    const durationSeconds = wordCount / 2.5;
    return { localPath, cdnUrl, durationSeconds };
  },
});
