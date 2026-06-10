import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getSupabase } from "@repo/core";

const queueStatusSchema = z.enum([
  "pending",
  "generating",
  "ready",
  "publishing",
  "published",
  "failed",
]);

// Audit #18: platform_targets used to accept any string, so typos like
// "instagram" or "tikTok" sailed into the queue and only exploded later in
// publisher-factory. This list must stay in sync with the publishers map in
// packages/publishers/src/publisher-factory.ts.
const publishPlatformSchema = z.enum([
  "tiktok",
  "instagram_feed",
  "instagram_reels",
  "instagram_story",
  "youtube_shorts",
  "youtube",
  "twitter",
  "pinterest",
  "linkedin",
  "threads",
]);

export const addToQueueTool = createTool({
  id: "add-to-content-queue",
  description: "Adds a new content item to the generation queue",
  inputSchema: z.object({
    type: z.enum([
      "poster",
      "video_short",
      "video_reel",
      "video_story",
      "carousel",
    ]),
    niche: z.string(),
    topic: z.string(),
    keywords: z.array(z.string()),
    platform_targets: z.array(publishPlatformSchema).min(1),
    source_url: z.string().optional(),
    // Audit #18: must be a real ISO-8601 timestamp, not any string.
    scheduled_at: z.string().datetime({ offset: true }).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  }),
  outputSchema: z.object({
    id: z.string(),
    created: z.boolean(),
  }),
  execute: async (input) => {
    const { data, error } = await getSupabase()
      .from("content_queue")
      .insert({
        type: input.type,
        niche: input.niche,
        topic: input.topic,
        keywords: input.keywords,
        platform_targets: input.platform_targets,
        source_url: input.source_url,
        scheduled_at: input.scheduled_at ?? new Date().toISOString(),
        metadata: input.metadata ?? {},
      })
      .select("id")
      .single();
    return { id: data?.id ?? "", created: !error };
  },
});

export const getQueueStatusTool = createTool({
  id: "get-queue-status",
  description: "Returns counts of items in each status in the content queue",
  inputSchema: z.object({}),
  outputSchema: z.object({
    pending: z.number(),
    generating: z.number(),
    ready: z.number(),
    publishing: z.number(),
    published: z.number(),
    failed: z.number(),
  }),
  execute: async () => {
    const { data } = await getSupabase().from("content_queue").select("status");
    const counts = {
      pending: 0,
      generating: 0,
      ready: 0,
      publishing: 0,
      published: 0,
      failed: 0,
    };
    data?.forEach((row) => {
      const status = row.status as keyof typeof counts;
      if (status in counts) counts[status]++;
    });
    return counts;
  },
});

export const getNextBatchTool = createTool({
  id: "get-next-batch",
  description:
    "Returns the next N pending items from the queue sorted by scheduled_at",
  inputSchema: z.object({ limit: z.number().default(10) }),
  outputSchema: z.object({
    items: z.array(z.record(z.string(), z.unknown())),
  }),
  execute: async ({ limit }) => {
    const rowLimit = limit ?? 10;
    const { data } = await getSupabase()
      .from("content_queue")
      .select("*")
      .eq("status", "pending")
      .order("scheduled_at", { ascending: true })
      .limit(rowLimit);
    return { items: data ?? [] };
  },
});

export const updateQueueItemTool = createTool({
  id: "update-queue-item",
  description: "Updates the status or metadata of a queue item",
  inputSchema: z.object({
    id: z.string(),
    status: queueStatusSchema.optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    error: z.string().optional(),
  }),
  outputSchema: z.object({ updated: z.boolean() }),
  execute: async ({ id, status, metadata, error }) => {
    const updates: Record<string, unknown> = {};
    if (status) updates.status = status;
    if (metadata) {
      // Audit #19: metadata used to be replaced wholesale, so a publish step
      // writing { publishedUrl } would wipe the videoCdnUrl/voiceoverCdnUrl
      // written earlier in the pipeline. Merge with what's already there.
      const { data: existing } = await getSupabase()
        .from("content_queue")
        .select("metadata")
        .eq("id", id)
        .single();
      updates.metadata = {
        ...((existing?.metadata as Record<string, unknown> | null) ?? {}),
        ...metadata,
      };
    }
    if (error) updates.error = error;
    const { error: dbError } = await getSupabase()
      .from("content_queue")
      .update(updates)
      .eq("id", id);
    return { updated: !dbError };
  },
});
