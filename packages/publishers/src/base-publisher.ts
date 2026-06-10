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

  // Audit #23: supportedMediaTypes was declared per-platform but never
  // checked, so e.g. a carousel could be handed to TikTok and fail deep
  // inside the platform API call. publish() is now a template method that
  // enforces the declared support before delegating to doPublish().
  async publish(content: PostContent): Promise<PublishResult> {
    if (!this.supportedMediaTypes.includes(content.type)) {
      return this.failure(
        new Error(
          `${this.platform} does not support media type "${content.type}" (supported: ${this.supportedMediaTypes.join(", ")})`,
        ),
      );
    }
    return this.doPublish(content);
  }

  protected abstract doPublish(content: PostContent): Promise<PublishResult>;

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
