export type WorkflowStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'

export type StepStatus = 'waiting' | 'running' | 'completed' | 'failed' | 'skipped'

export type StepType = 
  | 'research_market'
  | 'research_psychology'
  | 'research_keywords'
  | 'research_competitors'
  | 'generate_content'
  | 'generate_image'
  | 'generate_audio'
  | 'generate_mockup'
  | 'seo_format'
  | 'quality_editor'
  | 'quality_buyer_sim'
  | 'quality_competitor'
  | 'quality_ceo'
  | 'platform_variation'
  | 'social_adaptation'
  | 'health_check'
  | 'revenue_estimate'
  | 'humanize'

export interface WorkflowRun {
  id: string
  product_id: string
  cf_workflow_id: string | null
  status: WorkflowStatus
  current_step: string | null
  total_steps: number
  error: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
}

export interface WorkflowStep {
  id: string
  run_id: string
  step_name: string
  step_type: StepType
  step_order: number
  status: StepStatus
  ai_model_used: string | null
  ai_models_tried: string | null
  input_data: string | null
  output_data: string | null
  tokens_used: number
  cost_usd: number
  started_at: string | null
  completed_at: string | null
  error: string | null
}

export interface WorkflowRunWithSteps extends WorkflowRun {
  steps: WorkflowStep[]
}

export interface WorkflowParams {
  productId: string
  domainSlug: string
  categorySlug: string
  userInput: Record<string, unknown>
  runId: string
}

export interface WorkflowStatusResponse {
  id: string
  product_id: string
  status: WorkflowStatus
  current_step: string | null
  total_steps: number
  error: string | null
  steps: WorkflowStep[]
}

export interface StartWorkflowInput {
  domain_slug: string
  category_slug: string
  user_input: Record<string, unknown>
}

// Review Types
export type ReviewDecision = 'approved' | 'rejected'

export interface Review {
  id: string
  product_id: string
  run_id: string | null
  version: number
  ai_score: number | null
  section_scores: string | null
  decision: ReviewDecision | null
  feedback: string | null
  revised_sections: string | null
  reviewed_at: string
}

export interface SectionScores {
  title: number
  description: number
  seo: number
  price: number
  platform_fit: number
  human_quality: number
  competitive_position: number
  overall_readiness: number
}

export interface ReviewIssue {
  criterion: keyof SectionScores
  score: number
  problem: string
  fix: string
}

export interface CEOReviewResult {
  overall_score: number
  approved: boolean
  scores: SectionScores
  issues: ReviewIssue[]
  competitor_gap: string | null
  strongest_element: string
  revised_sections: {
    title?: string | null
    description?: string | null
    tags?: string[] | null
  }
}

// Title Variants
export interface TitleVariant {
  id: string
  product_id: string
  platform_id: string | null
  variant_a: string | null
  variant_b: string | null
  variant_c: string | null
  selected: 'a' | 'b' | 'c' | null
  created_at: string
}

// Trend Alert
export type TrendStatus = 'new' | 'dismissed' | 'started'

export interface TrendAlert {
  id: string
  domain_id: string | null
  trend_keyword: string
  trend_score: number
  demand_window: string | null
  source: string | null
  suggested_niche: string | null
  status: TrendStatus
  detected_at: string
  dismissed_at: string | null
  workflow_id: string | null
}

// Winner Pattern
export type PatternType = 
  | 'title_structure'
  | 'price_range'
  | 'description_length'
  | 'top_tags'
  | 'tone'
  | 'cta_style'
  | 'buyer_persona'

export interface WinnerPattern {
  id: string
  domain_id: string | null
  category_id: string | null
  pattern_type: PatternType
  pattern_value: string
  confidence: number
  sample_count: number
  updated_at: string
}

// Health Check
export interface HealthCheckResult {
  passed: boolean
  checks: HealthCheckItem[]
}

export interface HealthCheckItem {
  name: string
  passed: boolean
  value: string
  requirement: string
  fix?: string
}
