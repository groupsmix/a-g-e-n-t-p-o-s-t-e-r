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

  protected async doPublish(content: PostContent): Promise<PublishResult> {
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
      // Audit #29: this polled every 3s for a fixed 30 attempts (~90s of
      // blocking, ~30 API calls). Exponential backoff (3s → 15s) against an
      // explicit deadline bounds the worst case and roughly halves the
      // number of status calls. PULL_FROM_URL has no webhook in this setup,
      // so some polling is unavoidable in the cron path.
      const deadline = Date.now() + 5 * 60_000;
      let delayMs = 3000;
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        delayMs = Math.min(Math.round(delayMs * 1.5), 15_000);
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
        if (!statusResponse.ok) {
          throw new Error(
            `TikTok status check failed: HTTP ${statusResponse.status}`,
          );
        }
        const statusData = (await statusResponse.json().catch(() => ({}))) as {
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
      }

      throw new Error("TikTok publish timed out");
    } catch (error) {
      return this.failure(error);
    }
  }
}
