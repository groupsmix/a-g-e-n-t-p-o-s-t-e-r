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

  async publish(content: PostContent): Promise<PublishResult> {
    try {
      const accessToken = await this.getAccessToken();
      const buffer = content.localPath
        ? await import("node:fs/promises").then((fs) =>
            fs.readFile(content.localPath!),
          )
        : await this.downloadMedia(content.mediaUrl);

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

      const uploadUrl = initRes.headers.get("location");
      if (!uploadUrl) {
        throw new Error("YouTube resumable upload URL missing");
      }

      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Length": String(buffer.length),
          "Content-Type": "video/mp4",
        },
        body: buffer,
      });

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
