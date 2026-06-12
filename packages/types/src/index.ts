/**
 * @posteragent/types
 * Shared TypeScript interfaces used across the entire monorepo.
 * No runtime code — pure type exports only.
 */

// ─── Agent Task ──────────────────────────────────────────────────────────────

/** All valid agent task types across the NEXUS system. */
export type AgentTaskType =
  | 'research'
  | 'write'
  | 'build-app'
  | 'build-site'
  | 'publish'
  | 'analyse'
  | 'generate-video'
  | 'generate-image'
  | 'lead-scrape'
  | 'email-campaign'
  | 'financial-analysis'
  | 'brand-monitor'
  | 'autonome-run'
  | 'memory-consolidate'

/** Lifecycle status for a queued agent task. */
export type AgentTaskStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled' | 'needs_me' | 'archived'

/** A single unit of work dispatched to an agent. */
export interface AgentTask {
  id: string
  type: AgentTaskType
  payload: Record<string, unknown>
  status: AgentTaskStatus
  result?: unknown
  error?: string
  /** Estimated cost in USD before execution. */
  estimatedCostUsd?: number
  /** Actual cost in USD after execution (token-based). */
  actualCostUsd?: number
  modelUsed?: string
  inputTokens?: number
  outputTokens?: number
  durationMs?: number
  agentId?: string
  createdAt: Date
  updatedAt: Date
}

/** Result shape returned by every BaseAgent.run() call. */
export interface AgentResult<T = unknown> {
  taskId: string
  type: AgentTaskType
  status: 'done' | 'failed' | 'needs_me'
  data?: T
  error?: string
  costUsd?: number
  durationMs?: number
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

/** A registered module in the NEXUS dashboard sidebar. */
export interface DashboardModule {
  id: string
  label: string
  icon: string
  route: string
  status: 'active' | 'beta' | 'planned'
}

/** KPI metrics shown in the dashboard top bar. */
export interface DashboardMetrics {
  tasksToday: number
  tasksThisWeek: number
  aiSpendTodayUsd: number
  aiSpendBudgetUsd: number
  activeAgents: number
  revenueTrackedUsd: number
  newLeadsToday: number
}

// ─── Memory ──────────────────────────────────────────────────────────────────

/** Types of memory items with different staleness windows. */
export type MemoryItemType = 'identity' | 'preference' | 'project' | 'event' | 'fact'

/** A single persisted memory item in the brain layer. */
export interface MemoryItem {
  id: string
  type: MemoryItemType
  content: string
  source: string
  /** 384-dim embedding vector (all-MiniLM-L6-v2 or OpenAI fallback). */
  embedding?: number[]
  tags?: string[]
  createdAt: Date
  /** Null = never expires (e.g. identity). */
  expiresAt?: Date
}

// ─── Revenue ─────────────────────────────────────────────────────────────────

/** A single revenue event from any monetisation source. */
export interface RevenueEvent {
  id: string
  source: 'gumroad' | 'amazon' | 'adsense' | 'affiliate' | 'tiktok' | 'youtube' | 'other'
  amountUsd: number
  productId?: string
  contentId?: string
  referringUrl?: string
  occurredAt: Date
}

// ─── Lead ────────────────────────────────────────────────────────────────────

export type LeadStatus = 'prospect' | 'contacted' | 'replied' | 'customer' | 'rejected'

export interface Lead {
  id: string
  name?: string
  handle: string
  platform: string
  /** Why this person was flagged as a lead. */
  context: string
  /** Fit score 0-100. */
  score: number
  sourceUrl: string
  suggestedOutreach?: string
  status: LeadStatus
  createdAt: Date
}

// ─── Content ─────────────────────────────────────────────────────────────────

export type ContentPlatform =
  | 'twitter'
  | 'instagram'
  | 'tiktok'
  | 'youtube'
  | 'linkedin'
  | 'pinterest'
  | 'blog'
  | 'newsletter'
  | 'gumroad'

export type ContentFormat =
  | 'thread'
  | 'post'
  | 'caption'
  | 'script'
  | 'article'
  | 'email'
  | 'video'
  | 'podcast'
  | 'ebook'
  | 'product-description'

export type ContentStatus = 'draft' | 'review' | 'approved' | 'queued' | 'published' | 'failed'

export interface ContentItem {
  id: string
  platform: ContentPlatform
  format: ContentFormat
  status: ContentStatus
  title?: string
  body: string
  mediaUrls?: string[]
  scheduledAt?: Date
  publishedAt?: Date
  publishedUrl?: string
  createdAt: Date
}

// ─── Publish ─────────────────────────────────────────────────────────────────

export interface PublishPayload {
  contentId: string
  platform: ContentPlatform
  scheduleAt?: Date
}

export interface PublishResult {
  platform: ContentPlatform
  publishedUrl?: string
  externalId?: string
  success: boolean
  error?: string
}

// ─── Control Plane (Task 3.2) ────────────────────────────────────────────────

export interface TaskEvent {
  id: string
  taskId: string
  eventType: string
  message: string
  createdAt: Date
}

export interface AgentMessage {
  id: string
  taskId: string
  sender: string
  content: string
  createdAt: Date
}

export interface ApprovalRequest {
  id: string
  taskId: string
  actionType: string
  riskLevel: 'low' | 'medium' | 'high'
  status: 'pending' | 'approved' | 'rejected' | 'changes_requested'
  createdAt: Date
  resolvedAt?: Date
  feedback?: string
}

export interface TaskArtifact {
  id: string
  taskId: string
  kind: string
  url?: string
  content?: string
  createdAt: Date
}

export interface LiveProcess {
  id: string
  taskId?: string
  name: string
  status: 'running' | 'done' | 'failed'
  createdAt: Date
}

export interface Notification {
  id: string
  type: string
  title: string
  message: string
  read: boolean
  createdAt: Date
}
