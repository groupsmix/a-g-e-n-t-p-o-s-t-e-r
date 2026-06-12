import { getEnv } from "@repo/config";
import {
  BasePlatformPublisher,
  type PostContent,
  type PublishResult,
} from "../base-publisher.js";

export class PinterestPublisher extends BasePlatformPublisher {
  platform = "pinterest";
  maxCaptionLength = 500;
  supportedMediaTypes: ("image" | "video")[] = ["image", "video"];

  async publish(content: PostContent): Promise<PublishResult> {
    try {
      this.validateMedia(content);
      const env = getEnv();
      if (!env.PINTEREST_ACCESS_TOKEN) {
        throw new Error("PINTEREST_ACCESS_TOKEN is not configured");
      }

      const description = this.buildFullCaption(
        content.caption,
        content.hashtags,
      );

      const body =
        content.type === "video"
          ? {
              media_source: {
                source_type: "video_url",
                url: content.mediaUrl,
                cover_image_url: content.thumbnailUrl ?? content.mediaUrl,
              },
              description,
              title: content.title ?? content.caption.slice(0, 100),
            }
          : {
              media_source: {
                source_type: "image_url",
                url: content.mediaUrl,
              },
              description,
              title: content.title ?? content.caption.slice(0, 100),
            };

      const res = await fetch("https://api.pinterest.com/v5/pins", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.PINTEREST_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const data = (await res.json()) as { id?: string };
      if (!res.ok || !data.id) {
        throw new Error(`Pinterest pin failed: ${JSON.stringify(data)}`);
      }

      return this.success(data.id);
    } catch (error) {
      return this.failure(error);
    }
  }
}
