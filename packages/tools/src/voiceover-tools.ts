import { createTool } from "@mastra/core/tools";
import fs from "node:fs/promises";
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
    cdnUrl: z.string(),
    durationSeconds: z.number(),
  }),
  execute: async (input) => {
    // Audit #47: the voiceover is written to a temp file purely so it can be
    // uploaded to the CDN. Delete it as soon as the upload settles — daily
    // cron runs were quietly filling the runner's tmpdir with MP3s.
    const localPath = await generateVoiceover(input.text);
    let cdnUrl: string;
    try {
      ({ cdnUrl } = await uploadToCosmicCDN(localPath, {
        folder: "voiceovers",
        title: `voiceover_${Date.now()}`,
      }));
    } finally {
      await fs.unlink(localPath).catch(() => {});
    }
    const wordCount = input.text.split(/\s+/).filter(Boolean).length;
    const durationSeconds = wordCount / 2.5;
    return { cdnUrl, durationSeconds };
  },
});
