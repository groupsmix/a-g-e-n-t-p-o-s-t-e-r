import { createStep, createWorkflow } from "@mastra/core/workflows";
import { RequestContext } from "@mastra/core/di";
import {
  isValidationError,
  noopObserve,
  type ToolExecutionContext,
} from "@mastra/core/tools";
import { z } from "zod";
import { getSupabase } from "@repo/core";
import { getPublisher, type PublishResult } from "@repo/publishers";
import {
  generateCaptionTool,
  updateQueueItemTool,
} from "@repo/tools";

const publishingInputSchema = z.object({
  contentQueueId: z.string(),
});

const queueItemSchema = z.object({
  id: z.string(),
  type: z.string(),
  status: z.string(),
  niche: z.string(),
  topic: z.string(),
  platform_targets: z.array(z.string()),
  assets: z
    .array(
      z.object({
        type: z.string(),
        cdn_url: z.string().nullable().optional(),
        url: z.string(),
      }),
    )
    .optional(),
});

const captionsStepSchema = queueItemSchema.extend({
  captionsByPlatform: z.record(
    z.string(),
    z.object({
      caption: z.string(),
      hashtags: z.array(z.string()),
      fullPost: z.string(),
    }),
  ),
});

const publishingOutputSchema = z.object({
  contentQueueId: z.string(),
  results: z.array(
    z.object({
      platform: z.string(),
      success: z.boolean(),
      postId: z.string().optional(),
      postUrl: z.string().optional(),
      error: z.string().optional(),
    }),
  ),
});

type StepRuntimeContext = {
  mastra?: ToolExecutionContext["mastra"];
  requestContext?: ToolExecutionContext["requestContext"];
};

function toolContext(
  mastra: StepRuntimeContext["mastra"],
  requestContext: StepRuntimeContext["requestContext"],
): ToolExecutionContext {
  return {
    mastra,
    requestContext: requestContext ?? new RequestContext(),
    observe: noopObserve,
  };
}

function unwrapToolResult<T>(result: unknown): T {
  if (result === undefined || isValidationError(result)) {
    const message = isValidationError(result)
      ? result.message
      : "Tool returned no output";
    throw new Error(message);
  }
  return result as T;
}

function mapContentTypeForCaption(
  queueType: string,
): "poster" | "video_short" | "video_reel" | "carousel" {
  if (queueType === "poster") return "poster";
  if (queueType === "carousel") return "carousel";
  if (queueType === "video_reel") return "video_reel";
  return "video_short";
}

function mapMediaType(
  queueType: string,
): "image" | "video" | "carousel" {
  if (queueType === "poster") return "image";
  if (queueType === "carousel") return "carousel";
  return "video";
}

type CaptionPlatform =
  | "tiktok"
  | "instagram_feed"
  | "instagram_reels"
  | "instagram_story"
  | "youtube_shorts"
  | "twitter"
  | "linkedin"
  | "pinterest"
  | "threads";

const loadQueueItemStep = createStep({
  id: "load-queue-item",
  inputSchema: publishingInputSchema,
  outputSchema: queueItemSchema,
  execute: async ({ inputData }) => {
    if (!inputData) throw new Error("Missing workflow input");

    const { data, error } = await getSupabase()
      .from("content_queue")
      .select("*, assets(*)")
      .eq("id", inputData.contentQueueId)
      .single();

    if (error || !data) {
      throw new Error(
        `Queue item not found: ${inputData.contentQueueId} (${error?.message ?? "no data"})`,
      );
    }

    return {
      id: data.id,
      type: data.type,
      status: data.status,
      niche: data.niche,
      topic: data.topic,
      platform_targets: data.platform_targets ?? [],
      assets: data.assets ?? [],
    };
  },
});

const generateCaptionsStep = createStep({
  id: "generate-captions",
  inputSchema: queueItemSchema,
  outputSchema: captionsStepSchema,
  execute: async ({ inputData, mastra, requestContext }) => {
    if (!inputData) throw new Error("Missing step input");

    const ctx = toolContext(mastra, requestContext);
    const captionsByPlatform: z.infer<
      typeof captionsStepSchema
    >["captionsByPlatform"] = {};

    const contentType = mapContentTypeForCaption(inputData.type);

    for (const platform of inputData.platform_targets) {
      const captionResult = unwrapToolResult<{
        caption: string;
        hashtags: string[];
        fullPost: string;
      }>(
        await generateCaptionTool.execute!(
          {
            topic: inputData.topic,
            niche: inputData.niche,
            platform: platform as CaptionPlatform,
            contentType,
            affiliateLinkPlaceholder: true,
            brandVoice: "entertaining",
          },
          ctx,
        ),
      );

      captionsByPlatform[platform] = captionResult;
    }

    return { ...inputData, captionsByPlatform };
  },
});

const publishToPlatformsStep = createStep({
  id: "publish-to-platforms",
  inputSchema: captionsStepSchema,
  outputSchema: publishingOutputSchema,
  execute: async ({ inputData, mastra, requestContext }) => {
    if (!inputData) throw new Error("Missing step input");

    const ctx = toolContext(mastra, requestContext);
    const mediaType = mapMediaType(inputData.type);
    const assetType = inputData.type === "poster" ? "image" : "video";

    const primaryAsset = inputData.assets?.find((a) => a.type === assetType);
    if (!primaryAsset) {
      throw new Error("No primary asset found for queue item");
    }

    const mediaUrl = primaryAsset.cdn_url ?? primaryAsset.url;
    if (!mediaUrl) {
      throw new Error("Primary asset has no CDN URL");
    }

    await updateQueueItemTool.execute!(
      { id: inputData.id, status: "publishing" },
      ctx,
    );

    const results: PublishResult[] = [];

    for (const platform of inputData.platform_targets) {
      const captions = inputData.captionsByPlatform[platform];
      if (!captions) {
        throw new Error(`Missing captions for platform: ${platform}`);
      }

      const publisher = getPublisher(platform);
      const result = await publisher.publish({
        type: mediaType,
        mediaUrl,
        caption: captions.caption,
        hashtags: captions.hashtags,
        title: inputData.topic,
        description: captions.fullPost,
      });

      await getSupabase().from("published_posts").insert({
        content_queue_id: inputData.id,
        platform,
        platform_post_id: result.postId ?? null,
        platform_url: result.postUrl ?? null,
        caption: captions.caption,
        hashtags: captions.hashtags,
        status: result.success ? "published" : "failed",
        published_at: result.publishedAt.toISOString(),
        metadata: result.error ? { error: result.error } : {},
      });

      results.push(result);
    }

    const allSucceeded = results.every((r) => r.success);

    await getSupabase()
      .from("content_queue")
      .update({
        status: allSucceeded ? "published" : "failed",
        published_at: allSucceeded ? new Date().toISOString() : null,
        error: allSucceeded
          ? null
          : results
              .filter((r) => !r.success)
              .map((r) => `${r.platform}: ${r.error}`)
              .join("; "),
      })
      .eq("id", inputData.id);

    return {
      contentQueueId: inputData.id,
      results: results.map((r) => ({
        platform: r.platform,
        success: r.success,
        postId: r.postId,
        postUrl: r.postUrl,
        error: r.error,
      })),
    };
  },
});

export const publishingWorkflow = createWorkflow({
  id: "publishing",
  inputSchema: publishingInputSchema,
  outputSchema: publishingOutputSchema,
})
  .then(loadQueueItemStep)
  .then(generateCaptionsStep)
  .then(publishToPlatformsStep)
  .commit();
