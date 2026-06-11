// ── NEXUS API wire contract ───────────────────────────────────
// Single source of truth for /api response and request shapes, shared by
// the Worker (nexus-api) and the dashboard (web). Server handlers should
// produce these types (ideally at the D1/KV boundary) so the RPC client
// infers them end-to-end. Audit #13.
//
// History: lived in web/src/lib/api-types.ts, where it silently drifted
// from what the Worker actually returned.

export interface ApiKeyInfo {
  key: string
  label: string
  group: 'AI' | 'Publishing' | 'Social' | 'Email'
  help: string
  worker: 'ai' | 'api'
  configured: boolean
  // Where the configured value actually comes from. Lets the dashboard
  // distinguish "saved via the UI (KV)" from "set as a Worker secret
  // (env var)" instead of just showing "Set" / "Not set".
  source?: 'kv' | 'worker_secret' | null
  masked: string | null
}

// Response of GET /api/keys. The aggregate fields let the dashboard render
// an honest "Active provider" banner so the user never again sees "engine
// running" sitting next to a screen that says every key is unset.
export interface KeysResponse {
  keys: ApiKeyInfo[]
  kek_configured: boolean
  ai_configured_count: number
  ai_provider_source: { key: string; label: string; source: 'kv' | 'worker_secret' } | null
}

export interface ManagerMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ManagerAction {
  type: 'create_product' | 'note' | 'browse' | 'list_product' | 'check_sales' | 'create_pod' | 'run_campaign' | 'analyze_niche'
  domain_slug?: string
  category_slug?: string
  product_name?: string
  niche?: string
  description?: string
  product_id?: string
  workflow_id?: string
  status?: 'started' | 'failed'
  detail?: string
  url?: string
  instruction?: string
  platform?: string
}

export interface ActionStep {
  description: string
  status: 'pending' | 'running' | 'done' | 'error'
  screenshot?: string
  timestamp?: string
}

export interface ActionResult {
  success: boolean
  message: string
  action_type: string
  data?: Record<string, unknown>
  screenshots?: string[]
  steps?: ActionStep[]
}

export interface ManagerReply {
  reply: string
  actions: ManagerAction[]
  action_results?: ActionResult[]
}

export interface AgentStep {
  tool: string
  args: Record<string, unknown>
  ok: boolean
  summary: string
  product_id?: string
  screenshot_url?: string
}

export interface BrowseResult {
  ok: boolean
  url: string
  finalUrl?: string
  title?: string
  summary?: string | null
  text?: string
  screenshotUrl?: string | null
  error?: string
}

export interface AssistStep {
  index: number
  action: string
  ok: boolean
  message?: string
  rationale?: string
  selector?: string | null
  value?: string | null
  url?: string | null
  screenshotUrl?: string | null
  durationMs: number
}

export interface AssistResult {
  ok: boolean
  goal: string
  rationale: string
  steps: AssistStep[]
  answer: string | null
  totalMs: number
  error?: string
}

// ---------------------------------------------------------------------------
// Devin-style autonomous browser agent (streamed via SSE).
// ---------------------------------------------------------------------------

export interface AgentElement {
  index: number
  tag: string
  text: string
  selector: string
}

export type AgentEventType =
  | 'started'
  | 'observation'
  | 'thinking'
  | 'action'
  | 'frame'
  | 'done'
  | 'error'

export interface AgentEvent {
  type: AgentEventType
  step: number
  goal?: string
  thought?: string
  action?: BrowserAction
  pageTitle?: string
  pageUrl?: string
  elements?: AgentElement[]
  screenshotUrl?: string
  // Inline JPEG data URL for live `frame` events streamed while an action runs.
  screenshotDataUrl?: string
  message?: string
  answer?: string
  error?: string
  totalMs?: number
}

// Browser-action types
export type ActionType = 'click' | 'type' | 'select' | 'scroll' | 'wait' | 'screenshot' | 'navigate' | 'fillForm'

export interface BrowserAction {
  type: ActionType
  selector?: string
  value?: string
  url?: string
  waitMs?: number
  fields?: Record<string, string>
}

export interface BrowserActionResult {
  action: ActionType
  ok: boolean
  message?: string
  screenshotKey?: string
  durationMs: number
}

export interface ExecutionResult {
  ok: boolean
  results: BrowserActionResult[]
  totalMs: number
  error?: string
}

export interface FlowInfo {
  name: string
  platform: string
  stepCount: number
  variables: string[]
}

export interface PlatformStatusInfo {
  name: string
  method: 'browser' | 'api'
  configured: boolean
  requiresAuth: boolean
  baseUrl: string
}

export interface ListingResult {
  platform: string
  ok: boolean
  execution?: ExecutionResult
  error?: string
  listingId?: string
}

export interface PlatformListing {
  id: string
  product_id: string
  platform: string
  platform_url: string | null
  status: string
  listed_at: string | null
  error: string | null
  created_at: string
}

export interface CompetitorEntry {
  id: string
  name: string
  platform: string
  url: string
  niche: string | null
  last_checked_at: string | null
  created_at: string
}

export interface CompetitorInsightsResponse {
  insights: string
  trending_products: { title: string; reason: string }[]
  price_gaps: { niche: string; observation: string }[]
  opportunities: { title: string; description: string }[]
}

export interface AgentReply {
  reply: string
  steps: AgentStep[]
}

export interface TeamModel {
  name: string
  provider: string
  isFree: boolean
  configured: boolean
}

export interface TeamRole {
  role: string
  step: string
  wave: number
  taskType: string
  primary: TeamModel
  fallbacks: TeamModel[]
  free_safety_net: boolean
}

export interface TeamWave {
  wave: number
  parallel: boolean
  roles: TeamRole[]
}

export interface TeamReply {
  roles: TeamRole[]
  waves: TeamWave[]
}

export interface Schedule {
  id: string
  name: string
  task_type: string
  domain_slug: string | null
  category_slug: string | null
  topic: string | null
  instructions: string | null
  frequency: string
  active: number
  last_run_at: string | null
  created_at: string
  email: string | null
}

export interface NewSchedule {
  name: string
  task_type: string
  domain_slug?: string
  category_slug?: string
  topic?: string
  instructions?: string
  frequency: string
  email?: string
}

export interface Delivery {
  id: string
  schedule_id: string | null
  title: string | null
  kind: string
  product_id: string | null
  webhook_status: string | null
  email_status: string | null
  created_at: string
}

export interface DeliveryFull extends Delivery {
  body: string | null
}

export interface AutopilotWinner {
  id: string
  name: string
  status: string
  ai_score: number
  est: number
}

export interface AutopilotLogEntry {
  action: string
  product_id: string | null
  niche: string | null
  domain_slug: string | null
  note: string | null
  created_at: string
}

export interface AutopilotStatus {
  enabled: boolean
  per_run: number
  auto_approve: boolean
  auto_publish: boolean
  min_score: number
  products_built: number
  // BUG-P1-6: projection is null until real recorded sales hit the
  // threshold (see autopilot route). The UI must hide the stat instead
  // of inventing a fantasy revenue range.
  est_revenue: { low: number; high: number; currency: string } | null
  est_revenue_locked?: boolean
  est_revenue_locked_reason?: string | null
  real_sales?: number
  winners: AutopilotWinner[]
  recent: AutopilotLogEntry[]
  // Whether any LLM provider key is reachable by the Worker. The Worker
  // refuses to flip the engine ON or run a cycle when this is false; the
  // dashboard uses it to surface a "needs a key" warning instead of letting
  // the user click Run and watch nothing happen.
  ai_keys_configured?: boolean
  ai_provider_source?: { key: string; source: 'kv' | 'worker_secret' } | null
}

// Email list builder types
export interface Subscriber {
  id: string
  email: string
  name: string | null
  source: string | null
  subscribed_at: string
  unsubscribed_at: string | null
}

export interface SubscribersResponse {
  subscribers: Subscriber[]
  total: number
  active: number
}

export interface EmailCampaign {
  id: string
  subject: string
  body: string
  product_id: string | null
  status: string
  sent_at: string | null
  open_count: number
  click_count: number
  created_at: string
  product_name?: string | null
}

export interface MarketingLogEntry {
  channel: string | null
  content: string | null
  status: string
  note: string | null
  created_at: string
  product_name?: string | null
}
export interface MarketingStatus {
  enabled: boolean
  per_run: number
  delivery_configured: boolean
  promotions_sent: number
  channels: { slug: string; name: string }[]
  recent: MarketingLogEntry[]
}


export interface RevenueProduct {
  id: string
  name: string
  sales: number
  revenue: number
  url: string | null
  published: boolean
}
export interface RevenueResponse {
  configured: boolean
  message?: string
  error?: string
  currency?: string
  total_sales?: number
  total_revenue?: number
  product_count?: number
  best_seller?: string | null
  products?: RevenueProduct[]
}

export interface DigestScheduleRun {
  name: string
  status: string
  ran_at: string
}

export interface DigestError {
  product_name: string | null
  failed_step: string | null
  created_at: string
}

// Learning Loop types
export interface LearningPatternRow {
  id: string
  pattern_type: string
  pattern_value: string
  times_seen: number
  times_sold: number
  total_revenue: number
  confidence_score: number
  confidence: number
  sample_count: number
  domain_id: string | null
  category_id: string | null
  source: string
  last_seen_at: string | null
  updated_at: string
}

export interface LearningStats {
  total_sales_synced: number
  total_revenue: number
  patterns_extracted: number
  top_patterns: LearningPatternRow[]
  last_sync_at: string | null
  last_analysis_at: string | null
  improvement_trend: { period: string; revenue: number }[]
}
export interface Digest {
  date: string
  built_24h: number
  needs_review: number
  published: number
  approved: number
  spend_today: number
  spend_cap: number
  sales_configured: boolean
  total_sales: number
  total_revenue: number
  best_seller: string | null
  recent: { name: string; created_at: string }[]
  schedules_ran: number
  schedules_succeeded: number
  schedules_failed: number
  schedule_runs: DigestScheduleRun[]
  errors: DigestError[]
  top_product: string | null
}

export interface DigestRecord {
  id: string
  date: string
  data: Digest
  created_at: string
}

export interface HistoryRun {
  id: string
  product_id: string
  product_name: string | null
  status: string
  failed_step: string | null
  step_count: number
  steps_completed: number
  steps_failed: number
  run_tokens: number
  run_cost_usd: number
  started_at: string | null
  completed_at: string | null
}

export interface PublishItem {
  id: string
  product_name: string | null
  title: string | null
  platform_name: string | null
  status: string
}

// Gumroad types
export interface GumroadProductInfo {
  id: string
  name: string
  description: string | null
  price: number
  currency: string
  short_url: string
  published: boolean
  sales_count: number
  sales_usd_cents: number
  views_count: number
}

export interface GumroadSaleInfo {
  id: string
  email: string
  price: number
  product_id: string
  product_name: string
  created_at: string
  refunded: boolean
}

export interface GumroadAnalyticsInfo {
  product_id: string
  views: number
  sales: number
  revenue_cents: number
}

// Scoring types
export interface ProductScoreDetail {
  titleScore: number
  descriptionScore: number
  completeness: number
  priceScore: number
  total: number
}

export interface QualityGateResult {
  pass: boolean
  issues: string[]
  score: number
}

export interface ProductScoreResponse {
  score: ProductScoreDetail
  quality_gate: QualityGateResult
  post_build_gate: QualityGateResult
}

export interface NicheScoreDetail {
  demand: number
  gap: number
  priceRange: number
  volume: number
  total: number
  recommendation: string
}

export interface NicheScoreResponse {
  niche_score: NicheScoreDetail
  quality_gate: QualityGateResult
}

// POD (Print on Demand) types
export interface PODShop {
  id: number
  title: string
  sales_channel: string
}

export interface PODBlueprint {
  id: number
  title: string
  description: string
  brand: string
  model: string
  images: string[]
}

export interface PODProduct {
  id: string
  printify_product_id: string | null
  shop_id: string | null
  blueprint_id: number | null
  title: string
  description: string | null
  niche: string | null
  product_type: string
  design_prompt: string | null
  design_url: string | null
  status: string
  printify_url: string | null
  price_cents: number
  created_at: string
  published_at: string | null
}

export interface PODDesignSpec {
  prompt: string
  productType: string
  niche: string
  dimensions: { width: number; height: number }
  style: string
  elements: { title: string; tagline: string; layout: string }
}

export interface PODCreateResult {
  id: string
  title: string
  description: string
  design: PODDesignSpec
  printify_product_id: string | null
  status: string
}

export interface PODStats {
  total_products: number
  published: number
  revenue_estimate_cents: number
  revenue_estimate_usd: number
}

// A/B Testing types
export interface ABTest {
  id: string
  product_id: string
  variant_a_title: string
  variant_a_description: string
  variant_b_title: string
  variant_b_description: string
  variant_a_views: number
  variant_b_views: number
  variant_a_conversions: number
  variant_b_conversions: number
  winner: string | null
  status: string
  created_at: string
  product_name?: string | null
}

export interface ABTestDetail extends ABTest {
  stats: {
    variant_a_conversion_rate: number
    variant_b_conversion_rate: number
    total_views: number
    confidence: 'low' | 'medium' | 'high'
  }
}

export interface ABTestCompleteResult {
  ok: boolean
  winner: string
  variant_a_rate: number
  variant_b_rate: number
}

// Blog Engine types
export interface BlogPost {
  id: string
  title: string
  slug: string
  content: string
  meta_description: string | null
  keywords: string | null
  product_id: string | null
  status: 'draft' | 'published'
  published_at: string | null
  created_at: string
  updated_at: string
}

export interface StartWorkflowInput {
  domain_slug: string
  category_slug: string
  user_input: {
    language?: string
    niche?: string
    product_name?: string
    description?: string
    keywords?: string
    selected_platform_ids?: string[]
    post_to_social?: boolean
    selected_social_channel_ids?: string[]
    social_posting_mode?: 'auto' | 'manual'
    let_ai_price?: boolean
    let_ai_audience?: boolean
    let_ai_style?: boolean
  }
}

// ── Opportunity types ────────────────────────────────────────

export interface OpportunityInfo {
  id: string
  trend_name: string
  target_buyer: string
  product_idea: string
  why_it_sells: string
  evidence: Array<{ source: string; url?: string; snippet?: string }>
  competition_level: string
  urgency: string
  risk_level: string
  suggested_format: string
  difficulty: string
  confidence_score: number
  score_demand: number
  score_competition_gap: number
  score_buyer_urgency: number
  score_ease: number
  score_monetization: number
  score_timing: number
  score_safety: number
  total_score: number
  niche: string | null
  category: string | null
  source_signals: string[]
  status: string
  is_guess: boolean
  linked_job_id: string | null
  linked_product_id: string | null
  created_at: string
  updated_at: string
  expires_at: string | null
}

export interface CreateOpportunityInput {
  trend_name: string
  target_buyer: string
  product_idea: string
  why_it_sells: string
  evidence?: Array<{ source: string; url?: string; snippet?: string }>
  suggested_format: string
  niche?: string
  score_demand?: number
  score_competition_gap?: number
  score_buyer_urgency?: number
  score_ease?: number
  score_monetization?: number
  score_timing?: number
  score_safety?: number
  is_guess?: boolean
}

export interface OpportunitySummary {
  top_opportunities: OpportunityInfo[]
  breakdown: Array<{ status: string; count: number; suggested_format: string; avg_score: number }>
  total: number
}

// ── Freelance types ──────────────────────────────────────────

export interface FreelanceJobSummary {
  id: string
  client_name: string
  title: string
  job_type: string
  status: string
  deadline: string | null
  budget: number | null
  priority: number
  current_stage: string | null
  ai_calls_used: number
  max_ai_calls: number
  at_risk: boolean
  created_at: string
  updated_at: string
}

export interface FreelanceJobDetail {
  job: FreelanceJobSummary & {
    brief: string
    plan_json: string | null
    final_output: string | null
    client_message: string | null
    upsell_suggestion: string | null
    links_notes: string | null
    deliverables_required: string | null
    attachments_json: string | null
    quality_score_json: string | null
    owner_notes: string | null
    client_feedback: string | null
    missing_info_json: string | null
    max_revision_rounds: number
    max_runtime_minutes: number
    started_at: string | null
    completed_at: string | null
  }
  tasks: FreelanceTaskInfo[]
  events: FreelanceEventInfo[]
  artifacts: TaskArtifactInfo[]
}

export interface FreelanceTaskInfo {
  id: string
  job_id: string
  agent_role: string
  title: string
  instructions: string
  acceptance_criteria_json: string | null
  status: string
  output_json: string | null
  ceo_review_json: string | null
  revision_count: number
  max_revisions: number
  playbook_stage: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

export interface FreelanceEventInfo {
  id: string
  job_id: string
  task_id: string | null
  actor: string
  event_type: string
  message: string
  metadata_json: string | null
  created_at: string
}

export interface TaskArtifactInfo {
  id: string
  task_id: string
  job_id: string
  version: number
  output_json: string
  ceo_review_json: string | null
  revision_instructions: string | null
  created_at: string
}

export interface PlaybookStageInfo {
  name: string
  agent_role: string
  title: string
  default_criteria: string[]
  instructions_template: string
}

export interface CreateFreelanceJobInput {
  client_name: string
  title: string
  job_type: string
  brief: string
  deadline?: string
  budget?: number
  deliverables_required?: string
  links_notes?: string
  attachments_json?: string
  priority?: number
  max_ai_calls?: number
  max_revision_rounds?: number
  max_runtime_minutes?: number
  intake_answers_json?: string
}

export interface TemplateInfo {
  id: string
  name: string
  job_type: string
  description: string
  source_job_id: string | null
  usage_count: number
  created_at: string
}

export interface PortfolioEntryInfo {
  id: string
  job_id: string
  client_name: string
  job_type: string
  title: string
  challenge: string
  approach: string
  result: string
  testimonial_request: string
  created_at: string
}

export interface IntakeQuestionInfo {
  field: string
  question: string
  required: boolean
  placeholder: string
}

export interface CommandCenterData {
  due_soon: FreelanceJobSummary[]
  blocked: FreelanceJobSummary[]
  ready_for_approval: FreelanceJobSummary[]
  running: FreelanceJobSummary[]
  profit_by_type: Array<{
    job_type: string
    total_jobs: number
    delivered: number
    total_revenue: number
    total_ai_cost: number
    avg_profit_score: number
    avg_ai_calls: number
  }>
  totals: {
    total_jobs: number
    delivered: number
    active: number
    total_revenue: number
    total_cost: number
  }
}

// ── Queue Types ─────────────────────────────────────────
export type JobStatus = 'pending' | 'running' | 'done' | 'failed' | 'dead'

export interface Job {
  job_id: string
  product_id: string | null
  opportunity_id: string | null
  step_name: string
  status: JobStatus
  attempt_count: number
  max_attempts: number
  priority: number
  last_error: string | null
  payload: string
  result: string | null
  created_at: string
  scheduled_for: string
  started_at: string | null
  finished_at: string | null
}

export interface QueueStats {
  pending: number
  running: number
  done: number
  failed: number
  dead: number
}

export interface PublishProductResult {
  ok: boolean
  gumroad_product_id: string
  gumroad_url: string
  error?: string
}

// Consolidated dashboard counts from GET /api/stats — the single source for
// every count widget so the numbers agree across surfaces.
export interface Stats {
  products: {
    total: number
    draft: number
    running: number
    pending_review: number
    approved: number
    published: number
    rejected: number
    failed: number
    built_today: number
  }
  review: { pending: number; approved: number; rejected: number }
  publish: { published: number; failed: number }
  sales: { total_sales: number; total_revenue: number }
  autopilot: { enabled: boolean; built_total: number }
  learning: { patterns: number }
  content: { blog_posts: number; subscribers: number; email_campaigns: number; competitors: number }
  spend_today_usd: number
  kill_switch_active: boolean
}

