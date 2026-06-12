import { getEnv } from "@repo/config";
import {
  BasePlatformPublisher,
  type MediaType,
  type PostContent,
  type PublishResult,
} from "../base-publisher.js";

// Audit #28: cap uploads at 256 MB to prevent OOM on Workers / edge runtimes.
// Videos above this size must be uploaded via a dedicated job with more memory.
const MAX_UPLOAD_BYTES = 256 * 1024 * 1024;
const CHUNK_SIZE = 10 * 1024 * 1024; // 10 MB per resumable chunk
const MAX_CHUNK_RETRIES = 3;
const RETRY_BASE_MS = 1000;

export type YouTubeFormat = "short" | "video";

export class YouTubePublisher extends BasePlatformPublisher {
  platform: string;
  maxCaptionLength = 5000;
  supportedMediaTypes: MediaType[] = ["video"];

  constructor(private format: YouTubeFormat) {
    super();
    this.platform = format === "short" ? "youtube_shorts" : "youtube";
  }

  async publish(content: PostContent): Promise<PublishResult> {
    try {
      this.validateMedia(content);
      const accessToken = await this.getAccessToken();
      const buffer = content.localPath
        ? await import("node:fs/promises").then((fs) =>
            fs.readFile(content.localPath!),
          )
        : await this.downloadMedia(content.mediaUrl);

      // Audit #28: enforce a size limit before allocating / uploading.
      if (buffer.length > MAX_UPLOAD_BYTES) {
        throw new Error(
          `Video too large: ${buffer.length} bytes (max ${MAX_UPLOAD_BYTES})`,
        );
      }

      const title =
        content.title ??
        this.truncateCaption(
          this.buildFullCaption(content.caption, content.hashtags),
        ).slice(0, 100);
      const description =
        content.description ??
        this.buildFullCaption(content.caption, content.hashtags);

      const metadata = {
        snippet: {
          title:
            this.format === "short" && !title.toLowerCase().includes("#short")
              ? `${title} #Shorts`
              : title,
          description,
          tags: content.hashtags.map((h) => h.replace(/^#/, "")),
          categoryId: "22",
        },
        status: { privacyStatus: "public" },
      };

      const initRes = await fetch(
        "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            "X-Upload-Content-Length": String(buffer.length),
            "X-Upload-Content-Type": "video/mp4",
          },
          body: JSON.stringify(metadata),
        },
      );

      if (!initRes.ok) {
        const err = await initRes.text();
        throw new Error(`YouTube init failed: ${err}`);
      }

      // Audit #28: chunked resumable upload — sends the video in CHUNK_SIZE
      // slices instead of one giant PUT, so a transient network failure
      // resumes from the last successful chunk rather than restarting.
      const uploadUrl = initRes.headers.get("location");
      if (!uploadUrl) {
        throw new Error("YouTube resumable upload URL missing");
      }

      const totalSize = buffer.length;
      let offset = 0;
      let uploadRes: Response | null = null;

      while (offset < totalSize) {
        const end = Math.min(offset + CHUNK_SIZE, totalSize);
        const chunk = buffer.subarray(offset, end);

        // Audit #28: retry transient network failures per-chunk with
        // exponential backoff so the entire upload is not lost on a blip.
        let attempt = 0;
        let chunkRes: Response;
        while (true) {
          try {
            chunkRes = await fetch(uploadUrl, {
              method: "PUT",
              headers: {
                "Content-Length": String(chunk.length),
                "Content-Type": "video/mp4",
                "Content-Range": `bytes ${offset}-${end - 1}/${totalSize}`,
              },
              body: chunk,
            });
            break;
          } catch (err) {
            attempt++;
            if (attempt > MAX_CHUNK_RETRIES) throw err;
            await new Promise((r) => setTimeout(r, RETRY_BASE_MS * 2 ** (attempt - 1)));
          }
        }

        uploadRes = chunkRes!;

        // 308 = Resume Incomplete — expected for every chunk except the last.
        if (uploadRes.status !== 308 && uploadRes.status !== 200 && uploadRes.status !== 201) {
          const errText = await uploadRes.text().catch(() => "");
          throw new Error(`YouTube chunk upload failed at offset ${offset}: HTTP ${uploadRes.status} ${errText}`);
        }

        offset = end;
      }

      if (!uploadRes) {
        throw new Error("YouTube upload produced no response");
      }

      const result = (await uploadRes.json()) as { id?: string };
      if (!result.id) {
        throw new Error("YouTube upload did not return video id");
      }

      return this.success(
        result.id,
        `https://www.youtube.com/watch?v=${result.id}`,
      );
    } catch (error) {
      return this.failure(error);
    }
  }

  private async getAccessToken(): Promise<string> {
    const env = getEnv();
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.YOUTUBE_CLIENT_ID,
        client_secret: env.YOUTUBE_CLIENT_SECRET,
        refresh_token: env.YOUTUBE_REFRESH_TOKEN,
        grant_type: "refresh_token",
      }),
    });
    const data = (await res.json()) as {
      access_token?: string;
      error?: string;
    };
    if (!data.access_token) {
      throw new Error(data.error ?? "YouTube OAuth refresh failed");
    }
    return data.access_token;
  }
}
