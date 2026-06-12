import { createHmac } from "node:crypto";
import { getEnv } from "@repo/config";
import {
  BasePlatformPublisher,
  type PostContent,
  type PublishResult,
} from "../base-publisher.js";

export class TwitterPublisher extends BasePlatformPublisher {
  platform = "twitter";
  maxCaptionLength = 280;
  supportedMediaTypes: ("image" | "video")[] = ["image", "video"];

  async publish(content: PostContent): Promise<PublishResult> {
    try {
      this.validateMedia(content);
      const env = getEnv();
      const buffer = content.localPath
        ? await import("node:fs/promises").then((fs) =>
            fs.readFile(content.localPath!),
          )
        : await this.downloadMedia(content.mediaUrl);

      const mediaId = await this.uploadMedia(buffer, content.type === "video");
      const text = this.buildFullCaption(content.caption, content.hashtags);

      const tweetRes = await fetch("https://api.twitter.com/2/tweets", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.TWITTER_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          media: { media_ids: [mediaId] },
        }),
      });

      const tweet = (await tweetRes.json()) as {
        data?: { id: string };
        errors?: Array<{ message: string }>;
      };

      if (!tweet.data?.id) {
        throw new Error(
          tweet.errors?.[0]?.message ?? "Twitter tweet create failed",
        );
      }

      return this.success(
        tweet.data.id,
        `https://twitter.com/i/web/status/${tweet.data.id}`,
      );
    } catch (error) {
      return this.failure(error);
    }
  }

  private async uploadMedia(buffer: Buffer, isVideo: boolean): Promise<string> {
    const env = getEnv();
    const mediaType = isVideo ? "video/mp4" : "image/jpeg";
    const category = isVideo ? "tweet_video" : "tweet_image";

    const initUrl = "https://upload.twitter.com/1.1/media/upload.json";
    const initParams = new URLSearchParams({
      command: "INIT",
      total_bytes: String(buffer.length),
      media_type: mediaType,
      media_category: category,
    });

    const initRes = await this.oauthFetch(
      `${initUrl}?${initParams}`,
      "POST",
      env,
    );
    const initData = (await initRes.json()) as { media_id_string?: string };
    if (!initData.media_id_string) {
      throw new Error("Twitter media INIT failed");
    }

    const mediaId = initData.media_id_string;
    const chunkSize = 5 * 1024 * 1024;
    let segmentIndex = 0;
    for (let offset = 0; offset < buffer.length; offset += chunkSize) {
      const chunk = buffer.subarray(offset, offset + chunkSize);
      const form = new FormData();
      form.append("command", "APPEND");
      form.append("media_id", mediaId);
      form.append("segment_index", String(segmentIndex));
      form.append(
        "media",
        new Blob([chunk], { type: mediaType }),
        "media",
      );

      await this.oauthFetch(initUrl, "POST", env, form);
      segmentIndex++;
    }

    const finalizeParams = new URLSearchParams({
      command: "FINALIZE",
      media_id: mediaId,
    });
    await this.oauthFetch(`${initUrl}?${finalizeParams}`, "POST", env);

    if (isVideo) {
      await this.waitForVideoProcessing(mediaId, env);
    }

    return mediaId;
  }

  private async waitForVideoProcessing(
    mediaId: string,
    env: ReturnType<typeof getEnv>,
  ): Promise<void> {
    for (let i = 0; i < 30; i++) {
      const params = new URLSearchParams({
        command: "STATUS",
        media_id: mediaId,
      });
      const res = await this.oauthFetch(
        `https://upload.twitter.com/1.1/media/upload.json?${params}`,
        "GET",
        env,
      );
      const data = (await res.json()) as {
        processing_info?: { state?: string };
      };
      const state = data.processing_info?.state;
      if (state === "succeeded") return;
      if (state === "failed") {
        throw new Error("Twitter video processing failed");
      }
      await new Promise((r) => setTimeout(r, 3000));
    }
    throw new Error("Twitter video processing timed out");
  }

  private oauthFetch(
    url: string,
    method: string,
    env: ReturnType<typeof getEnv>,
    body?: FormData,
  ): Promise<Response> {
    const oauthHeader = this.buildOAuth1Header(url, method, env);
    return fetch(url, {
      method,
      headers: { Authorization: oauthHeader },
      body,
    });
  }

  private buildOAuth1Header(
    url: string,
    method: string,
    env: ReturnType<typeof getEnv>,
  ): string {
    const oauthParams: Record<string, string> = {
      oauth_consumer_key: env.TWITTER_API_KEY,
      oauth_nonce: Math.random().toString(36).slice(2),
      oauth_signature_method: "HMAC-SHA1",
      oauth_timestamp: String(Math.floor(Date.now() / 1000)),
      oauth_token: env.TWITTER_ACCESS_TOKEN,
      oauth_version: "1.0",
    };

    const urlObj = new URL(url);
    urlObj.searchParams.forEach((value, key) => {
      oauthParams[key] = value;
    });

    const paramString = Object.keys(oauthParams)
      .sort()
      .map(
        (k) =>
          `${encodeURIComponent(k)}=${encodeURIComponent(oauthParams[k])}`,
      )
      .join("&");

    const baseString = [
      method.toUpperCase(),
      encodeURIComponent(`${urlObj.origin}${urlObj.pathname}`),
      encodeURIComponent(paramString),
    ].join("&");

    const signingKey = `${encodeURIComponent(env.TWITTER_API_SECRET)}&${encodeURIComponent(env.TWITTER_ACCESS_SECRET)}`;
    const signature = createHmac("sha1", signingKey)
      .update(baseString)
      .digest("base64");

    const headerParams: Record<string, string> = {
      ...oauthParams,
      oauth_signature: signature,
    };

    const authHeader = Object.keys(headerParams)
      .sort()
      .map(
        (k) =>
          `${encodeURIComponent(k)}="${encodeURIComponent(headerParams[k]!)}"`,
      )
      .join(", ");

    return `OAuth ${authHeader}`;
  }
}
