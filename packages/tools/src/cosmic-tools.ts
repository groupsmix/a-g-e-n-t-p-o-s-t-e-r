import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
  uploadToCosmicCDN,
  generateAIVideo,
  createCosmicObject,
  getCosmicObject,
  findCosmicObjects,
  updateCosmicObject,
  OBJECT_TYPES,
} from "@repo/cms";

const objectTypeSchema = z.enum([
  OBJECT_TYPES.BLOG_POST,
  OBJECT_TYPES.PRODUCT_REVIEW,
  OBJECT_TYPES.LANDING_PAGE,
  OBJECT_TYPES.COMPARISON_PAGE,
  OBJECT_TYPES.AFFILIATE_PRODUCT,
  OBJECT_TYPES.SITE_CONFIG,
  OBJECT_TYPES.VIDEO_ASSET,
  OBJECT_TYPES.POSTER_ASSET,
]);

export const uploadToCosmicTool = createTool({
  id: "upload-to-cosmic",
  description: "Uploads a local file or remote URL to CosmicJS CDN",
  inputSchema: z.object({
    sourceUrlOrPath: z.string(),
    folder: z.string().optional(),
    title: z.string().optional(),
  }),
  outputSchema: z.object({
    cdnUrl: z.string(),
    objectId: z.string().optional(),
    title: z.string().optional(),
  }),
  execute: async (input) => {
    return uploadToCosmicCDN(input.sourceUrlOrPath, {
      folder: input.folder,
      title: input.title,
    });
  },
});

export const generateCosmicAIVideoTool = createTool({
  id: "generate-cosmic-ai-video",
  description:
    "Generates an AI video with Cosmic Veo and stores it in the media library",
  inputSchema: z.object({
    prompt: z.string(),
    duration: z.union([z.literal(4), z.literal(6), z.literal(8)]).default(8),
    resolution: z.enum(["720p", "1080p"]).default("720p"),
    referenceImages: z.array(z.string().url()).optional(),
    folder: z.string().optional(),
  }),
  outputSchema: z.object({
    url: z.string(),
    imgixUrl: z.string(),
    duration: z.number(),
    mediaId: z.string(),
  }),
  execute: async (input) => {
    const duration = input.duration ?? 8;
    const resolution = input.resolution ?? "720p";
    return generateAIVideo({
      prompt: input.prompt,
      duration,
      resolution,
      referenceImages: input.referenceImages,
      folder: input.folder,
    });
  },
});

export const createCosmicObjectTool = createTool({
  id: "create-cosmic-object",
  description: "Creates a Cosmic CMS object (blog post, review, asset, etc.)",
  inputSchema: z.object({
    type: objectTypeSchema,
    title: z.string(),
    slug: z.string().optional(),
    content: z.string().optional(),
    metadata: z.record(z.unknown()).optional(),
    status: z.enum(["draft", "published"]).default("draft"),
    thumbnail: z.string().optional(),
  }),
  outputSchema: z.object({
    id: z.string(),
    title: z.string(),
    slug: z.string(),
    type: z.string(),
    status: z.string().optional(),
  }),
  execute: async (input) => {
    const object = await createCosmicObject({
      type: input.type,
      title: input.title,
      slug: input.slug,
      content: input.content,
      metadata: input.metadata,
      status: input.status ?? "draft",
      thumbnail: input.thumbnail,
    });
    return {
      id: object.id,
      title: object.title,
      slug: object.slug,
      type: object.type,
      status: object.status,
    };
  },
});

export const getCosmicObjectTool = createTool({
  id: "get-cosmic-object",
  description: "Fetches a single Cosmic CMS object by ID",
  inputSchema: z.object({
    id: z.string(),
  }),
  outputSchema: z.object({
    found: z.boolean(),
    object: z
      .object({
        id: z.string(),
        title: z.string(),
        slug: z.string(),
        type: z.string(),
        metadata: z.record(z.unknown()),
        status: z.string().optional(),
      })
      .optional(),
  }),
  execute: async (input) => {
    const object = await getCosmicObject(input.id);
    if (!object) {
      return { found: false };
    }
    return {
      found: true,
      object: {
        id: object.id,
        title: object.title,
        slug: object.slug,
        type: object.type,
        metadata: object.metadata,
        status: object.status,
      },
    };
  },
});

export const findCosmicObjectsTool = createTool({
  id: "find-cosmic-objects",
  description: "Lists Cosmic CMS objects by type and optional status",
  inputSchema: z.object({
    type: objectTypeSchema,
    status: z.enum(["draft", "published"]).optional(),
    limit: z.number().min(1).max(100).default(25),
    props: z.string().optional(),
  }),
  outputSchema: z.object({
    objects: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        slug: z.string(),
        type: z.string(),
        status: z.string().optional(),
      }),
    ),
  }),
  execute: async (input) => {
    const objects = await findCosmicObjects({
      type: input.type,
      status: input.status,
      limit: input.limit ?? 25,
      props: input.props,
    });
    return {
      objects: objects.map((o) => ({
        id: o.id,
        title: o.title,
        slug: o.slug,
        type: o.type,
        status: o.status,
      })),
    };
  },
});

export const updateCosmicObjectTool = createTool({
  id: "update-cosmic-object",
  description: "Updates an existing Cosmic CMS object",
  inputSchema: z.object({
    id: z.string(),
    title: z.string().optional(),
    slug: z.string().optional(),
    content: z.string().optional(),
    metadata: z.record(z.unknown()).optional(),
    status: z.enum(["draft", "published"]).optional(),
    thumbnail: z.string().optional(),
  }),
  outputSchema: z.object({
    id: z.string(),
    title: z.string(),
    slug: z.string(),
    type: z.string(),
    status: z.string().optional(),
  }),
  execute: async (input) => {
    const { id, ...updates } = input;
    const object = await updateCosmicObject(id, updates);
    return {
      id: object.id,
      title: object.title,
      slug: object.slug,
      type: object.type,
      status: object.status,
    };
  },
});
