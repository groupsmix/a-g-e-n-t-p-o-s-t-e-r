import { getEnv } from "@repo/config";
import {
  BasePlatformPublisher,
  type MediaType,
  type PostContent,
  type PublishResult,
} from "../base-publisher.js";

export type YouTubeFormat = "short" | "video";

export class YouTubePublisher extends BasePlatformPublisher {
  platform: string;
  maxCaptionLength = 5000;
  supportedMediaTypes: MediaType[] = ["video"];

  constructor(private format: YouTubeFormat) {
    super();
    this.platform = format === "short" ? "youtube_shorts" : "youtube";
  }

  protected async doPublish(content: PostContent): Promise<PublishResult> {
    try {
      const accessToken = await this.getAccessToken();
      // Audit #28: don't buffer the entire video in memory. Resolve a sized
      // source (stream + byte length) and pipe it into the resumable upload;
      // falls back to buffering only when the source size is unknowable.
      const source = await this.resolveSource(content);

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
            "X-Upload-Content-Length": String(source.size),
            "X-Upload-Content-Type": "video/mp4",
          },
          body: JSON.stringify(metadata),
        },
      );

      if (!initRes.ok) {
        const err = await initRes.text();
        throw new Error(`YouTube init failed: ${err}`);
      }

      const uploadUrl = initRes.headers.get("location");
      if (!uploadUrl) {
        throw new Error("YouTube resumable upload URL missing");
      }

      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Length": String(source.size),
          "Content-Type": "video/mp4",
        },
        body: source.body as RequestInit["body"],
        // Required by undici when the body is a stream.
        duplex: "half",
      } as RequestInit);

      const result = (await uploadRes.json().catch(() => ({}))) as {
        id?: string;
      };
      if (!uploadRes.ok || !result.id) {
        throw new Error(
          `YouTube upload did not return video id (HTTP ${uploadRes.status})`,
        );
      }

      return this.success(
        result.id,
        `https://www.youtube.com/watch?v=${result.id}`,
      );
    } catch (error) {
      return this.failure(error);
    }
  }

  /**
   * Audit #28: resolve the video source as a stream with a known byte
   * length wherever possible. Local files are streamed from disk; remote
   * URLs are streamed when the server advertises Content-Length. Only an
   * unsized remote source is buffered (we need the size up front for the
   * resumable upload headers).
   */
  private async resolveSource(
    content: PostContent,
  ): Promise<{ body: Buffer | ReadableStream; size: number }> {
    if (content.localPath) {
      const fsSync = await import("node:fs");
      const { stat } = await import("node:fs/promises");
      const { Readable } = await import("node:stream");
      const { size } = await stat(content.localPath);
      return {
        body: Readable.toWeb(
          fsSync.createReadStream(content.localPath),
        ) as ReadableStream,
        size,
      };
    }

    const res = await fetch(content.mediaUrl);
    if (!res.ok) {
      throw new Error(`Failed to download media: ${res.status}`);
    }
    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > 0 && res.body) {
      return { body: res.body, size: declared };
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    return { body: buffer, size: buffer.length };
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
