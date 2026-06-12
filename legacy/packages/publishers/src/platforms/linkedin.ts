import { getEnv } from "@repo/config";
import {
  BasePlatformPublisher,
  type PostContent,
  type PublishResult,
} from "../base-publisher.js";

export class LinkedInPublisher extends BasePlatformPublisher {
  platform = "linkedin";
  maxCaptionLength = 1300;
  supportedMediaTypes: ("image" | "video")[] = ["image", "video"];

  async publish(content: PostContent): Promise<PublishResult> {
    try {
      this.validateMedia(content);
      const env = getEnv();
      if (!env.LINKEDIN_ACCESS_TOKEN) {
        throw new Error("LINKEDIN_ACCESS_TOKEN is not configured");
      }

      const text = this.buildFullCaption(content.caption, content.hashtags);
      const authorUrn = await this.getAuthorUrn(env.LINKEDIN_ACCESS_TOKEN);

      // Audit #24: images and videos use different LinkedIn recipes.
      // Videos go through the asset registerUpload → binary upload → UGC post
      // flow. Images can be posted directly via originalUrl in the UGC payload,
      // skipping the asset registration entirely.
      const isVideo = content.type === "video";

      let mediaBlock: Record<string, unknown>;

      if (isVideo) {
        // ── Video: register asset, upload binary, reference in UGC post ──
        const registerRes = await fetch(
          "https://api.linkedin.com/v2/assets?action=registerUpload",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${env.LINKEDIN_ACCESS_TOKEN}`,
              "Content-Type": "application/json",
              "X-Restli-Protocol-Version": "2.0.0",
            },
            body: JSON.stringify({
              registerUploadRequest: {
                recipes: ["urn:li:digitalmediaRecipe:feedshare-video"],
                owner: authorUrn,
                serviceRelationships: [
                  {
                    relationshipType: "OWNER",
                    identifier: "urn:li:userGeneratedContent",
                  },
                ],
              },
            }),
          },
        );

        const register = (await registerRes.json()) as {
          value?: {
            asset?: string;
            uploadMechanism?: Record<
              string,
              { uploadUrl?: string }
            >;
          };
        };

        const uploadUrl =
          register.value?.uploadMechanism &&
          Object.values(register.value.uploadMechanism)[0]?.uploadUrl;
        const asset = register.value?.asset;
        if (!uploadUrl || !asset) {
          throw new Error("LinkedIn video asset registration failed");
        }

        const buffer = content.localPath
          ? await import("node:fs/promises").then((fs) =>
              fs.readFile(content.localPath!),
            )
          : await this.downloadMedia(content.mediaUrl);

        await fetch(uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": "application/octet-stream" },
          body: buffer,
        });

        mediaBlock = {
          status: "READY",
          media: asset,
        };
      } else {
        // ── Image: use originalUrl (no binary upload needed) ─────────────
        mediaBlock = {
          status: "READY",
          originalUrl: content.mediaUrl,
        };
      }

      const postRes = await fetch("https://api.linkedin.com/v2/ugcPosts", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.LINKEDIN_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
          "X-Restli-Protocol-Version": "2.0.0",
        },
        body: JSON.stringify({
          author: authorUrn,
          lifecycleState: "PUBLISHED",
          specificContent: {
            "com.linkedin.ugc.ShareContent": {
              shareCommentary: { text },
              shareMediaCategory: isVideo ? "VIDEO" : "IMAGE",
              media: [mediaBlock],
            },
          },
          visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
        }),
      });

      const post = (await postRes.json()) as { id?: string };
      if (!post.id) {
        throw new Error(`LinkedIn post failed: ${JSON.stringify(post)}`);
      }

      return this.success(post.id);
    } catch (error) {
      return this.failure(error);
    }
  }

  private async getAuthorUrn(token: string): Promise<string> {
    const res = await fetch("https://api.linkedin.com/v2/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = (await res.json()) as { id?: string };
    if (!data.id) {
      throw new Error("LinkedIn profile lookup failed");
    }
    return `urn:li:person:${data.id}`;
  }
}
