import { BasePlatformPublisher, type PostContent } from "./base-publisher.js";
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

export function listPublisherPlatforms(): string[] {
  return Object.keys(publishers);
}

export async function publishToAll(
  platforms: string[],
  content: PostContent,
): Promise<Awaited<ReturnType<BasePlatformPublisher["publish"]>>[]> {
  return Promise.all(platforms.map((p) => getPublisher(p).publish(content)));
}
