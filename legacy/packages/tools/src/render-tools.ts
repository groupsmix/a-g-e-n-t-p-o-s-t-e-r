import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { renderVideo } from "@repo/generators";

export const renderVideoTool = createTool({
  id: "render-video",
  description: "Renders a Remotion composition to an MP4 file on disk",
  inputSchema: z.object({
    compositionId: z.string(),
    props: z.record(z.string(), z.unknown()),
    outputPath: z.string().optional(),
    codec: z.enum(["h264", "h265", "vp8", "vp9"]).optional(),
    crf: z.number().optional(),
  }),
  outputSchema: z.object({
    localPath: z.string(),
    tempDir: z.string().nullable().optional(),
  }),
  execute: async (input) => {
    // Audit #47: returns both the file path and the per-run temp directory.
    // The caller is responsible for cleanup (e.g. after uploading to CDN)
    // via cleanupTempVideoDir(tempDir) from @repo/generators.
    const { filePath: localPath, tempDir } = await renderVideo({
      compositionId: input.compositionId,
      props: input.props,
      outputPath: input.outputPath,
      codec: input.codec,
      crf: input.crf,
    });
    return { localPath, tempDir };
  },
});
