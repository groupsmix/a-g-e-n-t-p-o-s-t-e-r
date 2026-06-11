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
} from '@posteragent/types/nexus'

// Re-export the wire contract for backward compatibility — consumers keep
// importing from '@/lib/api'. The contract itself now lives in the shared
// types package so the Worker produces the same shapes (audit #13).
export * from '@posteragent/types/nexus/api-contract'
export type { Domain, Product, ProductDetail, WorkflowStatusResponse } from '@posteragent/types/nexus'

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
  Digest, DigestRecord, HistoryRun, PublishItem, Stats,
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
} from '@posteragent/types/nexus/api-contract'

// Re-export queue/publish types explicitly
export type { Job, QueueStats, JobStatus, PublishProductResult };

// Connection plumbing (API base, auth token, fetch core) lives in ./rpc
// together with the typed hono/client clients. Re-exported here so the 58
// existing consumer imports keep working unchanged.
import { rpc, json, mutate, rpcGet, API_BASE, getToken, setToken } from './rpc'

export { API_BASE, API_BASE_IS_FALLBACK, isApiMisconfigured, getToken, setToken } from './rpc'

export function assetUrl(path?: string | null): string | null {
  if (!path) return null
  if (/^https?:\/\//i.test(path)) return path
  return `${API_BASE}${path}`
}

/**
 * Legacy escape hatch for endpoints not yet expressible through the typed
 * clients (no validator-declared inputs). Same semantics as ./rpc's core.
 */
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
  getDomains: () => rpc.domains.index.$get().then(json<Domain[]>),
  createDomain: (data: Partial<Domain>) => mutate<Domain>(rpc.domains.index.$url(), 'POST', data),
  updateDomain: (id: string, data: Partial<Domain>) =>
    mutate<Domain>(rpc.domains[':id'].$url({ param: { id } }), 'PATCH', data),
  deleteDomain: (id: string) => mutate<void>(rpc.domains[':id'].$url({ param: { id } }), 'DELETE'),

  // Categories
  getCategories: (domainId: string) =>
    rpc.domains[':id'].categories.$get({ param: { id: domainId } }).then(json<Category[]>),
  createCategory: (domainId: string, data: Partial<Category>) =>
    mutate<Category>(rpc.domains[':id'].categories.$url({ param: { id: domainId } }), 'POST', data),
  updateCategory: (id: string, data: Partial<Category>) =>
    mutate<Category>(rpc.categories[':id'].$url({ param: { id } }), 'PATCH', data),
  deleteCategory: (id: string) => mutate<void>(rpc.categories[':id'].$url({ param: { id } }), 'DELETE'),
  // getCategoryBySlug / getDomainBySlug removed (audit #13): zero consumers,
  // and both targeted routes that never existed on the Worker (guaranteed
  // 404s) — the exact failure mode the typed clients make uncompilable.

  // Workflow
  startWorkflow: (data: StartWorkflowInput) => mutate<{ workflow_id: string; product_id: string }>(rpc.workflow.start.$url(), 'POST', data),
  getWorkflowStatus: (id: string) => rpc.workflow[':id'].$get({ param: { id } }).then(json<WorkflowStatusResponse>),

  // Review
  approveProduct: (productId: string) => mutate<void>(rpc.review[':productId'].approve.$url({ param: { productId } }), 'POST'),
  rejectProduct: (productId: string, feedback: string) => mutate<void>(rpc.review[':productId'].reject.$url({ param: { productId } }), 'POST', { feedback }),

  // Products
  //
  // T16: server-side pagination. `total` is the true filtered total (not
  // the page size, which is what the old endpoint returned). `has_more`
  // is derived server-side so the UI doesn't repeat the math. `limit` is
  // clamped to MAX=100 on the server.
  getProducts: (filters?: { status?: string; domain_id?: string; limit?: number; offset?: number; q?: string }) => {
    const params = new URLSearchParams()
    if (filters?.status) params.set('status', filters.status)
    if (filters?.domain_id) params.set('domain_id', filters.domain_id)
    if (typeof filters?.limit === 'number') params.set('limit', String(filters.limit))
    if (typeof filters?.offset === 'number') params.set('offset', String(filters.offset))
    if (filters?.q) params.set('q', filters.q)
    const url = rpc.products.index.$url()
    url.search = params.toString()
    return rpcGet<{ products: Product[]; total: number; limit: number; offset: number; has_more: boolean }>(url)
  },
  getProduct: (id: string) => rpc.products[':id'].$get({ param: { id } }).then(json<Product>),
  getProductDetail: (id: string) =>
    rpc.products[':id'].detail.$get({ param: { id } }).then(json<ProductDetail>),
  generateDeliverable: (id: string, opts?: { format?: string; force?: boolean }) => {
    const qs = new URLSearchParams()
    if (opts?.format) qs.set('format', opts.format)
    if (opts?.force) qs.set('force', '1')
    const url = rpc.products[':id']['generate-deliverable'].$url({ param: { id } })
    url.search = qs.toString()
    return mutate<{ ok: boolean; deliverable_url: string; deliverable_format: string }>(url, 'POST')
  },
  updateProductSection: (id: string, patch: Partial<ProductDetail>) =>
    mutate<ProductDetail>(rpc.products[':id'].detail.$url({ param: { id } }), 'PATCH', patch),
  deleteProduct: (id: string) => mutate<void>(rpc.products[':id'].$url({ param: { id } }), 'DELETE'),
  // Re-dispatch the 15-step pipeline for a product that's stuck or rejected.
  // The Worker resets the product to 'running' and queues a fresh workflow_run.
  retryProduct: (id: string) =>
    mutate<{ ok: boolean; workflow_id: string; product_id: string; status: string }>(
      rpc.products[':id'].retry.$url({ param: { id } }),
      'POST',
    ),

  // Trends
  getTrends: () => rpc.trends.index.$get().then(json<TrendAlert[]>),
  dismissTrend: (id: string) => mutate<void>(rpc.trends[':id'].dismiss.$url({ param: { id } }), 'POST'),
  startTrendWorkflow: (id: string) => mutate<{ workflow_id: string }>(rpc.trends[':id'].start.$url({ param: { id } }), 'POST'),

  // Winners
  getWinnerPatterns: () => rpc.winners.index.$get().then(json<WinnerPattern[]>),

  // AI Models
  getAIModels: () => rpc.aiModels.index.$get().then(json<AIModelDashboardStatus[]>),
  updateAIModel: (id: string, data: Partial<AIModelDashboardStatus>) => mutate<AIModelDashboardStatus>(rpc.aiModels[':id'].$url({ param: { id } }), 'PATCH', data),

  // Platforms
  getPlatforms: () => rpc.platforms.index.$get().then(json<Platform[]>),
  createPlatform: (data: Partial<Platform>) => mutate<Platform>(rpc.platforms.index.$url(), 'POST', data),
  updatePlatform: (id: string, data: Partial<Platform>) => mutate<Platform>(rpc.platforms[':id'].$url({ param: { id } }), 'PATCH', data),
  deletePlatform: (id: string) => mutate<void>(rpc.platforms[':id'].$url({ param: { id } }), 'DELETE'),

  // Social
  getSocialChannels: () => rpc.social.index.$get().then(json<SocialChannel[]>),
  createSocialChannel: (data: Partial<SocialChannel>) => mutate<SocialChannel>(rpc.social.index.$url(), 'POST', data),
  updateSocialChannel: (id: string, data: Partial<SocialChannel>) => mutate<SocialChannel>(rpc.social[':id'].$url({ param: { id } }), 'PATCH', data),
  deleteSocialChannel: (id: string) => mutate<void>(rpc.social[':id'].$url({ param: { id } }), 'DELETE'),

  // Prompts
  getPrompts: (layer?: string) => {
    const url = rpc.prompts.index.$url()
    if (layer) url.searchParams.set('layer', layer)
    return rpcGet<PromptTemplate[]>(url)
  },
  updatePrompt: (id: string, promptText: string) => mutate<PromptTemplate>(rpc.prompts[':id'].$url({ param: { id } }), 'PATCH', { prompt_text: promptText }),

  // Settings
  getSettings: () => rpc.settings.index.$get().then(json<Settings>),
  updateSettings: (data: Partial<Settings>) => mutate<Settings>(rpc.settings.index.$url(), 'PATCH', data),

  // API keys (dashboard-managed provider credentials)
  getKeys: () => rpc.keys.index.$get().then(json<KeysResponse>),
  saveKeys: (keys: Record<string, string>) =>
    mutate<{ ok: boolean; written: number; ai_forwarded: boolean }>(rpc.keys.index.$url(), 'POST', { keys }),

  // AI cost meter + daily spend cap
  getSpend: () => rpc.keys.spend.$get().then(json<{ today: number; cap: number; cap_reached: boolean }>),
  setCap: (cap_usd: number) =>
    mutate<{ ok: boolean; cap: number }>(rpc.keys.cap.$url(), 'POST', { cap_usd }),

  // Per-provider ON/OFF (key stays saved)
  getProviders: () => rpc.keys.providers.$get().then(json<{ providers: { secretKey: string; off: boolean }[] }>),
  toggleProvider: (secretKey: string, off: boolean) =>
    mutate<{ ok: boolean; secretKey: string; off: boolean }>(rpc.keys.providers.toggle.$url(), 'POST', { secretKey, off }),

  // CEO Manager (chat orchestrator)
  managerChat: (message: string, history: ManagerMessage[]) =>
    mutate<ManagerReply>(rpc.manager.chat.$url(), 'POST', { message, history }),

  // CEO Agent (full-control, tool-using)
  managerAgent: (message: string, history: ManagerMessage[]) =>
    mutate<AgentReply>(rpc.agent.agent.$url(), 'POST', { message, history }),

  // Browser automation (headless browser on the Workers Paid plan)
  browserStatus: () => rpc.browser.status.$get().then(json<{ enabled: boolean }>),
  browserRun: (url: string, instruction?: string) =>
    mutate<BrowseResult>(rpc.browser.run.$url(), 'POST', { url, instruction }),
  browserAssist: (goal: string, startUrl?: string) =>
    mutate<AssistResult>(rpc.browser.assist.$url(), 'POST', { goal, startUrl }),

  // Hyperbeam live browser
  hyperbeamCreate: (url?: string) =>
    mutate<{ ok: boolean; sessionId: string; embedUrl: string }>(rpc.hyperbeam.session.$url(), 'POST', url ? { url } : {}),
  hyperbeamDestroy: (sessionId: string) =>
    mutate<{ ok: boolean }>(rpc.hyperbeam.session[':id'].$url({ param: { id: sessionId } }), 'DELETE'),

  // AI agent team line-up
  getTeam: () => rpc.team.index.$get().then(json<TeamReply>),

  // Scheduler
  getSchedules: () => rpc.schedules.index.$get().then(json<{ schedules: Schedule[] }>),
  createSchedule: (s: NewSchedule) =>
    mutate<{ id: string; ok: boolean }>(rpc.schedules.index.$url(), 'POST', s),
  toggleSchedule: (id: string, active: boolean) =>
    mutate<void>(rpc.schedules[':id'].$url({ param: { id } }), 'PATCH', { active }),
  deleteSchedule: (id: string) => mutate<void>(rpc.schedules[':id'].$url({ param: { id } }), 'DELETE'),
  runSchedule: (id: string) =>
    mutate<{ ok: boolean; delivery: { id: string; title: string; kind: string } }>(rpc.schedules[':id'].run.$url({ param: { id } }), 'POST'),
  getDeliveries: () => rpc.schedules.deliveries.list.$get().then(json<{ deliveries: Delivery[] }>),
  getDelivery: (id: string) => rpc.schedules.deliveries[':id'].$get({ param: { id } }).then(json<{ delivery: DeliveryFull }>),

  // Autopilot money engine
  getAutopilot: () => rpc.autopilot.status.$get().then(json<AutopilotStatus>),
  toggleAutopilot: (patch: { enabled?: boolean; per_run?: number; auto_approve?: boolean; auto_publish?: boolean; min_score?: number }) =>
    mutate<{ ok: boolean; enabled: boolean }>(rpc.autopilot.toggle.$url(), 'POST', patch),
  runAutopilot: () => mutate<{ ok: boolean; built: number }>(rpc.autopilot.run.$url(), 'POST'),

  // Marketing team
  getMarketing: () => rpc.marketing.status.$get().then(json<MarketingStatus>),
  toggleMarketing: (patch: { enabled?: boolean; per_run?: number }) =>
    mutate<{ ok: boolean; enabled: boolean }>(rpc.marketing.toggle.$url(), 'POST', patch),
  runMarketing: () => mutate<{ ok: boolean; promoted: number }>(rpc.marketing.run.$url(), 'POST'),

  // Graveyard
  getGraveyard: () => rpc.graveyard.index.$get().then(json<{ products: Product[] }>),
  restoreProduct: (id: string) => mutate<void>(rpc.graveyard[':productId'].restore.$url({ param: { productId: id } }), 'POST'),

  // History
  getHistory: () => rpc.history.index.$get().then(json<{ runs: HistoryRun[] }>),

  // Publish
  getPublishQueue: () => rpc.publish.index.$get().then(json<{ items: PublishItem[] }>),
  publishItem: (id: string) => mutate<void>(rpc.publish[':id'].$url({ param: { id } }), 'POST'),

  // Revenue (real Gumroad sales)
  getRevenue: () => rpc.revenue.index.$get().then(json<RevenueResponse>),

  // Single consolidated counts source for every dashboard widget.
  getStats: () => rpc.stats.index.$get().then(json<Stats>),

  // Daily digest / morning report
  getDigest: () => rpc.digest.index.$get().then(json<Digest>),
  getDigestToday: () => rpc.digest.today.$get().then(json<Digest>),
  getDigestHistory: () => rpc.digest.history.$get().then(json<{ digests: DigestRecord[] }>),
  generateDigest: () => mutate<{ ok: boolean; digest: Digest }>(rpc.digest.generate.$url(), 'POST'),
  sendDigestEmail: (to?: string) =>
    mutate<{ ok: boolean; status: string; digest: Digest }>(rpc.digest.email.$url(), 'POST', to ? { to } : {}),

  // Learning Loop
  getLearningStats: () => rpc.learning.stats.$get().then(json<LearningStats>),
  getLearningPatterns: () => rpc.learning.patterns.$get().then(json<{ patterns: LearningPatternRow[]; total: number }>),
  syncLearning: () => mutate<{ ok: boolean; synced: number; total_revenue: number; error?: string }>(rpc.learning.sync.$url(), 'POST'),
  analyzeLearning: () => mutate<{ ok: boolean; patterns_created: number; patterns_updated: number }>(rpc.learning.analyze.$url(), 'POST'),

  // Access gate
  getAuthStatus: () => rpc.auth.status.$get().then(json<{ protected: boolean }>),
  login: (password: string) =>
    mutate<{ token: string }>(rpc.auth.login.$url(), 'POST', { password }),
  setupPassword: (password: string, current?: string) =>
    mutate<{ ok: boolean; token: string }>(rpc.auth.setup.$url(), 'POST', { password, current }),
  // FOUND BY AUDIT #13: /api/auth/disable does not exist on the Worker
  // (auth.ts registers /status, /login, /logout-all, /setup only), so the
  // "disable password" button in settings has been 404ing. Kept on the raw
  // fetch path deliberately - the typed clients cannot express this route
  // because it isn't real. Needs a server-side fix or removal of the button.
  disableAuth: (current: string) =>
    apiFetch<{ ok: boolean }>('/api/auth/disable', { method: 'POST', body: JSON.stringify({ current }) }),

  // Gumroad integration
  getGumroadProducts: () => rpc.gumroad.products.$get().then(json<{ products: GumroadProductInfo[] }>),
  createGumroadProduct: (data: { name: string; price: number; description?: string; id?: string }) =>
    mutate<{ product: GumroadProductInfo }>(rpc.gumroad.products.$url(), 'POST', data),
  getGumroadSales: (opts?: { after?: string; before?: string; page?: number }) => {
    const qs = new URLSearchParams()
    if (opts?.after) qs.set('after', opts.after)
    if (opts?.before) qs.set('before', opts.before)
    if (opts?.page) qs.set('page', String(opts.page))
    const q = qs.toString()
    const url = rpc.gumroad.sales.$url()
    url.search = q
    return rpcGet<{ sales: GumroadSaleInfo[] }>(url)
  },
  getGumroadAnalytics: (productId: string) =>
    rpc.gumroad.products[':id'].analytics.$get({ param: { id: productId } }).then(json<{ analytics: GumroadAnalyticsInfo }>),
  publishProductToGumroad: (productId: string) =>
    mutate<{ ok: boolean; gumroad_product_id: string; gumroad_url: string }>(rpc.products[':id']['publish-gumroad'].$url({ param: { id: productId } }), 'POST'),

  // User preferences (sidebar order, theme, layout)
  getUserPreference: (key: string) =>
    rpc.settings.preference[':key'].$get({ param: { key } }).then(json<{ key: string; value: string }>).catch(() => null),
  setUserPreference: (key: string, value: string) =>
    mutate<{ ok: boolean }>(rpc.settings.preference.$url(), 'POST', { key, value }),

  // Scoring + quality gates
  getProductScore: (id: string) =>
    rpc.scoring[':id'].score.$get({ param: { id } }).then(json<ProductScoreResponse>),
  scoreNiche: (niche: string) =>
    mutate<NicheScoreResponse>(rpc.niches.score.$url(), 'POST', { niche }),

  // Print on Demand (POD)
  getPodShops: () => rpc.pod.shops.$get().then(json<{ shops: PODShop[] }>),
  getPodBlueprints: () => rpc.pod.blueprints.$get().then(json<{ blueprints: PODBlueprint[]; total: number }>),
  getPodProducts: (status?: string) => {
    const url = rpc.pod.products.$url()
    if (status) url.searchParams.set('status', status)
    return rpcGet<{ products: PODProduct[] }>(url)
  },
  createPodProduct: (data: { niche: string; productType: string; title?: string; description?: string; shopId?: string; blueprintId?: number }) =>
    mutate<PODCreateResult>(rpc.pod.products.$url(), 'POST', data),
  publishPodProduct: (id: string) =>
    mutate<{ ok: boolean; id: string; status: string }>(rpc.pod.products[':id'].publish.$url({ param: { id } }), 'POST'),
  getPodStats: () => rpc.pod.stats.$get().then(json<PODStats>),

  // Browser actions & multi-platform listing
  executeBrowserActions: (actions: BrowserAction[]) =>
    mutate<ExecutionResult>(rpc.browserActions.actions.$url(), 'POST', { actions }),
  getBrowserFlows: () => rpc.browserActions.flows.$get().then(json<{ flows: FlowInfo[] }>),
  executeBrowserFlow: (name: string, variables?: Record<string, string>) =>
    mutate<ExecutionResult & { flow: string; platform: string }>(rpc.browserActions.flows[':name'].execute.$url({ param: { name } }), 'POST', { variables }),
  getPlatformStatuses: () =>
    rpc.browserActions.platforms.status.$get().then(json<{ platforms: PlatformStatusInfo[] }>),
  listOnPlatform: (platformName: string, product: Record<string, string>) =>
    mutate<ListingResult>(rpc.browserActions.platforms[':name'].list.$url({ param: { name: platformName } }), 'POST', { product }),
  listOnAllPlatforms: (product: Record<string, string>, platforms?: string[]) =>
    mutate<{ results: ListingResult[] }>(rpc.browserActions.platforms['list-all'].$url(), 'POST', { product, platforms }),
  getPlatformListings: (productId?: string) => {
    const url = rpc.browserActions.platforms.listings.$url()
    if (productId) url.searchParams.set('product_id', productId)
    return rpcGet<{ listings: PlatformListing[] }>(url)
  },

  // A/B Testing
  getABTests: (status?: string) => {
    const url = rpc.abTests.index.$url()
    if (status) url.searchParams.set('status', status)
    return rpcGet<{ tests: ABTest[] }>(url)
  },
  getABTest: (id: string) => rpc.abTests[':id'].$get({ param: { id } }).then(json<ABTestDetail>),
  createABTest: (productId: string) =>
    mutate<ABTest>(rpc.abTests.index.$url(), 'POST', { product_id: productId }),
  recordABEvent: (id: string, variant: 'a' | 'b', event: 'view' | 'conversion') =>
    mutate<{ ok: boolean }>(rpc.abTests[':id'].record.$url({ param: { id } }), 'POST', { variant, event }),
  completeABTest: (id: string) =>
    mutate<ABTestCompleteResult>(rpc.abTests[':id'].complete.$url({ param: { id } }), 'POST'),

  // Blog Engine
  getBlogPosts: (opts?: { status?: string; limit?: number; offset?: number }) => {
    const qs = new URLSearchParams()
    if (opts?.status) qs.set('status', opts.status)
    if (opts?.limit) qs.set('limit', String(opts.limit))
    if (opts?.offset) qs.set('offset', String(opts.offset))
    const url = rpc.blog.index.$url()
    url.search = qs.toString()
    return rpcGet<{ posts: BlogPost[]; total: number; limit: number; offset: number }>(url)
  },
  getBlogPost: (slug: string) => rpc.blog[':slug'].$get({ param: { slug } }).then(json<{ post: BlogPost }>),
  generateBlogPost: (data: { niche?: string; product_id?: string; keywords?: string; tone?: string }) =>
    mutate<{ post: BlogPost }>(rpc.blog.generate.$url(), 'POST', data),
  updateBlogPost: (id: string, data: Partial<BlogPost>) =>
    mutate<{ post: BlogPost }>(rpc.blog[':id'].$url({ param: { id } }), 'PUT', data),
  deleteBlogPost: (id: string) => mutate<{ ok: boolean }>(rpc.blog[':id'].$url({ param: { id } }), 'DELETE'),
  publishBlogPost: (id: string) =>
    mutate<{ post: BlogPost }>(rpc.blog[':id'].publish.$url({ param: { id } }), 'POST'),

  // Email list builder
  subscribe: (data: { email: string; name?: string; source?: string }) =>
    mutate<{ ok: boolean; id: string }>(rpc.email.subscribe.$url(), 'POST', data),
  getSubscribers: () => rpc.email.subscribers.$get().then(json<SubscribersResponse>),
  unsubscribe: (id: string) => mutate<{ ok: boolean }>(rpc.email.subscribers[':id'].$url({ param: { id } }), 'DELETE'),
  createCampaign: (data: { product_id?: string; subject?: string; body?: string }) =>
    mutate<{ ok: boolean; campaign: EmailCampaign }>(rpc.email.campaigns.$url(), 'POST', data),
  getCampaigns: () => rpc.email.campaigns.$get().then(json<{ campaigns: EmailCampaign[] }>),
  sendCampaign: (id: string) =>
    mutate<{ ok: boolean; sent_to: number; campaign_id: string; sent_at: string }>(rpc.email.campaigns[':id'].send.$url({ param: { id } }), 'POST'),

  // Competitor Tracker
  getCompetitors: () =>
    rpc.competitors.index.$get().then(json<{ competitors: CompetitorEntry[] }>),
  addCompetitor: (data: { name: string; url: string; platform: string; niche?: string }) =>
    mutate<CompetitorEntry>(rpc.competitors.index.$url(), 'POST', data),
  deleteCompetitor: (id: string) =>
    mutate<{ ok: boolean }>(rpc.competitors[':id'].$url({ param: { id } }), 'DELETE'),
  scanCompetitor: (id: string) =>
    mutate<{ ok: boolean; products_found: number; summary: string }>(rpc.competitors[':id'].scan.$url({ param: { id } }), 'POST'),
  getCompetitorInsights: () =>
    rpc.competitors.insights.$get().then(json<CompetitorInsightsResponse>),

  // Observability
  getObservability: () =>
    rpc.observability.index.$get().then(json<{
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
    }>),

  // ── Freelance Engine ───────────────────────────────────────
  getFreelanceJobs: (status?: string) => {
    const url = rpc.freelance.jobs.$url()
    if (status) url.searchParams.set('status', status)
    return rpcGet<{ jobs: FreelanceJobSummary[] }>(url)
  },
  getFreelanceJob: (id: string) =>
    rpc.freelance.jobs[':id'].$get({ param: { id } }).then(json<FreelanceJobDetail>),
  createFreelanceJob: (data: CreateFreelanceJobInput) =>
    mutate<{ id: string; status: string }>(rpc.freelance.jobs.$url(), 'POST', data),
  startFreelanceJob: (id: string) =>
    mutate<{ ok: boolean }>(rpc.freelance.jobs[':id'].start.$url({ param: { id } }), 'POST'),
  approvePlan: (id: string) =>
    mutate<{ ok: boolean }>(rpc.freelance.jobs[':id']['approve-plan'].$url({ param: { id } }), 'POST'),
  provideInfo: (id: string, info: string) =>
    mutate<{ ok: boolean }>(rpc.freelance.jobs[':id']['provide-info'].$url({ param: { id } }), 'POST', { info }),
  pauseJob: (id: string) =>
    mutate<{ ok: boolean }>(rpc.freelance.jobs[':id'].pause.$url({ param: { id } }), 'POST'),
  resumeJob: (id: string) =>
    mutate<{ ok: boolean }>(rpc.freelance.jobs[':id'].resume.$url({ param: { id } }), 'POST'),
  cancelJob: (id: string) =>
    mutate<{ ok: boolean }>(rpc.freelance.jobs[':id'].cancel.$url({ param: { id } }), 'POST'),
  approveJob: (id: string) =>
    mutate<{ ok: boolean }>(rpc.freelance.jobs[':id'].approve.$url({ param: { id } }), 'POST'),
  forceApproveTask: (jobId: string, taskId: string) =>
    mutate<{ ok: boolean }>(rpc.freelance.jobs[':id'].tasks[':taskId']['force-approve'].$url({ param: { id: jobId, taskId } }), 'POST'),
  requestTaskRevision: (jobId: string, taskId: string, instructions: string) =>
    mutate<{ ok: boolean }>(rpc.freelance.jobs[':id'].tasks[':taskId']['request-revision'].$url({ param: { id: jobId, taskId } }), 'POST', { instructions }),
  addJobNote: (id: string, note: string) =>
    mutate<{ ok: boolean }>(rpc.freelance.jobs[':id']['add-note'].$url({ param: { id } }), 'POST', { note }),
  updateJob: (id: string, data: Partial<{ deadline: string; priority: number; budget: number; max_ai_calls: number }>) =>
    mutate<{ ok: boolean }>(rpc.freelance.jobs[':id'].$url({ param: { id } }), 'PATCH', data),
  clientRevision: (id: string, feedback: string) =>
    mutate<{ ok: boolean }>(rpc.freelance.jobs[':id']['client-revision'].$url({ param: { id } }), 'POST', { feedback }),
  getTaskArtifacts: (jobId: string, taskId: string) =>
    rpc.freelance.jobs[':id'].tasks[':taskId'].artifacts.$get({ param: { id: jobId, taskId } }).then(json<{ artifacts: TaskArtifactInfo[] }>),
  getPlaybook: (jobType: string) =>
    rpc.freelance.playbooks[':jobType'].$get({ param: { jobType } }).then(json<{ job_type: string; stages: PlaybookStageInfo[] }>),
  saveTemplate: (id: string, name: string) =>
    mutate<{ ok: boolean; template_id: string }>(rpc.freelance.jobs[':id']['save-template'].$url({ param: { id } }), 'POST', { name }),
  getTemplates: (jobType?: string) => {
    const url = rpc.freelance.templates.$url()
    if (jobType) url.searchParams.set('job_type', jobType)
    return rpcGet<{ templates: TemplateInfo[] }>(url)
  },
  getPortfolio: () =>
    rpc.freelance.portfolio.$get().then(json<{ entries: PortfolioEntryInfo[] }>),
  generatePortfolio: (id: string) =>
    mutate<{ ok: boolean; entry: PortfolioEntryInfo }>(rpc.freelance.jobs[':id'].portfolio.$url({ param: { id } }), 'POST'),
  getCommandCenter: () =>
    rpc.freelance['command-center'].$get().then(json<CommandCenterData>),
  getIntakeQuestions: (jobType: string) =>
    rpc.freelance['intake-questions'][':jobType'].$get({ param: { jobType } }).then(json<{ questions: IntakeQuestionInfo[] }>),

  // ── Opportunity Radar ──────────────────────────────────────
  getOpportunities: (params?: { status?: string; format?: string; min_score?: number; niche?: string }) => {
    const qs = new URLSearchParams()
    if (params?.status) qs.set('status', params.status)
    if (params?.format) qs.set('format', params.format)
    if (params?.min_score) qs.set('min_score', String(params.min_score))
    if (params?.niche) qs.set('niche', params.niche)
    const url = rpc.opportunities.index.$url()
    url.search = qs.toString()
    return rpcGet<{ opportunities: OpportunityInfo[] }>(url)
  },
  getOpportunity: (id: string) =>
    rpc.opportunities[':id'].$get({ param: { id } }).then(json<{ opportunity: OpportunityInfo }>),
  createOpportunity: (data: CreateOpportunityInput) =>
    mutate<{ ok: boolean; id: string }>(rpc.opportunities.index.$url(), 'POST', data),
  updateOpportunityStatus: (id: string, status: string) =>
    mutate<{ ok: boolean }>(rpc.opportunities[':id'].status.$url({ param: { id } }), 'PATCH', { status }),
  deleteOpportunity: (id: string) =>
    mutate<{ ok: boolean }>(rpc.opportunities[':id'].$url({ param: { id } }), 'DELETE'),
  scanOpportunities: (niche?: string) =>
    mutate<{ ok: boolean; scanned: number; inserted_ids: string[] }>(rpc.opportunities.scan.$url(), 'POST', { niche }),
  nicheFactory: (niche: string) =>
    mutate<{ ok: boolean; niche: string; plan: string }>(rpc.opportunities['niche-factory'].$url(), 'POST', { niche }),
  getOpportunitySummary: () =>
    rpc.opportunities.summary.$get().then(json<OpportunitySummary>),

  // ── Background Job Queue ───────────────────────────────
  getQueueJobs: (filters?: { status?: string; step?: string; limit?: number }) => {
    const qs = new URLSearchParams()
    if (filters?.status) qs.set('status', filters.status)
    if (filters?.step) qs.set('step', filters.step)
    if (filters?.limit) qs.set('limit', String(filters.limit))
    const url = rpc.queue.jobs.$url()
    url.search = qs.toString()
    return rpcGet<{ jobs: Job[]; total: number }>(url)
  },
  getQueueStats: () => rpc.queue.stats.$get().then(json<{ stats: QueueStats }>),
  getQueueJob: (jobId: string) => rpc.queue.jobs[':id'].$get({ param: { id: jobId } }).then(json<{ job: Job; agent_output: { agent_name: string; output: string } | null }>),
  runNextJob: () => mutate<{ ok: boolean }>(rpc.queue['run-next'].$url(), 'POST'),
  requeueAllFailed: () => mutate<{ ok: boolean }>(rpc.queue['requeue-all-failed'].$url(), 'POST'),
  requeueJob: (jobId: string) => mutate<{ ok: boolean }>(rpc.queue.jobs[':id'].requeue.$url({ param: { id: jobId } }), 'POST'),
  cancelQueueJob: (jobId: string) => mutate<{ ok: boolean }>(rpc.queue.jobs[':id'].$url({ param: { id: jobId } }), 'DELETE'),

  // ── V2 agents wired into nexus-api (Phase 9-10) ──────────────────────
  // Autonome — goal-driven autonomous loop
  getAutonomeGoals: () =>
    rpc.autonome.goals.$get().then(json<{ source: 'live' | 'unconfigured'; goals: Array<{
      id: string; title: string; metric: string; target: number;
      period: string; tags?: string[]; enabled?: number | boolean;
    }>; note?: string }>),
  // BUG-P1-5: the runs route returns `{id, generated_at, result: AutonomeRunResult}`,
  // not the old `{goal_id, started_at, status, ...}` shape. The page-level Run type
  // mirrors this; keep the api layer aligned so TS guards both ends.
  getAutonomeRuns: () =>
    rpc.autonome.runs.$get().then(json<{
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
    }>),
  runAutonomeTick: () =>
    mutate<{ ok: boolean; runs?: number; error?: string }>(rpc.autonome.run.$url(), 'POST'),

  // Budget — caps & usage rollups
  getBudgetCaps: () =>
    rpc.budget.caps.$get().then(json<{ source: 'live' | 'unconfigured'; caps: Array<{
      id?: string; scope: 'global' | 'task_type' | 'model'; match?: string;
      period: 'day' | 'week' | 'month'; limit_usd: number; warn_at?: number;
      enabled?: number | boolean;
    }>; note?: string }>),
  getBudgetSummary: (period: 'day' | 'week' | 'month' = 'week') =>
    rpcGet<{ source: 'live' | 'unconfigured'; period: string;
      total_usd: number; total_runs: number;
      by_model: Array<{ model: string; count: number; cost: number }>;
      by_task: Array<{ task_type: string; count: number; cost: number }>;
      note?: string;
    }>((() => { const url = rpc.budget.summary.$url(); url.searchParams.set('period', period); return url })()),

  // Analytics — multi-platform post performance
  getAnalyticsSummary: () =>
    rpc.analytics.summary.$get().then(json<{ source: 'live' | 'unconfigured';
      totals: { posts: number; impressions: number; engagements: number; clicks: number };
      by_platform: Array<{ platform: string; posts: number; impressions: number; engagements: number; clicks: number }>;
      note?: string;
    }>),

  // Publisher queue — scheduled cross-platform posts
  getPublisherQueueSummary: () =>
    rpc.publisherQueue.summary.$get().then(json<{ source: 'live' | 'unconfigured';
      pending: number; in_progress: number; succeeded: number; failed: number;
      next_run_at?: string; note?: string;
    }>),
  getPublisherQueueJobs: (status?: string) => {
    const url = rpc.publisherQueue.jobs.$url()
    if (status) url.searchParams.set('status', status)
    return rpcGet<{ source: 'live' | 'unconfigured'; jobs: Array<{
      id: string; platform: string; status: string; scheduled_for?: string;
      attempts?: number; last_error?: string; payload_kind?: string;
    }>; note?: string }>(url)
  },

  // Insights — MindsDB-backed predictions (query by saved query id)
  getInsight: (queryId: string) =>
    rpc.insights[':queryId'].$get({ param: { queryId: encodeURIComponent(queryId) } }).then(json<{ source: 'live' | 'unconfigured'; query_id: string;
      rows?: unknown[]; note?: string;
    }>),

  // ── Leads (intent-mining scanner, TASK-801) ──────────────────
  getLeads: (params?: {
    status?: string; source?: string; intent?: string;
    min_score?: number; limit?: number;
  }) => {
    const q = new URLSearchParams()
    if (params?.status) q.set('status', params.status)
    if (params?.source) q.set('source', params.source)
    if (params?.intent) q.set('intent', params.intent)
    if (typeof params?.min_score === 'number') q.set('min_score', String(params.min_score))
    if (typeof params?.limit === 'number') q.set('limit', String(params.limit))
    const url = rpc.leads.index.$url()
    url.search = q.toString()
    return rpcGet<{
      leads: Array<{
        fingerprint: string; source: string; source_id: string;
        author: string; author_bio: string | null;
        text: string; url: string; posted_at: string;
        matched_terms: string[]; extra: Record<string, unknown> | null;
        score_total: number; score_intent: string;
        score_components: Record<string, number>;
        suggested_reply: string | null;
        status: string;
        engaged_at: string | null; dismissed_at: string | null;
        operator_note: string | null; created_at: string;
      }>;
      total: number;
    }>(url)
  },
  getLeadStats: () =>
    rpc.leads.stats.$get().then(json<{
      byStatus: Array<{ status: string; n: number }>;
      byIntent: Array<{ intent: string; n: number }>;
      bySource: Array<{ source: string; n: number }>;
      top_score: number;
    }>),
  scanLeads: (body: { terms: string[]; subreddits?: string[]; sources?: Array<'reddit' | 'hn'>; limit?: number }) =>
    mutate<{
      ok: boolean; scanned: number; inserted: number; skipped: number;
      filtered: number; errors: string[]; sources: Record<string, number>;
    }>(rpc.leads.scan.$url(), 'POST', body),
  engageLead: (fp: string, note?: string) =>
    mutate<{ ok: boolean }>(rpc.leads[':fingerprint'].engage.$url({ param: { fingerprint: fp } }), 'POST', { note: note ?? null }),
  dismissLead: (fp: string, note?: string) =>
    mutate<{ ok: boolean }>(rpc.leads[':fingerprint'].dismiss.$url({ param: { fingerprint: fp } }), 'POST', { note: note ?? null }),
  deleteLead: (fp: string) =>
    mutate<{ ok: boolean }>(rpc.leads[':fingerprint'].$url({ param: { fingerprint: fp } }), 'DELETE'),
}
