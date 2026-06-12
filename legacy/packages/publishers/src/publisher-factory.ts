import { BasePlatformPublisher, type MediaType, type PostContent, type PublishResult } from "./base-publisher.js";
import { TikTokPublisher } from "./platforms/tiktok.js";
import { InstagramPublisher } from "./platforms/instagram.js";
import { YouTubePublisher } from "./platforms/youtube.js";
import { TwitterPublisher } from "./platforms/twitter.js";
import { PinterestPublisher } from "./platforms/pinterest.js";
import { LinkedInPublisher } from "./platforms/linkedin.js";
import { ThreadsPublisher } from "./platforms/threads.js";

const publishers: Record<string, BasePlatformPublisher> = {
  tiktok: new TikTokPublisher(),
  instagram_feed: new InstagramPublisher("feed"),
  instagram_reels: new InstagramPublisher("reels"),
  instagram_story: new InstagramPublisher("story"),
  youtube_shorts: new YouTubePublisher("short"),
  youtube: new YouTubePublisher("video"),
  twitter: new TwitterPublisher(),
  pinterest: new PinterestPublisher(),
  linkedin: new LinkedInPublisher(),
  threads: new ThreadsPublisher(),
};

export function getPublisher(platform: string): BasePlatformPublisher {
  const publisher = publishers[platform];
  if (!publisher) {
    throw new Error(`No publisher for platform: ${platform}`);
  }
  return publisher;
}

// Audit #30: safe lookup that returns undefined instead of throwing,
// so callers can handle unknown platforms without crashing the pipeline.
export function tryGetPublisher(
  platform: string,
): BasePlatformPublisher | undefined {
  return publishers[platform];
}

export function listPublisherPlatforms(): string[] {
  return Object.keys(publishers);
}

// Audit #40: platform capability registry. Exposes each platform's limits
// and supported media types so callers (queue tools, dashboard UI, validation
// gates) can check capabilities without importing individual publisher classes.
export interface PlatformCapability {
  platform: string;
  maxCaptionLength: number;
  supportedMediaTypes: MediaType[];
}

export function getPlatformCapabilities(): Record<string, PlatformCapability> {
  const caps: Record<string, PlatformCapability> = {};
  for (const [key, pub] of Object.entries(publishers)) {
    caps[key] = {
      platform: pub.platform,
      maxCaptionLength: pub.maxCaptionLength,
      supportedMediaTypes: [...pub.supportedMediaTypes],
    };
  }
  return caps;
}

export async function publishToAll(
  platforms: string[],
  content: PostContent,
): Promise<PublishResult[]> {
  return Promise.all(
    platforms.map((p) => {
      const publisher = tryGetPublisher(p);
      if (!publisher) {
        // Audit #30: unknown platform returns a failure result instead of
        // crashing the whole batch.
        return Promise.resolve<PublishResult>({
          platform: p,
          success: false,
          error: `No publisher for platform: ${p}`,
          publishedAt: new Date(),
        });
      }
      return publisher.publish(content);
    }),
  );
}
