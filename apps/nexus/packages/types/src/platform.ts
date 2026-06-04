export interface Platform {
  id: string
  name: string
  slug: string
  url: string | null
  title_max_chars: number | null
  description_max: number | null
  tag_count: number | null
  tag_max_chars: number | null
  audience: string | null
  tone: string | null
  seo_style: string | null
  description_style: string | null
  cta_style: string | null
  forbidden_words: string | null
  rules_json: string | null
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface PlatformConfig {
  titleMaxChars: number
  descriptionMax: number
  tagCount: number
  tagMaxChars: number
  audience: string
  tone: string
  seoStyle: string
  descriptionStyle: string
  ctaStyle: string
  forbiddenWords: string[]
  rules: Record<string, unknown>
}

export interface SocialChannel {
  id: string
  name: string
  slug: string
  caption_max_chars: number | null
  hashtag_count: number | null
  tone: string | null
  format: string | null
  content_types: string | null
  posting_mode: 'auto' | 'manual'
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface SocialChannelConfig {
  captionMaxChars: number
  hashtagCount: number
  tone: string
  format: string
  contentTypes: string[]
}

export interface SocialContent {
  caption: string
  hashtags: string[]
  hook?: string
  thread?: string[]
  story?: string
  video_script?: string
}

// Prompt Templates
export type PromptLayer = 
  | 'master'
  | 'persona'
  | 'role'
  | 'domain'
  | 'category'
  | 'platform'
  | 'social'
  | 'quality'

export type PromptTargetType = 'domain' | 'category' | 'platform' | 'social' | null

export interface PromptTemplate {
  id: string
  layer: PromptLayer
  target_id: string | null
  target_type: PromptTargetType
  name: string
  prompt_text: string
  version: number
  is_active: boolean
  auto_improved: boolean
  improvement_log: string | null
  created_at: string
  updated_at: string
}

export interface CreatePromptInput {
  layer: PromptLayer
  target_id?: string
  target_type?: PromptTargetType
  name: string
  prompt_text: string
}

export interface UpdatePromptInput {
  prompt_text?: string
  is_active?: boolean
}

// Settings
export interface Settings {
  social_posting_mode: 'auto' | 'manual'
  default_language: string
  ceo_review_required: boolean
  auto_publish_after_approval: boolean
  auto_publish_gumroad: boolean
  trend_radar_enabled: boolean
  trend_radar_hour: number
  winner_tracking_enabled: boolean
  graveyard_resurface_days: number
  revenue_estimate_enabled: boolean
  quality_passes: number
  title_variants_count: number
}

export type SettingsKey = keyof Settings
