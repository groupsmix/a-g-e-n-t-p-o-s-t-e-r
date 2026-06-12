export type MediaType = "image" | "video" | "carousel";

export interface PostContent {
  type: MediaType;
  mediaUrl: string;
  localPath?: string;
  caption: string;
  hashtags: string[];
  thumbnailUrl?: string;
  title?: string;
  description?: string;
  coverTimeOffset?: number;
  scheduledAt?: Date;
}

export interface PublishResult {
  platform: string;
  success: boolean;
  postId?: string;
  postUrl?: string;
  error?: string;
  publishedAt: Date;
}

export abstract class BasePlatformPublisher {
  abstract platform: string;
  abstract maxCaptionLength: number;
  abstract supportedMediaTypes: MediaType[];

  abstract publish(content: PostContent): Promise<PublishResult>;

  // Audit #23: enforce that the content type matches what the platform
  // actually supports before we spend time uploading / creating containers.
  protected validateMedia(content: PostContent): void {
    if (!this.supportedMediaTypes.includes(content.type)) {
      throw new Error(
        `${this.platform} does not support media type "${content.type}". ` +
          `Supported: ${this.supportedMediaTypes.join(", ")}`,
      );
    }
  }

  protected truncateCaption(caption: string): string {
    if (caption.length <= this.maxCaptionLength) return caption;
    return caption.slice(0, this.maxCaptionLength - 3) + "...";
  }

  protected buildFullCaption(caption: string, hashtags: string[]): string {
    const hashtagStr = hashtags
      .map((h) => (h.startsWith("#") ? h : `#${h}`))
      .join(" ");
    const full = hashtagStr ? `${caption}\n\n${hashtagStr}` : caption;
    return this.truncateCaption(full);
  }

  protected async downloadMedia(url: string): Promise<Buffer> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download media: ${response.status}`);
    }
    return Buffer.from(await response.arrayBuffer());
  }

  protected failure(error: unknown): PublishResult {
    return {
      platform: this.platform,
      success: false,
      error: error instanceof Error ? error.message : String(error),
      publishedAt: new Date(),
    };
  }

  protected success(postId?: string, postUrl?: string): PublishResult {
    return {
      platform: this.platform,
      success: true,
      postId,
      postUrl,
      publishedAt: new Date(),
    };
  }
}
