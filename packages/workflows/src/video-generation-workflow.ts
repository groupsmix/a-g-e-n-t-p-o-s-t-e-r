import { createStep, createWorkflow } from "@mastra/core/workflows";
import { RequestContext } from "@mastra/core/di";
import {
  isValidationError,
  noopObserve,
  type ToolExecutionContext,
} from "@mastra/core/tools";
import { z } from "zod";
import {
  generateVideoScriptTool,
  generateVoiceoverTool,
  generatePosterImageTool,
  renderVideoTool,
  uploadToCosmicTool,
  updateQueueItemTool,
  addAssetToDbTool,
} from "@repo/tools";

const videoInputSchema = z.object({
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
  ctaTarget: z.string().default("link in bio"),
  contentQueueId: z.string(),
});

const scriptStepOutputSchema = z.object({
  script: z.array(z.record(z.string(), z.unknown())),
  fullVoiceoverText: z.string(),
  estimatedDurationSeconds: z.number(),
  compositionId: z.string(),
  contentQueueId: z.string(),
  topic: z.string(),
  niche: z.string(),
});

const voiceoverStepOutputSchema = scriptStepOutputSchema.extend({
  voiceoverCdnUrl: z.string(),
  voiceoverLocalPath: z.string(),
});

const backgroundStepOutputSchema = voiceoverStepOutputSchema.extend({
  backgroundImageUrl: z.string(),
});

const renderStepOutputSchema = backgroundStepOutputSchema.extend({
  localVideoPath: z.string(),
});

const uploadStepOutputSchema = renderStepOutputSchema.extend({
  videoCdnUrl: z.string(),
  cosmicObjectId: z.string().optional(),
});

const workflowOutputSchema = z.object({
  contentQueueId: z.string(),
  videoCdnUrl: z.string(),
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

const generateScriptStep = createStep({
  id: "generate-script",
  inputSchema: videoInputSchema,
  outputSchema: scriptStepOutputSchema,
  execute: async ({ inputData, mastra, requestContext }) => {
    if (!inputData) throw new Error("Missing workflow input");

    const ctx = toolContext(mastra, requestContext);

    await updateQueueItemTool.execute!(
      { id: inputData.contentQueueId, status: "generating" },
      ctx,
    );

    const scriptResult = unwrapToolResult<{
      script: Record<string, unknown>[];
      fullVoiceoverText: string;
      estimatedDurationSeconds: number;
      compositionId: string;
    }>(
      await generateVideoScriptTool.execute!(
        {
          topic: inputData.topic,
          niche: inputData.niche,
          format: inputData.format,
          targetDurationSeconds: inputData.targetDurationSeconds ?? 30,
          includeHook: true,
          includeCTA: true,
          ctaTarget: inputData.ctaTarget ?? "link in bio",
        },
        ctx,
      ),
    );

    return {
      ...scriptResult,
      contentQueueId: inputData.contentQueueId,
      topic: inputData.topic,
      niche: inputData.niche,
    };
  },
});

const generateVoiceoverStep = createStep({
  id: "generate-voiceover",
  inputSchema: scriptStepOutputSchema,
  outputSchema: voiceoverStepOutputSchema,
  execute: async ({ inputData, mastra, requestContext }) => {
    if (!inputData) throw new Error("Missing step input");

    const ctx = toolContext(mastra, requestContext);
    const voiceover = unwrapToolResult<{
      cdnUrl: string;
      localPath: string;
      durationSeconds: number;
    }>(
      await generateVoiceoverTool.execute!(
        {
          text: inputData.fullVoiceoverText,
          contentQueueId: inputData.contentQueueId,
        },
        ctx,
      ),
    );

    return {
      ...inputData,
      voiceoverCdnUrl: voiceover.cdnUrl,
      voiceoverLocalPath: voiceover.localPath,
    };
  },
});

const generateBackgroundStep = createStep({
  id: "generate-background",
  inputSchema: voiceoverStepOutputSchema,
  outputSchema: backgroundStepOutputSchema,
  execute: async ({ inputData, mastra, requestContext }) => {
    if (!inputData) throw new Error("Missing step input");

    const ctx = toolContext(mastra, requestContext);
    const bg = unwrapToolResult<{
      cdnUrl: string;
      imageUrl: string;
      width: number;
      height: number;
      cosmicObjectId?: string;
    }>(
      await generatePosterImageTool.execute!(
        {
          topic: inputData.topic,
          niche: inputData.niche,
          style: "dark_luxury",
          aspectRatio: "9:16",
          model: "flux-schnell",
        },
        ctx,
      ),
    );

    return { ...inputData, backgroundImageUrl: bg.cdnUrl };
  },
});

const renderVideoStep = createStep({
  id: "render-video",
  inputSchema: backgroundStepOutputSchema,
  outputSchema: renderStepOutputSchema,
  execute: async ({ inputData, mastra, requestContext }) => {
    if (!inputData) throw new Error("Missing step input");

    const ctx = toolContext(mastra, requestContext);
    const rendered = unwrapToolResult<{ localPath: string }>(
      await renderVideoTool.execute!(
        {
          compositionId: inputData.compositionId,
          props: {
            topic: inputData.topic,
            script: inputData.script,
            backgroundStyle: "dark_gradient",
            backgroundImageUrl: inputData.backgroundImageUrl,
            voiceoverAudioUrl: inputData.voiceoverCdnUrl,
            niche: inputData.niche,
          },
        },
        ctx,
      ),
    );

    return { ...inputData, localVideoPath: rendered.localPath };
  },
});

const uploadVideoStep = createStep({
  id: "upload-video",
  inputSchema: renderStepOutputSchema,
  outputSchema: uploadStepOutputSchema,
  execute: async ({ inputData, mastra, requestContext }) => {
    if (!inputData) throw new Error("Missing step input");

    const ctx = toolContext(mastra, requestContext);
    const uploaded = unwrapToolResult<{
      cdnUrl: string;
      objectId?: string;
    }>(
      await uploadToCosmicTool.execute!(
        {
          sourceUrlOrPath: inputData.localVideoPath,
          folder: `videos/${inputData.niche}`,
          title: inputData.topic,
        },
        ctx,
      ),
    );

    return {
      ...inputData,
      videoCdnUrl: uploaded.cdnUrl,
      cosmicObjectId: uploaded.objectId,
    };
  },
});

const markReadyStep = createStep({
  id: "mark-ready",
  inputSchema: uploadStepOutputSchema,
  outputSchema: workflowOutputSchema,
  execute: async ({ inputData, mastra, requestContext }) => {
    if (!inputData) throw new Error("Missing step input");

    const ctx = toolContext(mastra, requestContext);

    await addAssetToDbTool.execute!(
      {
        content_queue_id: inputData.contentQueueId,
        type: "video",
        url: inputData.videoCdnUrl,
        cdn_url: inputData.videoCdnUrl,
        cosmic_object_id: inputData.cosmicObjectId,
        metadata: {
          voiceoverCdnUrl: inputData.voiceoverCdnUrl,
          backgroundImageUrl: inputData.backgroundImageUrl,
        },
      },
      ctx,
    );

    await updateQueueItemTool.execute!(
      {
        id: inputData.contentQueueId,
        status: "ready",
        metadata: {
          videoCdnUrl: inputData.videoCdnUrl,
          voiceoverCdnUrl: inputData.voiceoverCdnUrl,
          backgroundImageUrl: inputData.backgroundImageUrl,
          scriptLines: inputData.script.length,
          estimatedDurationSeconds: inputData.estimatedDurationSeconds,
        },
      },
      ctx,
    );

    return {
      contentQueueId: inputData.contentQueueId,
      videoCdnUrl: inputData.videoCdnUrl,
    };
  },
});

export const videoGenerationWorkflow = createWorkflow({
  id: "video-generation",
  inputSchema: videoInputSchema,
  outputSchema: workflowOutputSchema,
})
  .then(generateScriptStep)
  .then(generateVoiceoverStep)
  .then(generateBackgroundStep)
  .then(renderVideoStep)
  .then(uploadVideoStep)
  .then(markReadyStep)
  .commit();
