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
      this.validateMedia(content);
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

      // Audit #29: the previous implementation blocked for up to ~90 s
      // polling TikTok's status endpoint synchronously. On Workers that
      // burns CPU quota and risks a subrequest timeout. Instead, return
      // success immediately after the init call (TikTok accepted the video
      // for async processing) and let the platform analytics collector
      // (TASK-702) confirm delivery in a later cron tick.
      return this.success(publishId);
    } catch (error) {
      return this.failure(error);
    }
  }
}
