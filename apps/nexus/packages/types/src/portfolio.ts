// ============================================================
// Portfolio Spine Types
// ============================================================
// Types for the portfolio entity graph: signals → opportunities → ventures → offers → tracked_links → economic_events
// Plus supporting tables: asset_library, allocator_actions

export type SignalSourceType = 
  | 'search_trend'
  | 'competitor_gap'
  | 'marketplace_data'
  | 'ai_radar'
  | 'buyer_feedback'

export type SignalStatus = 
  | 'raw'
  | 'scored'
  | 'linked'
  | 'archived'

export interface Signal {
  id: string
  source_type: SignalSourceType
  source_ref: string | null
  title: string
  extracted_audience: string | null
  extracted_problem: string | null
  evidence_json: string // JSON object
  demand_score: number
  freshness_score: number
  status: SignalStatus
  created_at: string
  updated_at: string
}

export type Vertical = 
  | 'digital'
  | 'pod'
  | 'content'
  | 'affiliate'
  | 'freelance'
  | 'ecommerce'

export type VentureStatus = 
  | 'draft'
  | 'building'
  | 'testing'
  | 'live'
  | 'scaling'
  | 'mutating'
  | 'killed'
  | 'archived'

export interface Venture {
  id: string
  opportunity_id: string
  vertical: Vertical
  strategy: string
  status: VentureStatus
  budget_cap_cents: number
  test_quota_clicks: number
  signal_id: string | null
  ai_cost_cents: number
  revenue_cents: number
  profit_cents: number
  created_at: string
  updated_at: string
}

export interface VentureWithDetails extends Venture {
  opportunity?: {
    id: string
    trend_name: string
    target_buyer: string
    product_idea: string
    total_score: number
  }
  signal?: Signal
  offer_count?: number
}

export type OfferStatus = 
  | 'draft'
  | 'active'
  | 'paused'
  | 'closed'

export interface Offer {
  id: string
  venture_id: string
  platform_id: string | null
  title: string | null
  description: string | null
  price_cents: number
  currency: string
  variant_type: string | null
  variant_data: string // JSON object
  status: OfferStatus
  published_at: string | null
  external_listing_id: string | null
  external_url: string | null
  created_at: string
  updated_at: string
}

export interface OfferWithDetails extends Offer {
  venture?: {
    id: string
    vertical: Vertical
    status: VentureStatus
  }
  platform?: {
    id: string
    name: string
    slug: string
  }
  tracked_links?: TrackedLink[]
  economic_events?: EconomicEvent[]
}

export interface TrackedLink {
  id: string
  offer_id: string
  channel: string
  slug: string
  destination_url: string
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_content: string | null
  utm_term: string | null
  created_at: string
}

export type EconomicEventType = 
  | 'revenue'
  | 'cost'
  | 'fee'
  | 'refund'
  | 'commission'

export interface EconomicEvent {
  id: string
  offer_id: string
  tracked_link_id: string | null
  event_type: EconomicEventType
  amount_cents: number
  currency: string
  description: string | null
  category: string | null
  external_event_id: string | null
  external_provider: string | null
  metadata: string // JSON object
  occurred_at: string
  created_at: string
}

export type AssetLibraryType = 
  | 'image'
  | 'copy'
  | 'video'
  | 'audio'
  | 'document'
  | 'template'

export interface AssetLibraryItem {
  id: string
  venture_id: string | null
  offer_id: string | null
  asset_type: AssetLibraryType
  file_path: string | null
  cdn_url: string | null
  prompt_used: string | null
  ai_model_used: string | null
  tags: string // JSON array
  performance_score: number
  usage_count: number
  metadata: string // JSON object
  created_at: string
  updated_at: string
}

export type AllocatorActionType = 
  | 'kill'
  | 'mutate'
  | 'expand'
  | 'scale'
  | 'recycle'

export interface AllocatorAction {
  id: string
  venture_id: string
  action_type: AllocatorActionType
  reason: string
  confidence: number
  data_before: string // JSON object
  data_after: string // JSON object
  created_at: string
}

// ============================================================
// Input types for API operations
// ============================================================

export interface CreateSignalInput {
  source_type: SignalSourceType
  source_ref?: string
  title: string
  extracted_audience?: string
  extracted_problem?: string
  evidence_json?: Record<string, unknown>
  demand_score?: number
  freshness_score?: number
}

export interface CreateVentureInput {
  opportunity_id: string
  vertical: Vertical
  strategy: string
  budget_cap_cents?: number
  test_quota_clicks?: number
  signal_id?: string
}

export interface CreateOfferInput {
  venture_id: string
  platform_id?: string
  title?: string
  description?: string
  price_cents: number
  currency?: string
  variant_type?: string
  variant_data?: Record<string, unknown>
}

export interface CreateTrackedLinkInput {
  offer_id: string
  channel: string
  slug: string
  destination_url: string
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  utm_content?: string
  utm_term?: string
}

export interface CreateEconomicEventInput {
  offer_id: string
  tracked_link_id?: string
  event_type: EconomicEventType
  amount_cents: number
  currency?: string
  description?: string
  category?: string
  external_event_id?: string
  external_provider?: string
  metadata?: Record<string, unknown>
  occurred_at?: string
}

export interface CreateAssetLibraryItemInput {
  venture_id?: string
  offer_id?: string
  asset_type: AssetLibraryType
  file_path?: string
  cdn_url?: string
  prompt_used?: string
  ai_model_used?: string
  tags?: string[]
  metadata?: Record<string, unknown>
}

export interface CreateAllocatorActionInput {
  venture_id: string
  action_type: AllocatorActionType
  reason: string
  confidence?: number
  data_before?: Record<string, unknown>
  data_after?: Record<string, unknown>
}

// ============================================================
// Query/Filter types
// ============================================================

export interface SignalFilters {
  status?: SignalStatus
  source_type?: SignalSourceType
  min_demand_score?: number
  limit?: number
  offset?: number
}

export interface VentureFilters {
  opportunity_id?: string
  vertical?: Vertical
  status?: VentureStatus
  signal_id?: string
  limit?: number
  offset?: number
}

export interface OfferFilters {
  venture_id?: string
  platform_id?: string
  status?: OfferStatus
  limit?: number
  offset?: number
}

export interface EconomicEventFilters {
  offer_id?: string
  tracked_link_id?: string
  event_type?: EconomicEventType
  category?: string
  occurred_after?: string
  occurred_before?: string
  limit?: number
  offset?: number
}

export interface AssetLibraryFilters {
  venture_id?: string
  offer_id?: string
  asset_type?: AssetLibraryType
  min_performance_score?: number
  limit?: number
  offset?: number
}

// ============================================================
// Agent Runs Ledger Types (from migration 022)
// ============================================================

export type AgentWorkflowType = 
  | 'radar_sweep'
  | 'opportunity_score'
  | 'venture_multiply'
  | 'asset_generate'
  | 'listing_draft'
  | 'content_draft'
  | 'affiliate_draft'
  | 'distribution'
  | 'attribution_sync'
  | 'kill_or_scale'
  | 'winner_expand'
  | 'daily_brief'

export type AgentRunStatus = 
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'killed'

export interface AgentRun {
  id: string
  opportunity_id: string | null
  venture_id: string | null
  offer_id: string | null
  workflow_type: AgentWorkflowType
  agent_name: string
  model: string
  prompt_version: string | null
  input_tokens: number
  output_tokens: number
  cost_cents: number
  quality_score: number | null
  output_ref: string | null
  status: AgentRunStatus
  error_message: string | null
  started_at: string
  finished_at: string | null
  metadata_json: string // JSON object
  created_at: string
}

export interface PromptVersion {
  id: string
  prompt_name: string
  version: string
  content: string
  model_hint: string | null
  active: number
  created_at: string
}

// ============================================================
// Computed Metrics & Portfolio Views
// ============================================================

export type VentureVertical = Vertical

export type EventType = EconomicEventType

export type AllocatorDecision = AllocatorActionType

export interface VentureMetrics {
  ventureId: string
  vertical: VentureVertical
  revenueCents: number
  refundCents: number
  platformFeeCents: number
  aiCostCents: number
  promotionCostCents: number
  fulfillmentCostCents: number
  clicks: number
  conversions: number
  qualifiedSignals: number
  budgetCapCents: number
  testQuotaClicks: number
  refundRate: number
  profitCents: number // computed: revenue - refunds - fees - ai - promo - fulfillment
}

export interface OpportunityPortfolio {
  opportunityId: string
  title: string
  ventures: VentureMetrics[]
  totalProfitCents: number
  bestVertical: VentureVertical | null
  activeVerticals: VentureVertical[]
  expansionQueue: VentureVertical[]
  allocatorDecision: AllocatorDecision
}