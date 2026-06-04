import * as fs from "node:fs/promises";
import * as path from "node:path";
import { getCosmic } from "./cosmic-bucket.js";

export interface UploadResult {
  cdnUrl: string;
  objectId?: string;
  title?: string;
}

export interface AIVideoResult {
  url: string;
  imgixUrl: string;
  duration: number;
  mediaId: string;
}

function contentTypeForExt(ext: string): string {
  if (ext === "mp4") return "video/mp4";
  if (ext === "mp3") return "audio/mpeg";
  if (ext === "webp") return "image/webp";
  if (ext === "png") return "image/png";
  if (ext === "gif") return "image/gif";
  return "image/jpeg";
}

function sanitizeFilename(title: string): string {
  return title.replace(/[^\w.-]+/g, "_");
}

/** Upload remote URL or local file path to Cosmic media library. */
export async function uploadToCosmicCDN(
  sourceUrlOrPath: string,
  options: { folder?: string; title?: string },
): Promise<UploadResult> {
  const cosmic = getCosmic();
  const isUrl = sourceUrlOrPath.startsWith("http");

  let buffer: Buffer;
  let ext: string;

  if (isUrl) {
    const response = await fetch(sourceUrlOrPath);
    if (!response.ok) {
      throw new Error(`Failed to fetch asset: ${response.status}`);
    }
    buffer = Buffer.from(await response.arrayBuffer());
    ext =
      sourceUrlOrPath.split(".").pop()?.split("?")[0]?.toLowerCase() ?? "jpg";
  } else {
    buffer = await fs.readFile(sourceUrlOrPath);
    ext = path.extname(sourceUrlOrPath).slice(1).toLowerCase() || "jpg";
  }

  const filename = `${sanitizeFilename(options.title ?? String(Date.now()))}.${ext}`;

  const result = await cosmic.media.insertOne({
    media: {
      buffer,
      originalname: filename,
      type: contentTypeForExt(ext),
    },
    folder: options.folder,
  });

  const media = result?.media;
  const cdnUrl = media?.imgix_url ?? media?.url;
  if (!cdnUrl) {
    throw new Error("Cosmic upload succeeded but no CDN URL returned");
  }

  return {
    cdnUrl,
    objectId: media?.id,
    title: media?.name ?? media?.original_name,
  };
}

/** Generate AI video via Cosmic Veo and store in the media library. */
export async function generateAIVideo(params: {
  prompt: string;
  duration?: 4 | 6 | 8;
  resolution?: "720p" | "1080p";
  referenceImages?: string[];
  folder?: string;
}): Promise<AIVideoResult> {
  const cosmic = getCosmic();
  const result = await cosmic.ai.generateVideo({
    prompt: params.prompt,
    duration: params.duration ?? 8,
    resolution: params.resolution ?? "720p",
    reference_images: params.referenceImages,
    folder: params.folder ?? "ai-videos",
  });

  const duration =
    result.media.metadata?.duration ?? params.duration ?? 8;

  return {
    url: result.media.url,
    imgixUrl: result.media.imgix_url,
    duration,
    mediaId: result.media.id,
  };
}
