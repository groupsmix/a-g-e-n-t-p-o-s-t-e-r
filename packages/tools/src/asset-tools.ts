import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getSupabase } from "@repo/core";

export const addAssetToDbTool = createTool({
  id: "add-asset-to-db",
  description:
    "Saves a generated asset (image, video, caption, etc.) linked to a content queue item",
  inputSchema: z.object({
    content_queue_id: z.string().uuid(),
    type: z.enum([
      "image",
      "video",
      "audio",
      "caption",
      "script",
      "thumbnail",
    ]),
    url: z.string().url(),
    cdn_url: z.string().url().optional(),
    cosmic_object_id: z.string().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
    duration_seconds: z.number().optional(),
    file_size_bytes: z.number().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  }),
  outputSchema: z.object({
    id: z.string(),
    created: z.boolean(),
  }),
  execute: async (input) => {
    const { data, error } = await getSupabase()
      .from("assets")
      .insert({
        content_queue_id: input.content_queue_id,
        type: input.type,
        url: input.url,
        cdn_url: input.cdn_url ?? input.url,
        cosmic_object_id: input.cosmic_object_id,
        width: input.width,
        height: input.height,
        duration_seconds: input.duration_seconds,
        file_size_bytes: input.file_size_bytes,
        metadata: input.metadata ?? {},
      })
      .select("id")
      .single();

    return { id: data?.id ?? "", created: !error };
  },
});
