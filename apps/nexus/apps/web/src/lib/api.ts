import type {
  Category,
  Platform,
  SocialChannel,
  TrendAlert,
  WinnerPattern,
  AIModelDashboardStatus,
  PromptTemplate,
  Settings,
  Domain,
  Product,
  ProductDetail,
  WorkflowStatusResponse,
} from '@nexus/types'

// Re-export all types for backward compatibility — consumers can import from
// either 'api' or 'api-types'.
export * from './api-types'
export type { Domain, Product, ProductDetail, WorkflowStatusResponse } from '@nexus/types'

import type {
  ApiKeyInfo, KeysResponse, ManagerMessage, ManagerAction, ActionStep, ActionResult,
  ManagerReply, AgentStep, BrowseResult, AssistResult, ActionType, BrowserAction,
  BrowserActionResult, ExecutionResult, FlowInfo, PlatformStatusInfo,
  ListingResult, PlatformListing, CompetitorEntry, CompetitorInsightsResponse,
  AgentReply, TeamModel, TeamRole, TeamWave, TeamReply,
  Schedule, NewSchedule, Delivery, DeliveryFull,
  AutopilotWinner, AutopilotLogEntry, AutopilotStatus,
  Subscriber, SubscribersResponse, EmailCampaign,
  MarketingLogEntry, MarketingStatus, RevenueProduct, RevenueResponse,
  DigestScheduleRun, DigestError, LearningPatternRow, LearningStats,
  Digest, DigestRecord, HistoryRun, PublishItem,
  GumroadProductInfo, GumroadSaleInfo, GumroadAnalyticsInfo,
  ProductScoreDetail, QualityGateResult, ProductScoreResponse,
  NicheScoreDetail, NicheScoreResponse,
  PODShop, PODBlueprint, PODProduct, PODDesignSpec, PODCreateResult, PODStats,
  ABTest, ABTestDetail, ABTestCompleteResult, BlogPost,
  StartWorkflowInput, OpportunityInfo, CreateOpportunityInput, OpportunitySummary,
  FreelanceJobSummary, FreelanceJobDetail, FreelanceTaskInfo, FreelanceEventInfo,
  TaskArtifactInfo, PlaybookStageInfo, CreateFreelanceJobInput,
  TemplateInfo, PortfolioEntryInfo, IntakeQuestionInfo, CommandCenterData,
  Job, QueueStats, JobStatus,
  PublishProductResult,
} from './api-types'

// Re-export queue/publish types explicitly
export type { Job, QueueStats, JobStatus, PublishProductResult };

const RAW_API_BASE = process.env.NEXT_PUBLIC_API_URL || ''
const FALLBACK_API_BASE = 'http://localhost:8787'

export const API_BASE: string = RAW_API_BASE || FALLBACK_API_BASE
export const API_BASE_IS_FALLBACK: boolean = !RAW_API_BASE

/**
 * True when running in a real browser whose origin is NOT localhost, while
 * API_BASE still points to the local Cloudflare Worker. This is the symptom
 * of NEXT_PUBLIC_API_URL being unset at build time on Vercel — every API
 * call will silently fail.
 *
 * Components can read this to surface a visible warning instead of letting
 * the dashboard look like it works but show no data.
 */
export function isApiMisconfigured(): boolean {
  if (!API_BASE_IS_FALLBACK) return false
  if (typeof window === 'undefined') return false
  const host = window.location.hostname
  return host !== 'localhost' && host !== '127.0.0.1' && !host.endsWith('.local')
}

// Log a single loud warning at module load so the misconfiguration shows up
// even on pages that don't render the banner.
if (typeof window !== 'undefined' && isApiMisconfigured()) {
  // eslint-disable-next-line no-console
  console.error(
    '[nexus] NEXT_PUBLIC_API_URL is not set. API calls will fail because API_BASE is defaulting to ' +
      FALLBACK_API_BASE +
      '. Rebuild with `pnpm --filter @nexus/web pages:ship` or set NEXT_PUBLIC_API_URL on the Cloudflare Pages project, then redeploy.',
  )
}

export function assetUrl(path?: string | null): string | null {
  if (!path) return null
  if (/^https?:\/\//i.test(path)) return path
  return `${API_BASE}${path}`
}

const TOKEN_KEY = 'nexus_token'

export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string | null) {
  if (typeof window === 'undefined') return
  if (token) window.localStorage.setItem(TOKEN_KEY, token)
  else window.localStorage.removeItem(TOKEN_KEY)
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken()
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  })
  if (res.status === 401) {
    setToken(null)
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('nexus-auth-required'))
    throw new Error('Unauthorized')
  }
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }))
    throw new Error(error.message || error.error || `API error: ${res.status}`)
  }
  return res.json()
}

export const api = {
  // Domains
  getDomains: () => apiFetch<Domain[]>('/api/domains'),
  createDomain: (data: Partial<Domain>) => apiFetch<Domain>('/api/domains', { method: 'POST', body: JSON.stringify(data) }),
  updateDomain: (id: string, data: Partial<Domain>) => apiFetch<Domain>(`/api/domains/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteDomain: (id: string) => apiFetch<void>(`/api/domains/${id}`, { method: 'DELETE' }),

  // Categories
  getCategories: (domainId: string) => apiFetch<Category[]>(`/api/domains/${domainId}/categories`),
  createCategory: (domainId: string, data: Partial<Category>) => apiFetch<Category>(`/api/domains/${domainId}/categories`, { method: 'POST', body: JSON.stringify(data) }),
  updateCategory: (id: string, data: Partial<Category>) =>
    apiFetch<Category>(`/api/categories/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteCategory: (id: string) => apiFetch<void>(`/api/categories/${id}`, { method: 'DELETE' }),
  getCategoryBySlug: (domainSlug: string, categorySlug: string) =>
    apiFetch<Category & { domain?: Domain }>(
      `/api/domains/${domainSlug}/categories/${categorySlug}`
    ),
  getDomainBySlug: (slug: string) => apiFetch<Domain>(`/api/domains/slug/${slug}`),

  // Workflow
  startWorkflow: (data: StartWorkflowInput) => apiFetch<{ workflow_id: string; product_id: string }>('/api/workflow/start', { method: 'POST', body: JSON.stringify(data) }),
  getWorkflowStatus: (id: string) => apiFetch<WorkflowStatusResponse>(`/api/workflow/${id}`),

  // Review
  approveProduct: (productId: string) => apiFetch<void>(`/api/review/${productId}/approve`, { method: 'POST' }),
  rejectProduct: (productId: string, feedback: string) => apiFetch<void>(`/api/review/${productId}/reject`, { method: 'POST', body: JSON.stringify({ feedback }) }),

  // Products
  getProducts: (filters?: { status?: string; domain_id?: string; limit?: number }) =>
    apiFetch<{ products: Product[] }>(`/api/products?${new URLSearchParams(filters as Record<string, string>)}`),
  getProduct: (id: string) => apiFetch<Product>(`/api/products/${id}`),
  getProductDetail: (id: string) => apiFetch<ProductDetail>(`/api/products/${id}/detail`),
  generateDeliverable: (id: string, opts?: { format?: string; force?: boolean }) => {
    const qs = new URLSearchParams()
    if (opts?.format) qs.set('format', opts.format)
    if (opts?.force) qs.set('force', '1')
    const q = qs.toString()
    return apiFetch<{ ok: boolean; deliverable_url: string; deliverable_format: string }>(
      `/api/products/${id}/generate-deliverable${q ? `?${q}` : ''}`,
      { method: 'POST' },
    )
  },
  updateProductSection: (id: string, patch: Partial<ProductDetail>) =>
    apiFetch<ProductDetail>(`/api/products/${id}/detail`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  deleteProduct: (id: string) => apiFetch<void>(`/api/products/${id}`, { method: 'DELETE' }),
  // Re-dispatch the 15-step pipeline for a product that's stuck or rejected.
  // The Worker resets the product to 'running' and queues a fresh workflow_run.
  retryProduct: (id: string) =>
    apiFetch<{ ok: boolean; workflow_id: string; product_id: string; status: string }>(
      `/api/products/${id}/retry`,
      { method: 'POST' },
    ),

  // Trends
  getTrends: () => apiFetch<TrendAlert[]>('/api/trends'),
  dismissTrend: (id: string) => apiFetch<void>(`/api/trends/${id}/dismiss`, { method: 'POST' }),
  startTrendWorkflow: (id: string) => apiFetch<{ workflow_id: string }>(`/api/trends/${id}/start`, { method: 'POST' }),

  // Winners
  getWinnerPatterns: () => apiFetch<WinnerPattern[]>('/api/winners'),

  // AI Models
  getAIModels: () => apiFetch<AIModelDashboardStatus[]>('/api/ai-models'),
  updateAIModel: (id: string, data: Partial<AIModelDashboardStatus>) => apiFetch<AIModelDashboardStatus>(`/api/ai-models/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  // Platforms
  getPlatforms: () => apiFetch<Platform[]>('/api/platforms'),
  createPlatform: (data: Partial<Platform>) => apiFetch<Platform>('/api/platforms', { method: 'POST', body: JSON.stringify(data) }),
  updatePlatform: (id: string, data: Partial<Platform>) => apiFetch<Platform>(`/api/platforms/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deletePlatform: (id: string) => apiFetch<void>(`/api/platforms/${id}`, { method: 'DELETE' }),

  // Social
  getSocialChannels: () => apiFetch<SocialChannel[]>('/api/social'),
  createSocialChannel: (data: Partial<SocialChannel>) => apiFetch<SocialChannel>('/api/social', { method: 'POST', body: JSON.stringify(data) }),
  updateSocialChannel: (id: string, data: Partial<SocialChannel>) => apiFetch<SocialChannel>(`/api/social/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteSocialChannel: (id: string) => apiFetch<void>(`/api/social/${id}`, { method: 'DELETE' }),

  // Prompts
  getPrompts: (layer?: string) => apiFetch<PromptTemplate[]>(`/api/prompts${layer ? `?layer=${layer}` : ''}`),
  updatePrompt: (id: string, promptText: string) => apiFetch<PromptTemplate>(`/api/prompts/${id}`, { method: 'PATCH', body: JSON.stringify({ prompt_text: promptText }) }),

  // Settings
  getSettings: () => apiFetch<Settings>('/api/settings'),
  updateSettings: (data: Partial<Settings>) => apiFetch<Settings>('/api/settings', { method: 'PATCH', body: JSON.stringify(data) }),

  // API keys (dashboard-managed provider credentials)
  getKeys: () => apiFetch<KeysResponse>('/api/keys'),
  saveKeys: (keys: Record<string, string>) =>
    apiFetch<{ ok: boolean; written: number; ai_forwarded: boolean }>('/api/keys', {
      method: 'POST',
      body: JSON.stringify({ keys }),
    }),

  // AI cost meter + daily spend cap
  getSpend: () => apiFetch<{ today: number; cap: number; cap_reached: boolean }>('/api/keys/spend'),
  setCap: (cap_usd: number) =>
    apiFetch<{ ok: boolean; cap: number }>('/api/keys/cap', {
      method: 'POST',
      body: JSON.stringify({ cap_usd }),
    }),

  // Per-provider ON/OFF (key stays saved)
  getProviders: () => apiFetch<{ providers: { secretKey: string; off: boolean }[] }>('/api/keys/providers'),
  toggleProvider: (secretKey: string, off: boolean) =>
    apiFetch<{ ok: boolean; secretKey: string; off: boolean }>('/api/keys/providers/toggle', {
      method: 'POST',
      body: JSON.stringify({ secretKey, off }),
    }),

  // CEO Manager (chat orchestrator)
  managerChat: (message: string, history: ManagerMessage[]) =>
    apiFetch<ManagerReply>('/api/manager/chat', {
      method: 'POST',
      body: JSON.stringify({ message, history }),
    }),

  // CEO Agent (full-control, tool-using)
  managerAgent: (message: string, history: ManagerMessage[]) =>
    apiFetch<AgentReply>('/api/agent/agent', {
      method: 'POST',
      body: JSON.stringify({ message, history }),
    }),

  // Browser automation (headless browser on the Workers Paid plan)
  browserStatus: () => apiFetch<{ enabled: boolean }>('/api/browser/status'),
  browserRun: (url: string, instruction?: string) =>
    apiFetch<BrowseResult>('/api/browser/run', {
      method: 'POST',
      body: JSON.stringify({ url, instruction }),
    }),
  browserAssist: (goal: string, startUrl?: string) =>
    apiFetch<AssistResult>('/api/browser/assist', {
      method: 'POST',
      body: JSON.stringify({ goal, startUrl }),
    }),

  // Hyperbeam live browser
  hyperbeamCreate: (url?: string) =>
    apiFetch<{ ok: boolean; sessionId: string; embedUrl: string }>('/api/hyperbeam/session', {
      method: 'POST',
      body: JSON.stringify(url ? { url } : {}),
    }),
  hyperbeamDestroy: (sessionId: string) =>
    apiFetch<{ ok: boolean }>(`/api/hyperbeam/session/${sessionId}`, { method: 'DELETE' }),

  // AI agent team line-up
  getTeam: () => apiFetch<TeamReply>('/api/team'),

  // Scheduler
  getSchedules: () => apiFetch<{ schedules: Schedule[] }>('/api/schedules'),
  createSchedule: (s: NewSchedule) =>
    apiFetch<{ id: string; ok: boolean }>('/api/schedules', { method: 'POST', body: JSON.stringify(s) }),
  toggleSchedule: (id: string, active: boolean) =>
    apiFetch<void>(`/api/schedules/${id}`, { method: 'PATCH', body: JSON.stringify({ active }) }),
  deleteSchedule: (id: string) => apiFetch<void>(`/api/schedules/${id}`, { method: 'DELETE' }),
  runSchedule: (id: string) =>
    apiFetch<{ ok: boolean; delivery: { id: string; title: string; kind: string } }>(`/api/schedules/${id}/run`, { method: 'POST' }),
  getDeliveries: () => apiFetch<{ deliveries: Delivery[] }>('/api/schedules/deliveries/list'),
  getDelivery: (id: string) => apiFetch<{ delivery: DeliveryFull }>(`/api/schedules/deliveries/${id}`),

  // Autopilot money engine
  getAutopilot: () => apiFetch<AutopilotStatus>('/api/autopilot/status'),
  toggleAutopilot: (patch: { enabled?: boolean; per_run?: number; auto_approve?: boolean; auto_publish?: boolean; min_score?: number }) =>
    apiFetch<{ ok: boolean; enabled: boolean }>('/api/autopilot/toggle', {
      method: 'POST', body: JSON.stringify(patch),
    }),
  runAutopilot: () => apiFetch<{ ok: boolean; built: number }>('/api/autopilot/run', { method: 'POST' }),

  // Marketing team
  getMarketing: () => apiFetch<MarketingStatus>('/api/marketing/status'),
  toggleMarketing: (patch: { enabled?: boolean; per_run?: number }) =>
    apiFetch<{ ok: boolean; enabled: boolean }>('/api/marketing/toggle', {
      method: 'POST',
      body: JSON.stringify(patch),
    }),
  runMarketing: () => apiFetch<{ ok: boolean; promoted: number }>('/api/marketing/run', { method: 'POST' }),

  // Graveyard
  getGraveyard: () => apiFetch<{ products: Product[] }>('/api/graveyard'),
  restoreProduct: (id: string) => apiFetch<void>(`/api/graveyard/${id}/restore`, { method: 'POST' }),

  // History
  getHistory: () => apiFetch<{ runs: HistoryRun[] }>('/api/history'),

  // Publish
  getPublishQueue: () => apiFetch<{ items: PublishItem[] }>('/api/publish'),
  publishItem: (id: string) => apiFetch<void>(`/api/publish/${id}`, { method: 'POST' }),

  // Revenue (real Gumroad sales)
  getRevenue: () => apiFetch<RevenueResponse>('/api/revenue'),

  // Daily digest / morning report
  getDigest: () => apiFetch<Digest>('/api/digest'),
  getDigestToday: () => apiFetch<Digest>('/api/digest/today'),
  getDigestHistory: () => apiFetch<{ digests: DigestRecord[] }>('/api/digest/history'),
  generateDigest: () => apiFetch<{ ok: boolean; digest: Digest }>('/api/digest/generate', { method: 'POST' }),
  sendDigestEmail: (to?: string) =>
    apiFetch<{ ok: boolean; status: string; digest: Digest }>('/api/digest/email', {
      method: 'POST',
      body: JSON.stringify(to ? { to } : {}),
    }),

  // Learning Loop
  getLearningStats: () => apiFetch<LearningStats>('/api/learning/stats'),
  getLearningPatterns: () => apiFetch<{ patterns: LearningPatternRow[]; total: number }>('/api/learning/patterns'),
  syncLearning: () => apiFetch<{ ok: boolean; synced: number; total_revenue: number; error?: string }>('/api/learning/sync', { method: 'POST' }),
  analyzeLearning: () => apiFetch<{ ok: boolean; patterns_created: number; patterns_updated: number }>('/api/learning/analyze', { method: 'POST' }),

  // Access gate
  getAuthStatus: () => apiFetch<{ protected: boolean }>('/api/auth/status'),
  login: (password: string) =>
    apiFetch<{ token: string }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ password }) }),
  setupPassword: (password: string, current?: string) =>
    apiFetch<{ ok: boolean; token: string }>('/api/auth/setup', {
      method: 'POST',
      body: JSON.stringify({ password, current }),
    }),
  disableAuth: (current: string) =>
    apiFetch<{ ok: boolean }>('/api/auth/disable', { method: 'POST', body: JSON.stringify({ current }) }),

  // Gumroad integration
  getGumroadProducts: () => apiFetch<{ products: GumroadProductInfo[] }>('/api/gumroad/products'),
  createGumroadProduct: (data: { name: string; price: number; description?: string; id?: string }) =>
    apiFetch<{ product: GumroadProductInfo }>('/api/gumroad/products', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getGumroadSales: (opts?: { after?: string; before?: string; page?: number }) => {
    const qs = new URLSearchParams()
    if (opts?.after) qs.set('after', opts.after)
    if (opts?.before) qs.set('before', opts.before)
    if (opts?.page) qs.set('page', String(opts.page))
    const q = qs.toString()
    return apiFetch<{ sales: GumroadSaleInfo[] }>(`/api/gumroad/sales${q ? `?${q}` : ''}`)
  },
  getGumroadAnalytics: (productId: string) =>
    apiFetch<{ analytics: GumroadAnalyticsInfo }>(`/api/gumroad/products/${productId}/analytics`),
  publishProductToGumroad: (productId: string) =>
    apiFetch<{ ok: boolean; gumroad_product_id: string; gumroad_url: string }>(
      `/api/products/${productId}/publish-gumroad`,
      { method: 'POST' },
    ),

  // User preferences (sidebar order, theme, layout)
  getUserPreference: (key: string) =>
    apiFetch<{ key: string; value: string }>(`/api/settings/preference/${key}`).catch(() => null),
  setUserPreference: (key: string, value: string) =>
    apiFetch<{ ok: boolean }>('/api/settings/preference', {
      method: 'POST',
      body: JSON.stringify({ key, value }),
    }),

  // Scoring + quality gates
  getProductScore: (id: string) =>
    apiFetch<ProductScoreResponse>(`/api/scoring/${id}/score`),
  scoreNiche: (niche: string) =>
    apiFetch<NicheScoreResponse>('/api/niches/score', {
      method: 'POST',
      body: JSON.stringify({ niche }),
    }),

  // Print on Demand (POD)
  getPodShops: () => apiFetch<{ shops: PODShop[] }>('/api/pod/shops'),
  getPodBlueprints: () => apiFetch<{ blueprints: PODBlueprint[]; total: number }>('/api/pod/blueprints'),
  getPodProducts: (status?: string) => {
    const qs = status ? `?status=${encodeURIComponent(status)}` : ''
    return apiFetch<{ products: PODProduct[] }>(`/api/pod/products${qs}`)
  },
  createPodProduct: (data: { niche: string; productType: string; title?: string; description?: string; shopId?: string; blueprintId?: number }) =>
    apiFetch<PODCreateResult>('/api/pod/products', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  publishPodProduct: (id: string) =>
    apiFetch<{ ok: boolean; id: string; status: string }>(`/api/pod/products/${id}/publish`, { method: 'POST' }),
  getPodStats: () => apiFetch<PODStats>('/api/pod/stats'),

  // Browser actions & multi-platform listing
  executeBrowserActions: (actions: BrowserAction[]) =>
    apiFetch<ExecutionResult>('/api/browser-actions/actions', {
      method: 'POST',
      body: JSON.stringify({ actions }),
    }),
  getBrowserFlows: () => apiFetch<{ flows: FlowInfo[] }>('/api/browser-actions/flows'),
  executeBrowserFlow: (name: string, variables?: Record<string, string>) =>
    apiFetch<ExecutionResult & { flow: string; platform: string }>(`/api/browser-actions/flows/${name}/execute`, {
      method: 'POST',
      body: JSON.stringify({ variables }),
    }),
  getPlatformStatuses: () =>
    apiFetch<{ platforms: PlatformStatusInfo[] }>('/api/browser-actions/platforms/status'),
  listOnPlatform: (platformName: string, product: Record<string, string>) =>
    apiFetch<ListingResult>(`/api/browser-actions/platforms/${platformName}/list`, {
      method: 'POST',
      body: JSON.stringify({ product }),
    }),
  listOnAllPlatforms: (product: Record<string, string>, platforms?: string[]) =>
    apiFetch<{ results: ListingResult[] }>('/api/browser-actions/platforms/list-all', {
      method: 'POST',
      body: JSON.stringify({ product, platforms }),
    }),
  getPlatformListings: (productId?: string) => {
    const qs = productId ? `?product_id=${productId}` : ''
    return apiFetch<{ listings: PlatformListing[] }>(`/api/browser-actions/platforms/listings${qs}`)
  },

  // A/B Testing
  getABTests: (status?: string) => {
    const qs = status ? `?status=${encodeURIComponent(status)}` : ''
    return apiFetch<{ tests: ABTest[] }>(`/api/ab-tests${qs}`)
  },
  getABTest: (id: string) => apiFetch<ABTestDetail>(`/api/ab-tests/${id}`),
  createABTest: (productId: string) =>
    apiFetch<ABTest>('/api/ab-tests', {
      method: 'POST',
      body: JSON.stringify({ product_id: productId }),
    }),
  recordABEvent: (id: string, variant: 'a' | 'b', event: 'view' | 'conversion') =>
    apiFetch<{ ok: boolean }>(`/api/ab-tests/${id}/record`, {
      method: 'POST',
      body: JSON.stringify({ variant, event }),
    }),
  completeABTest: (id: string) =>
    apiFetch<ABTestCompleteResult>(`/api/ab-tests/${id}/complete`, { method: 'POST' }),

  // Blog Engine
  getBlogPosts: (opts?: { status?: string; limit?: number; offset?: number }) => {
    const qs = new URLSearchParams()
    if (opts?.status) qs.set('status', opts.status)
    if (opts?.limit) qs.set('limit', String(opts.limit))
    if (opts?.offset) qs.set('offset', String(opts.offset))
    const q = qs.toString()
    return apiFetch<{ posts: BlogPost[]; total: number; limit: number; offset: number }>(
      `/api/blog${q ? `?${q}` : ''}`,
    )
  },
  getBlogPost: (slug: string) => apiFetch<{ post: BlogPost }>(`/api/blog/${slug}`),
  generateBlogPost: (data: { niche?: string; product_id?: string; keywords?: string; tone?: string }) =>
    apiFetch<{ post: BlogPost }>('/api/blog/generate', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateBlogPost: (id: string, data: Partial<BlogPost>) =>
    apiFetch<{ post: BlogPost }>(`/api/blog/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteBlogPost: (id: string) => apiFetch<{ ok: boolean }>(`/api/blog/${id}`, { method: 'DELETE' }),
  publishBlogPost: (id: string) =>
    apiFetch<{ post: BlogPost }>(`/api/blog/${id}/publish`, { method: 'POST' }),

  // Email list builder
  subscribe: (data: { email: string; name?: string; source?: string }) =>
    apiFetch<{ ok: boolean; id: string }>('/api/email/subscribe', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getSubscribers: () => apiFetch<SubscribersResponse>('/api/email/subscribers'),
  unsubscribe: (id: string) => apiFetch<{ ok: boolean }>(`/api/email/subscribers/${id}`, { method: 'DELETE' }),
  createCampaign: (data: { product_id?: string; subject?: string; body?: string }) =>
    apiFetch<{ ok: boolean; campaign: EmailCampaign }>('/api/email/campaigns', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getCampaigns: () => apiFetch<{ campaigns: EmailCampaign[] }>('/api/email/campaigns'),
  sendCampaign: (id: string) =>
    apiFetch<{ ok: boolean; sent_to: number; campaign_id: string; sent_at: string }>(
      `/api/email/campaigns/${id}/send`,
      { method: 'POST' },
    ),

  // Competitor Tracker
  getCompetitors: () =>
    apiFetch<{ competitors: CompetitorEntry[] }>('/api/competitors'),
  addCompetitor: (data: { name: string; url: string; platform: string; niche?: string }) =>
    apiFetch<CompetitorEntry>('/api/competitors', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  deleteCompetitor: (id: string) =>
    apiFetch<{ ok: boolean }>(`/api/competitors/${id}`, { method: 'DELETE' }),
  scanCompetitor: (id: string) =>
    apiFetch<{ ok: boolean; products_found: number; summary: string }>(`/api/competitors/${id}/scan`, { method: 'POST' }),
  getCompetitorInsights: () =>
    apiFetch<CompetitorInsightsResponse>('/api/competitors/insights'),

  // Observability
  getObservability: () =>
    apiFetch<{
      summary: {
        recent_workflows: number
        failed_workflows: number
        success_workflows: number
        failed_ai_steps: number
        product_counts: Record<string, number>
        ai_spend_today: number
        ai_spend_cap: number
        ai_cap_reached: boolean
      }
      failed_steps: Array<{
        run_id: string
        step_name: string
        status: string
        model_used: string | null
        error: string | null
        started_at: string | null
        completed_at: string | null
      }>
      recent_workflows: Array<{
        id: string
        status: string
        domain_slug: string | null
        category_slug: string | null
        created_at: string
        updated_at: string | null
      }>
      publish_results: Array<{
        id: string
        title: string
        status: string
        domain_slug: string | null
        gumroad_url: string | null
        created_at: string
      }>
    }>('/api/observability'),

  // ── Freelance Engine ───────────────────────────────────────
  getFreelanceJobs: (status?: string) => {
    const qs = status ? `?status=${encodeURIComponent(status)}` : ''
    return apiFetch<{ jobs: FreelanceJobSummary[] }>(`/api/freelance/jobs${qs}`)
  },
  getFreelanceJob: (id: string) =>
    apiFetch<FreelanceJobDetail>(`/api/freelance/jobs/${id}`),
  createFreelanceJob: (data: CreateFreelanceJobInput) =>
    apiFetch<{ id: string; status: string }>('/api/freelance/jobs', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  startFreelanceJob: (id: string) =>
    apiFetch<{ ok: boolean }>(`/api/freelance/jobs/${id}/start`, { method: 'POST' }),
  approvePlan: (id: string) =>
    apiFetch<{ ok: boolean }>(`/api/freelance/jobs/${id}/approve-plan`, { method: 'POST' }),
  provideInfo: (id: string, info: string) =>
    apiFetch<{ ok: boolean }>(`/api/freelance/jobs/${id}/provide-info`, {
      method: 'POST', body: JSON.stringify({ info }),
    }),
  pauseJob: (id: string) =>
    apiFetch<{ ok: boolean }>(`/api/freelance/jobs/${id}/pause`, { method: 'POST' }),
  resumeJob: (id: string) =>
    apiFetch<{ ok: boolean }>(`/api/freelance/jobs/${id}/resume`, { method: 'POST' }),
  cancelJob: (id: string) =>
    apiFetch<{ ok: boolean }>(`/api/freelance/jobs/${id}/cancel`, { method: 'POST' }),
  approveJob: (id: string) =>
    apiFetch<{ ok: boolean }>(`/api/freelance/jobs/${id}/approve`, { method: 'POST' }),
  forceApproveTask: (jobId: string, taskId: string) =>
    apiFetch<{ ok: boolean }>(`/api/freelance/jobs/${jobId}/tasks/${taskId}/force-approve`, { method: 'POST' }),
  requestTaskRevision: (jobId: string, taskId: string, instructions: string) =>
    apiFetch<{ ok: boolean }>(`/api/freelance/jobs/${jobId}/tasks/${taskId}/request-revision`, {
      method: 'POST', body: JSON.stringify({ instructions }),
    }),
  addJobNote: (id: string, note: string) =>
    apiFetch<{ ok: boolean }>(`/api/freelance/jobs/${id}/add-note`, {
      method: 'POST', body: JSON.stringify({ note }),
    }),
  updateJob: (id: string, data: Partial<{ deadline: string; priority: number; budget: number; max_ai_calls: number }>) =>
    apiFetch<{ ok: boolean }>(`/api/freelance/jobs/${id}`, {
      method: 'PATCH', body: JSON.stringify(data),
    }),
  clientRevision: (id: string, feedback: string) =>
    apiFetch<{ ok: boolean }>(`/api/freelance/jobs/${id}/client-revision`, {
      method: 'POST', body: JSON.stringify({ feedback }),
    }),
  getTaskArtifacts: (jobId: string, taskId: string) =>
    apiFetch<{ artifacts: TaskArtifactInfo[] }>(`/api/freelance/jobs/${jobId}/tasks/${taskId}/artifacts`),
  getPlaybook: (jobType: string) =>
    apiFetch<{ job_type: string; stages: PlaybookStageInfo[] }>(`/api/freelance/playbooks/${jobType}`),
  saveTemplate: (id: string, name: string) =>
    apiFetch<{ ok: boolean; template_id: string }>(`/api/freelance/jobs/${id}/save-template`, {
      method: 'POST', body: JSON.stringify({ name }),
    }),
  getTemplates: (jobType?: string) =>
    apiFetch<{ templates: TemplateInfo[] }>(`/api/freelance/templates${jobType ? `?job_type=${jobType}` : ''}`),
  getPortfolio: () =>
    apiFetch<{ entries: PortfolioEntryInfo[] }>('/api/freelance/portfolio'),
  generatePortfolio: (id: string) =>
    apiFetch<{ ok: boolean; entry: PortfolioEntryInfo }>(`/api/freelance/jobs/${id}/portfolio`, {
      method: 'POST',
    }),
  getCommandCenter: () =>
    apiFetch<CommandCenterData>('/api/freelance/command-center'),
  getIntakeQuestions: (jobType: string) =>
    apiFetch<{ questions: IntakeQuestionInfo[] }>(`/api/freelance/intake-questions/${jobType}`),

  // ── Opportunity Radar ──────────────────────────────────────
  getOpportunities: (params?: { status?: string; format?: string; min_score?: number; niche?: string }) => {
    const qs = new URLSearchParams()
    if (params?.status) qs.set('status', params.status)
    if (params?.format) qs.set('format', params.format)
    if (params?.min_score) qs.set('min_score', String(params.min_score))
    if (params?.niche) qs.set('niche', params.niche)
    const query = qs.toString()
    return apiFetch<{ opportunities: OpportunityInfo[] }>(`/api/opportunities${query ? `?${query}` : ''}`)
  },
  getOpportunity: (id: string) =>
    apiFetch<{ opportunity: OpportunityInfo }>(`/api/opportunities/${id}`),
  createOpportunity: (data: CreateOpportunityInput) =>
    apiFetch<{ ok: boolean; id: string }>('/api/opportunities', {
      method: 'POST', body: JSON.stringify(data),
    }),
  updateOpportunityStatus: (id: string, status: string) =>
    apiFetch<{ ok: boolean }>(`/api/opportunities/${id}/status`, {
      method: 'PATCH', body: JSON.stringify({ status }),
    }),
  deleteOpportunity: (id: string) =>
    apiFetch<{ ok: boolean }>(`/api/opportunities/${id}`, { method: 'DELETE' }),
  scanOpportunities: (niche?: string) =>
    apiFetch<{ ok: boolean; scanned: number; inserted_ids: string[] }>('/api/opportunities/scan', {
      method: 'POST', body: JSON.stringify({ niche }),
    }),
  nicheFactory: (niche: string) =>
    apiFetch<{ ok: boolean; niche: string; plan: string }>('/api/opportunities/niche-factory', {
      method: 'POST', body: JSON.stringify({ niche }),
    }),
  getOpportunitySummary: () =>
    apiFetch<OpportunitySummary>('/api/opportunities/summary'),

  // ── Background Job Queue ───────────────────────────────
  getQueueJobs: (filters?: { status?: string; step?: string; limit?: number }) => {
    const qs = new URLSearchParams()
    if (filters?.status) qs.set('status', filters.status)
    if (filters?.step) qs.set('step', filters.step)
    if (filters?.limit) qs.set('limit', String(filters.limit))
    const q = qs.toString()
    return apiFetch<{ jobs: Job[]; total: number }>(`/api/queue/jobs${q ? `?${q}` : ''}`)
  },
  getQueueStats: () => apiFetch<{ stats: QueueStats }>('/api/queue/stats'),
  getQueueJob: (jobId: string) => apiFetch<{ job: Job; agent_output: { agent_name: string; output: string } | null }>(`/api/queue/jobs/${jobId}`),
  runNextJob: () => apiFetch<{ ok: boolean }>('/api/queue/run-next', { method: 'POST' }),
  requeueAllFailed: () => apiFetch<{ ok: boolean }>('/api/queue/requeue-all-failed', { method: 'POST' }),
  requeueJob: (jobId: string) => apiFetch<{ ok: boolean }>(`/api/queue/jobs/${jobId}/requeue`, { method: 'POST' }),
  cancelQueueJob: (jobId: string) => apiFetch<{ ok: boolean }>(`/api/queue/jobs/${jobId}`, { method: 'DELETE' }),

  // ── V2 agents wired into nexus-api (Phase 9-10) ──────────────────────
  // Autonome — goal-driven autonomous loop
  getAutonomeGoals: () =>
    apiFetch<{ source: 'live' | 'unconfigured'; goals: Array<{
      id: string; title: string; metric: string; target: number;
      period: string; tags?: string[]; enabled?: number | boolean;
    }>; note?: string }>('/api/autonome/goals'),
  // BUG-P1-5: the runs route returns `{id, generated_at, result: AutonomeRunResult}`,
  // not the old `{goal_id, started_at, status, ...}` shape. The page-level Run type
  // mirrors this; keep the api layer aligned so TS guards both ends.
  getAutonomeRuns: () =>
    apiFetch<{
      source?: 'live' | 'unconfigured'
      runs: Array<{
        id: string | number
        generated_at: string
        result: {
          generated_at: string
          goals_evaluated: number
          off_track: number
          actions_planned: number
          tasks_enqueued: number
          notifications_sent: number
          enqueue_errors: number
          actions: Array<{ goal_id?: string; status?: string; note?: string }>
        }
      }>
      note?: string
    }>('/api/autonome/runs'),
  runAutonomeTick: () =>
    apiFetch<{ ok: boolean; runs?: number; error?: string }>('/api/autonome/run', { method: 'POST' }),

  // Budget — caps & usage rollups
  getBudgetCaps: () =>
    apiFetch<{ source: 'live' | 'unconfigured'; caps: Array<{
      id?: string; scope: 'global' | 'task_type' | 'model'; match?: string;
      period: 'day' | 'week' | 'month'; limit_usd: number; warn_at?: number;
      enabled?: number | boolean;
    }>; note?: string }>('/api/budget/caps'),
  getBudgetSummary: (period: 'day' | 'week' | 'month' = 'week') =>
    apiFetch<{ source: 'live' | 'unconfigured'; period: string;
      total_usd: number; total_runs: number;
      by_model: Array<{ model: string; count: number; cost: number }>;
      by_task: Array<{ task_type: string; count: number; cost: number }>;
      note?: string;
    }>(`/api/budget/summary?period=${period}`),

  // Analytics — multi-platform post performance
  getAnalyticsSummary: () =>
    apiFetch<{ source: 'live' | 'unconfigured';
      totals: { posts: number; impressions: number; engagements: number; clicks: number };
      by_platform: Array<{ platform: string; posts: number; impressions: number; engagements: number; clicks: number }>;
      note?: string;
    }>('/api/analytics/summary'),

  // Publisher queue — scheduled cross-platform posts
  getPublisherQueueSummary: () =>
    apiFetch<{ source: 'live' | 'unconfigured';
      pending: number; in_progress: number; succeeded: number; failed: number;
      next_run_at?: string; note?: string;
    }>('/api/publisher-queue/summary'),
  getPublisherQueueJobs: (status?: string) => {
    const q = status ? `?status=${encodeURIComponent(status)}` : ''
    return apiFetch<{ source: 'live' | 'unconfigured'; jobs: Array<{
      id: string; platform: string; status: string; scheduled_for?: string;
      attempts?: number; last_error?: string; payload_kind?: string;
    }>; note?: string }>(`/api/publisher-queue/jobs${q}`)
  },

  // Insights — MindsDB-backed predictions (query by saved query id)
  getInsight: (queryId: string) =>
    apiFetch<{ source: 'live' | 'unconfigured'; query_id: string;
      rows?: unknown[]; note?: string;
    }>(`/api/insights/${encodeURIComponent(queryId)}`),
}
