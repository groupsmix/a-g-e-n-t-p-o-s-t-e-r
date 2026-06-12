export type FlagValue = boolean | number | string

export interface FeatureFlags {
  daily_run_enabled: boolean
  site_generation_enabled: boolean
  video_generation_enabled: boolean
  poster_generation_enabled: boolean
  voiceover_enabled: boolean
  dry_run_mode: boolean
  auto_publish_tiktok: boolean
  auto_publish_instagram_reels: boolean
  auto_publish_instagram_feed: boolean
  auto_publish_youtube_shorts: boolean
  auto_publish_twitter: boolean
  auto_publish_pinterest: boolean
  auto_publish_linkedin: boolean
  auto_publish_threads: boolean
  max_posts_per_day: number
  max_videos_per_day: number
  max_sites_per_week: number
  max_blog_posts_per_day: number
}

export type FlagKey = keyof FeatureFlags
