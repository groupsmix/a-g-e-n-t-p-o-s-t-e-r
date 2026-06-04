import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { renderVideo } from "@repo/generators";

export const renderVideoTool = createTool({
  id: "render-video",
  description: "Renders a Remotion composition to an MP4 file on disk",
  inputSchema: z.object({
    compositionId: z.string(),
    props: z.record(z.unknown()),
    outputPath: z.string().optional(),
    codec: z.enum(["h264", "h265", "vp8", "vp9"]).optional(),
    crf: z.number().optional(),
  }),
  outputSchema: z.object({
    localPath: z.string(),
  }),
  execute: async (input) => {
    const localPath = await renderVideo({
      compositionId: input.compositionId,
      props: input.props,
      outputPath: input.outputPath,
      codec: input.codec,
      crf: input.crf,
    });
    return { localPath };
  },
});
