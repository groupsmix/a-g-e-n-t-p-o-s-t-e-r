import { getEnv } from "@repo/config";
import {
  BasePlatformPublisher,
  type PostContent,
  type PublishResult,
} from "../base-publisher.js";

export class TikTokPublisher extends BasePlatformPublisher {
  platform = "tiktok";
  maxCaptionLength = 2200;
  supportedMediaTypes: ("video")[] = ["video"];

  async publish(content: PostContent): Promise<PublishResult> {
    try {
      const env = getEnv();
      const initResponse = await fetch(
        "https://open.tiktokapis.com/v2/post/publish/video/init/",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.TIKTOK_ACCESS_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            post_info: {
              title: this.buildFullCaption(content.caption, content.hashtags),
              privacy_level: "PUBLIC_TO_EVERYONE",
              disable_duet: false,
              disable_comment: false,
              disable_stitch: false,
              video_cover_timestamp_ms: (content.coverTimeOffset ?? 1) * 1000,
            },
            source_info: {
              source: "PULL_FROM_URL",
              video_url: content.mediaUrl,
            },
          }),
        },
      );

      const initData = (await initResponse.json()) as {
        data?: { publish_id?: string };
        error?: { message?: string };
      };

      if (!initData.data?.publish_id) {
        throw new Error(
          `TikTok init failed: ${JSON.stringify(initData.error ?? initData)}`,
        );
      }

      const publishId = initData.data.publish_id;
      let attempts = 0;
      while (attempts < 30) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        const statusResponse = await fetch(
          "https://open.tiktokapis.com/v2/post/publish/status/fetch/",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${env.TIKTOK_ACCESS_TOKEN}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ publish_id: publishId }),
          },
        );
        const statusData = (await statusResponse.json()) as {
          data?: { status?: string; fail_reason?: string };
        };
        if (statusData.data?.status === "PUBLISH_COMPLETE") {
          return this.success(publishId);
        }
        if (statusData.data?.status === "FAILED") {
          throw new Error(
            `TikTok publish failed: ${statusData.data.fail_reason ?? "unknown"}`,
          );
        }
        attempts++;
      }

      throw new Error("TikTok publish timed out");
    } catch (error) {
      return this.failure(error);
    }
  }
}
