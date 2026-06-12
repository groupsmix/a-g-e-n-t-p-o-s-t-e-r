export {
  BasePlatformPublisher,
  type PostContent,
  type PublishResult,
  type MediaType,
} from "./base-publisher.js";

export { TikTokPublisher } from "./platforms/tiktok.js";
export { InstagramPublisher, type InstagramFormat } from "./platforms/instagram.js";
export { YouTubePublisher, type YouTubeFormat } from "./platforms/youtube.js";
export { TwitterPublisher } from "./platforms/twitter.js";
export { PinterestPublisher } from "./platforms/pinterest.js";
export { LinkedInPublisher } from "./platforms/linkedin.js";
export { ThreadsPublisher } from "./platforms/threads.js";

export {
  getPublisher,
  tryGetPublisher,
  listPublisherPlatforms,
  getPlatformCapabilities,
  type PlatformCapability,
  publishToAll,
} from "./publisher-factory.js";
