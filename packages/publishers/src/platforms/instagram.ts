import { getEnv } from "@repo/config";
import {
  BasePlatformPublisher,
  type MediaType,
  type PostContent,
  type PublishResult,
} from "../base-publisher.js";

export type InstagramFormat = "feed" | "reels" | "story";

export class InstagramPublisher extends BasePlatformPublisher {
  platform: string;
  maxCaptionLength = 2200;
  supportedMediaTypes: MediaType[];

  constructor(private format: InstagramFormat) {
    super();
    this.platform = `instagram_${format}`;
    this.supportedMediaTypes =
      format === "story"
        ? ["image", "video"]
        : format === "reels"
          ? ["video"]
          : ["image", "video", "carousel"];
  }

  protected async doPublish(content: PostContent): Promise<PublishResult> {
    try {
      const env = getEnv();
      const accountId = env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
      const token = env.INSTAGRAM_ACCESS_TOKEN;
      const caption = this.buildFullCaption(content.caption, content.hashtags);

      if (this.format === "reels" || content.type === "video") {
        const containerRes = await fetch(
          `https://graph.facebook.com/v19.0/${accountId}/media`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              media_type: this.format === "reels" ? "REELS" : "VIDEO",
              video_url: content.mediaUrl,
              caption,
              access_token: token,
            }),
          },
        );
        // Audit #26: check HTTP status and surface the Graph error message.
        const container = (await containerRes.json().catch(() => ({}))) as {
          id?: string;
          error?: { message?: string };
        };
        if (!containerRes.ok || !container.id) {
          throw new Error(
            container.error?.message ??
              `IG container failed: HTTP ${containerRes.status}`,
          );
        }

        await this.waitForContainer(container.id, token);
        const publishRes = await fetch(
          `https://graph.facebook.com/v19.0/${accountId}/media_publish`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              creation_id: container.id,
              access_token: token,
            }),
          },
        );
        const published = (await publishRes.json().catch(() => ({}))) as {
          id?: string;
          error?: { message?: string };
        };
        if (!publishRes.ok || !published.id) {
          throw new Error(
            published.error?.message ??
              `IG publish failed: HTTP ${publishRes.status}`,
          );
        }
        return this.success(published.id);
      }

      const imageRes = await fetch(
        `https://graph.facebook.com/v19.0/${accountId}/media`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image_url: content.mediaUrl,
            caption,
            access_token: token,
          }),
        },
      );
      // Audit #26: check HTTP status and surface the Graph error message.
      const imageContainer = (await imageRes.json().catch(() => ({}))) as {
        id?: string;
        error?: { message?: string };
      };
      if (!imageRes.ok || !imageContainer.id) {
        throw new Error(
          imageContainer.error?.message ??
            `Instagram image container failed: HTTP ${imageRes.status}`,
        );
      }
      await this.waitForContainer(imageContainer.id, token);
      const publishRes = await fetch(
        `https://graph.facebook.com/v19.0/${accountId}/media_publish`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            creation_id: imageContainer.id,
            access_token: token,
          }),
        },
      );
      const published = (await publishRes.json().catch(() => ({}))) as {
        id?: string;
        error?: { message?: string };
      };
      if (!publishRes.ok || !published.id) {
        throw new Error(
          published.error?.message ??
            `Instagram publish failed: HTTP ${publishRes.status}`,
        );
      }
      return this.success(published.id);
    } catch (error) {
      return this.failure(error);
    }
  }

  private async waitForContainer(
    containerId: string,
    token: string,
  ): Promise<void> {
    for (let i = 0; i < 30; i++) {
      // Audit #5: token moved from query string to Authorization header.
      const res = await fetch(
        `https://graph.facebook.com/v19.0/${containerId}?fields=status_code`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) {
        throw new Error(
          `Instagram container status check failed: HTTP ${res.status}`,
        );
      }
      const data = (await res.json().catch(() => ({}))) as {
        status_code?: string;
      };
      if (data.status_code === "FINISHED") return;
      if (data.status_code === "ERROR") {
        throw new Error("Instagram media processing failed");
      }
      await new Promise((r) => setTimeout(r, 3000));
    }
    throw new Error("Instagram media processing timed out");
  }
}
