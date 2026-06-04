export type ProductStatus = 
  | 'draft'
  | 'running'
  | 'pending_review'
  | 'in_revision'
  | 'approved'
  | 'published'
  | 'rejected'
  | 'archived'
  | 'graveyard'

export interface Product {
  id: string
  domain_id: string
  category_id: string
  name: string | null
  niche: string | null
  language: string
  user_input: string | null
  status: ProductStatus
  ai_score: number | null
  revenue_estimate: string | null
  winner_patterns: string | null
  graveyard_at: string | null
  graveyard_reason: string | null
  resurface_at: string | null
  image_url?: string | null
  deliverable_url?: string | null
  deliverable_format?: string | null
  generated_offline?: number
  gumroad_product_id?: string | null
  gumroad_url?: string | null
  created_at: string
  updated_at: string
}

export interface ProductWithDetails extends Product {
  domain?: {
    id: string
    name: string
    slug: string
  }
  category?: {
    id: string
    name: string
    slug: string
  }
  platforms?: PlatformVariant[]
  social_content?: SocialVariant[]
}

export interface PlatformVariant {
  id: string
  product_id: string
  platform_id: string
  title: string | null
  description: string | null
  tags: string | null
  price: number | null
  currency: string
  additional_data: string | null
  status: 'draft' | 'approved' | 'published'
  published_at: string | null
  published_url: string | null
  created_at: string
  updated_at: string
}

export interface SocialVariant {
  id: string
  product_id: string
  channel_id: string
  content: string
  status: 'draft' | 'approved' | 'published'
  scheduled_at: string | null
  published_at: string | null
  created_at: string
  updated_at: string
}

export interface Asset {
  id: string
  product_id: string
  step_id: string | null
  asset_type: AssetType
  r2_key: string | null
  cf_image_id: string | null
  cdn_url: string | null
  filename: string | null
  mime_type: string | null
  file_size_bytes: number | null
  metadata: string | null
  created_at: string
}

export type AssetType = 
  | 'image_design'
  | 'image_mockup'
  | 'pdf'
  | 'audio'
  | 'export'
  | 'thumbnail'

export interface UserInput {
  language: string
  niche?: string
  product_name?: string
  description?: string
  keywords?: string
  selected_platform_ids: string[]
  post_to_social: boolean
  selected_social_channel_ids: string[]
  social_posting_mode: 'auto' | 'manual'
  let_ai_price: boolean
  let_ai_audience: boolean
  let_ai_style: boolean
}

export interface RevenueEstimate {
  min: number
  max: number
  currency: string
  confidence: 'low' | 'medium' | 'high'
  reasoning: string
}

export type CreateProductInput = Pick<Product, 'domain_id' | 'category_id' | 'language'> & {
  niche?: string
  name?: string
  user_input?: UserInput
}

export type ProductFilters = {
  status?: ProductStatus
  domain_id?: string
  category_id?: string
  graveyard?: boolean
  limit?: number
  offset?: number
}

// ============================================================
// Review / CEO screen types
// ============================================================

// Simpler UI-focused section scores (7 criteria shown in the CEO review).
// Note: the canonical `SectionScores` (used by the workflow engine) lives in
// ./workflow.ts and has an extra `overall_readiness` field.
export interface UISectionScores {
  title: number
  description: number
  seo: number
  price: number
  platform_fit: number
  human_quality: number
  competitive_position: number
}

export interface UIReviewIssue {
  section: keyof UISectionScores
  problem: string
  fix: string
}

export interface UIHealthCheckItem {
  label: string
  status: 'pass' | 'warn' | 'fail'
  detail?: string
}

export interface LaunchBoostPack {
  posts: { channel: string; when: string; content: string }[]
}

export interface ProductDetail extends Product {
  domain_name?: string
  category_name?: string
  ai_score: number
  section_scores: UISectionScores
  issues: UIReviewIssue[]
  title_variants: string[]
  selected_title_index: number
  description: string
  tags: string[]
  price: number
  currency: string
  revenue_estimate_detail?: { min: number; max: number; currency: string }
  platform_variants: Array<PlatformVariant & {
    platform_name?: string
    tags: string[]
  }>
  social_variants: Array<Omit<SocialVariant, 'content'> & {
    channel_name?: string
    content: {
      caption: string
      hashtags: string[]
      hook?: string
      thread?: string[]
    }
  }>
  assets: Asset[]
  health_check: UIHealthCheckItem[]
  competitor_gap?: { detected: boolean; summary: string }
  launch_boost_pack?: LaunchBoostPack
}
