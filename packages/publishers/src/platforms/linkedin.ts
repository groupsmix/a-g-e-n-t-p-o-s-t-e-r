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

  protected async doPublish(content: PostContent): Promise<PublishResult> {
    try {
      const env = getEnv();
      if (!env.LINKEDIN_ACCESS_TOKEN) {
        throw new Error("LINKEDIN_ACCESS_TOKEN is not configured");
      }

      const text = this.buildFullCaption(content.caption, content.hashtags);
      const authorUrn = await this.getAuthorUrn(env.LINKEDIN_ACCESS_TOKEN);

      // Audit #24: the recipe and share category were hardcoded to video,
      // so images were registered and posted as videos. Pick by media type.
      const isVideo = content.type === "video";
      const recipe = isVideo
        ? "urn:li:digitalmediaRecipe:feedshare-video"
        : "urn:li:digitalmediaRecipe:feedshare-image";

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
              recipes: [recipe],
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

      if (!registerRes.ok) {
        throw new Error(
          `LinkedIn asset registration failed: HTTP ${registerRes.status}`,
        );
      }

      const register = (await registerRes.json()) as {
        value?: {
          asset?: string;
          uploadMechanism?: Record<
            string,
            { uploadUrl?: string; uploadInstructions?: { uploadUrl?: string } }
          >;
        };
      };

      const uploadMechanism = register.value?.uploadMechanism;
      const uploadUrl =
        uploadMechanism &&
        Object.values(uploadMechanism)[0]?.uploadUrl;

      const asset = register.value?.asset;
      if (!uploadUrl || !asset) {
        throw new Error("LinkedIn asset registration failed");
      }

      const buffer = content.localPath
        ? await import("node:fs/promises").then((fs) =>
            fs.readFile(content.localPath!),
          )
        : await this.downloadMedia(content.mediaUrl);

      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream" },
        body: buffer,
      });
      if (!uploadRes.ok) {
        throw new Error(`LinkedIn media upload failed: HTTP ${uploadRes.status}`);
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
              media: [
                {
                  status: "READY",
                  media: asset,
                },
              ],
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
