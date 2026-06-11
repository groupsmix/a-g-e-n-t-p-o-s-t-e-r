// ── RPC type surface (audit #13) ─────────────────────────────────────────
// Type-only exports consumed by the dashboard via hono/client:
//   import { hc } from 'hono/client'
//   hc<DomainsApi>(`${API_BASE}/api/domains`)
//
// One alias per mount in src/index.ts. Generated from the mount table;
// keep in sync when adding a route group.

import type { authRoutes } from './routes/auth'
import type { workflowRoutes } from './routes/workflow'
import type { productRoutes } from './routes/products'
import type { reviewRoutes } from './routes/review'
import type { publishRoutes } from './routes/publish'
import type { domainRoutes } from './routes/domains'
import type { platformRoutes } from './routes/platforms'
import type { socialRoutes } from './routes/social'
import type { promptRoutes } from './routes/prompts'
import type { aiModelRoutes } from './routes/ai-models'
import type { assetRoutes } from './routes/assets'
import type { trendRoutes } from './routes/trends'
import type { winnerRoutes } from './routes/winners'
import type { graveyardRoutes } from './routes/graveyard'
import type { historyRoutes } from './routes/history'
import type { settingsRoutes } from './routes/settings'
import type { keyRoutes } from './routes/keys'
import type { managerRoutes } from './routes/manager'
import type { agentRoutes } from './routes/agent'
import type { teamRoutes } from './routes/team'
import type { scheduleRoutes } from './routes/schedules'
import type { autopilotRoutes } from './routes/autopilot'
import type { marketingRoutes } from './routes/marketing'
import type { browserRoutes } from './routes/browser'
import type { digestRoutes } from './routes/digest'
import type { learningRoutes } from './routes/learning'
import type { gumroadRoutes } from './routes/gumroad'
import type { scoringRoutes } from './routes/scoring'
import type { podRoutes } from './routes/pod'
import type { browserActionRoutes } from './routes/browser-actions'
import type { browserAgentRoutes } from './routes/browser-agent'
import type { hyperbeamRoutes } from './routes/hyperbeam'
import type { abTestingRoutes } from './routes/ab-testing'
import type { blogRoutes } from './routes/blog'
import type { emailRoutes } from './routes/email'
import type { leadRoutes } from './routes/leads'
import type { competitorRoutes } from './routes/competitors'
import type { observabilityRoutes } from './routes/observability'
import type { freelanceRoutes } from './routes/freelance'
import type { opportunityRoutes } from './routes/opportunities'
import type { pipelineRoutes } from './routes/pipeline'
import type { statsRoutes } from './routes/stats'
import type { queueRoutes } from './routes/queue'
import type { portfolioRoutes } from './routes/portfolio'
import type { ventureRoutes } from './routes/ventures'
import type { offerRoutes } from './routes/offers'
import type { trackedLinkRoutes } from './routes/tracked-links'
import type { eventRoutes } from './routes/events'
import type { signalRoutes } from './routes/signals'
import type { tasksRoutes } from './routes/tasks'
import type { agentsRoutes } from './routes/agents'
import type { brainRoutes } from './routes/brain'
import type { metricsRoutes } from './routes/metrics'
import type { publisherQueueRoutes } from './routes/publisher-queue'
import type { analyticsRoutes } from './routes/analytics'
import type { autonomeRoutes } from './routes/autonome'
import type { revenueRoutes } from './routes/revenue'
import type { budgetRoutes } from './routes/budget'
import type { insightsRoutes } from './routes/insights'
import type { moneyMachineRoutes } from './routes/money-machine'

/** Mounted at /api/auth */
export type AuthApi = typeof authRoutes

/** Mounted at /api/workflow */
export type WorkflowApi = typeof workflowRoutes

/** Mounted at /api/products */
export type ProductsApi = typeof productRoutes

/** Mounted at /api/review */
export type ReviewApi = typeof reviewRoutes

/** Mounted at /api/publish */
export type PublishApi = typeof publishRoutes

/** Mounted at /api/domains */
export type DomainsApi = typeof domainRoutes

/** Mounted at /api/categories */
export type CategoriesApi = typeof domainRoutes

/** Mounted at /api/platforms */
export type PlatformsApi = typeof platformRoutes

/** Mounted at /api/social */
export type SocialApi = typeof socialRoutes

/** Mounted at /api/prompts */
export type PromptsApi = typeof promptRoutes

/** Mounted at /api/ai-models */
export type AiModelsApi = typeof aiModelRoutes

/** Mounted at /api/assets */
export type AssetsApi = typeof assetRoutes

/** Mounted at /api/trends */
export type TrendsApi = typeof trendRoutes

/** Mounted at /api/winners */
export type WinnersApi = typeof winnerRoutes

/** Mounted at /api/graveyard */
export type GraveyardApi = typeof graveyardRoutes

/** Mounted at /api/history */
export type HistoryApi = typeof historyRoutes

/** Mounted at /api/settings */
export type SettingsApi = typeof settingsRoutes

/** Mounted at /api/keys */
export type KeysApi = typeof keyRoutes

/** Mounted at /api/manager */
export type ManagerApi = typeof managerRoutes

/** Mounted at /api/agent */
export type AgentApi = typeof agentRoutes

/** Mounted at /api/team */
export type TeamApi = typeof teamRoutes

/** Mounted at /api/schedules */
export type SchedulesApi = typeof scheduleRoutes

/** Mounted at /api/autopilot */
export type AutopilotApi = typeof autopilotRoutes

/** Mounted at /api/marketing */
export type MarketingApi = typeof marketingRoutes

/** Mounted at /api/browser */
export type BrowserApi = typeof browserRoutes

/** Mounted at /api/digest */
export type DigestApi = typeof digestRoutes

/** Mounted at /api/learning */
export type LearningApi = typeof learningRoutes

/** Mounted at /api/gumroad */
export type GumroadApi = typeof gumroadRoutes

/** Mounted at /api/niches */
export type NichesApi = typeof scoringRoutes

/** Mounted at /api/scoring */
export type ScoringApi = typeof scoringRoutes

/** Mounted at /api/pod */
export type PodApi = typeof podRoutes

/** Mounted at /api/browser-actions */
export type BrowserActionsApi = typeof browserActionRoutes

/** Mounted at /api/browser-agent */
export type BrowserAgentApi = typeof browserAgentRoutes

/** Mounted at /api/hyperbeam */
export type HyperbeamApi = typeof hyperbeamRoutes

/** Mounted at /api/ab-tests */
export type AbTestsApi = typeof abTestingRoutes

/** Mounted at /api/blog */
export type BlogApi = typeof blogRoutes

/** Mounted at /api/email */
export type EmailApi = typeof emailRoutes

/** Mounted at /api/leads */
export type LeadsApi = typeof leadRoutes

/** Mounted at /api/competitors */
export type CompetitorsApi = typeof competitorRoutes

/** Mounted at /api/observability */
export type ObservabilityApi = typeof observabilityRoutes

/** Mounted at /api/freelance */
export type FreelanceApi = typeof freelanceRoutes

/** Mounted at /api/opportunities */
export type OpportunitiesApi = typeof opportunityRoutes

/** Mounted at /api/pipeline */
export type PipelineApi = typeof pipelineRoutes

/** Mounted at /api/stats */
export type StatsApi = typeof statsRoutes

/** Mounted at /api/queue */
export type QueueApi = typeof queueRoutes

/** Mounted at /api/portfolio */
export type PortfolioApi = typeof portfolioRoutes

/** Mounted at /api/ventures */
export type VenturesApi = typeof ventureRoutes

/** Mounted at /api/offers */
export type OffersApi = typeof offerRoutes

/** Mounted at /api/tracked-links */
export type TrackedLinksApi = typeof trackedLinkRoutes

/** Mounted at /api/events */
export type EventsApi = typeof eventRoutes

/** Mounted at /api/signals */
export type SignalsApi = typeof signalRoutes

/** Mounted at /api/tasks */
export type TasksApi = typeof tasksRoutes

/** Mounted at /api/agents */
export type AgentsApi = typeof agentsRoutes

/** Mounted at /api/brain */
export type BrainApi = typeof brainRoutes

/** Mounted at /api/metrics */
export type MetricsApi = typeof metricsRoutes

/** Mounted at /api/publisher-queue */
export type PublisherQueueApi = typeof publisherQueueRoutes

/** Mounted at /api/analytics */
export type AnalyticsApi = typeof analyticsRoutes

/** Mounted at /api/autonome */
export type AutonomeApi = typeof autonomeRoutes

/** Mounted at /api/revenue */
export type RevenueApi = typeof revenueRoutes

/** Mounted at /api/budget */
export type BudgetApi = typeof budgetRoutes

/** Mounted at /api/insights */
export type InsightsApi = typeof insightsRoutes

/** Mounted at /api/money-machine */
export type MoneyMachineApi = typeof moneyMachineRoutes
