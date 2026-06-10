import { getEnv } from "@repo/config";
import {
  BasePlatformPublisher,
  type PostContent,
  type PublishResult,
} from "../base-publisher.js";

export class ThreadsPublisher extends BasePlatformPublisher {
  platform = "threads";
  maxCaptionLength = 500;
  supportedMediaTypes: ("image" | "video")[] = ["image", "video"];

  protected async doPublish(content: PostContent): Promise<PublishResult> {
    try {
      const env = getEnv();
      const token = env.INSTAGRAM_ACCESS_TOKEN;
      const userId = await this.getThreadsUserId(token);
      const text = this.buildFullCaption(content.caption, content.hashtags);

      const containerBody: Record<string, string> = { text };
      if (content.type === "video") {
        containerBody.media_type = "VIDEO";
        containerBody.video_url = content.mediaUrl;
      } else {
        containerBody.media_type = "IMAGE";
        containerBody.image_url = content.mediaUrl;
      }

      const containerRes = await fetch(
        `https://graph.threads.net/v1.0/${userId}/threads`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...containerBody, access_token: token }),
        },
      );
      const container = (await containerRes.json().catch(() => ({}))) as {
        id?: string;
        error?: { message?: string };
      };
      if (!containerRes.ok || !container.id) {
        throw new Error(
          container.error?.message ??
            `Threads container creation failed: HTTP ${containerRes.status}`,
        );
      }

      const publishRes = await fetch(
        `https://graph.threads.net/v1.0/${userId}/threads_publish`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            creation_id: container.id,
            access_token: token,
          }),
        },
      );
      // Audit #27: this used to report success even when the publish call
      // failed or returned no id. Assert both the status and the id.
      const published = (await publishRes.json().catch(() => ({}))) as {
        id?: string;
        error?: { message?: string };
      };
      if (!publishRes.ok || !published.id) {
        throw new Error(
          published.error?.message ??
            `Threads publish failed: HTTP ${publishRes.status}`,
        );
      }
      return this.success(published.id);
    } catch (error) {
      return this.failure(error);
    }
  }

  private async getThreadsUserId(token: string): Promise<string> {
    // Audit #5: token moved from query string to Authorization header.
    const res = await fetch(`https://graph.threads.net/v1.0/me?fields=id`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = (await res.json()) as { id?: string };
    if (!data.id) {
      throw new Error("Threads user id lookup failed");
    }
    return data.id;
  }
}
