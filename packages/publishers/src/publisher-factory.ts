import {
  BasePlatformPublisher,
  type PostContent,
  type PublishResult,
} from "./base-publisher.js";
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

/** Like getPublisher, but returns undefined instead of throwing. */
export function findPublisher(
  platform: string,
): BasePlatformPublisher | undefined {
  return publishers[platform];
}

export function listPublisherPlatforms(): string[] {
  return Object.keys(publishers);
}

// Audit #30: an unknown platform string used to throw inside Promise.all,
// killing the entire multi-platform batch (including platforms that would
// have succeeded). Unknown platforms now produce a per-platform failure
// result instead.
export async function publishToAll(
  platforms: string[],
  content: PostContent,
): Promise<PublishResult[]> {
  return Promise.all(
    platforms.map(async (p): Promise<PublishResult> => {
      const publisher = publishers[p];
      if (!publisher) {
        return {
          platform: p,
          success: false,
          error: `No publisher for platform: ${p}`,
          publishedAt: new Date(),
        };
      }
      return publisher.publish(content);
    }),
  );
}
