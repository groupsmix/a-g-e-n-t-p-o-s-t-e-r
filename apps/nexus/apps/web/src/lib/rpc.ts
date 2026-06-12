// ── Typed RPC core (audit #13) ──────────────────────────────────────────────
// hono/client clients for every /api group, typed straight off the Worker's
// route definitions (see nexus-api/src/client.ts). Paths, methods and path
// params are compile-checked: a renamed route breaks `pnpm typecheck` in this
// app instead of silently 404ing in production.
//
// Response shapes still come from the shared wire contract
// (@posteragent/types/nexus/api-contract) via the `json<T>` helper below,
// because the Worker's handlers are not yet typed at the D1 boundary. As
// handler returns get typed (domains shows the pattern), `json<T>` calls can
// be dropped group by group and inference takes over end-to-end.
//
// Request bodies: no route declares a validator yet, so hc cannot carry
// typed `json` payloads. Mutations therefore build their compile-checked URL
// with `$url()` and send the body through `mutate()` — same wire behaviour
// as the old apiFetch, minus the hand-typed URL strings.
import { hc } from 'hono/client'
import type {
  AuthApi,
  WorkflowApi,
  ProductsApi,
  ReviewApi,
  PublishApi,
  DomainsApi,
  CategoriesApi,
  PlatformsApi,
  SocialApi,
  PromptsApi,
  AiModelsApi,
  AssetsApi,
  TrendsApi,
  WinnersApi,
  GraveyardApi,
  HistoryApi,
  SettingsApi,
  KeysApi,
  ManagerApi,
  AgentApi,
  TeamApi,
  SchedulesApi,
  AutopilotApi,
  MarketingApi,
  BrowserApi,
  DigestApi,
  LearningApi,
  GumroadApi,
  NichesApi,
  ScoringApi,
  PodApi,
  BrowserActionsApi,
  BrowserAgentApi,
  HyperbeamApi,
  AbTestsApi,
  BlogApi,
  EmailApi,
  LeadsApi,
  CompetitorsApi,
  ObservabilityApi,
  FreelanceApi,
  OpportunitiesApi,
  PipelineApi,
  StatsApi,
  QueueApi,
  PortfolioApi,
  VenturesApi,
  OffersApi,
  TrackedLinksApi,
  EventsApi,
  SignalsApi,
  TasksApi,
  AgentsApi,
  BrainApi,
  MetricsApi,
  PublisherQueueApi,
  AnalyticsApi,
  AutonomeApi,
  RevenueApi,
  BudgetApi,
  InsightsApi,
  MoneyMachineApi,
  AnnouncementsApi,
  FlagsApi,
} from '@nexus/nexus-api/client'

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

/**
 * The single fetch used by every RPC client. Reproduces the old apiFetch
 * semantics exactly: bearer token injection, 401 → drop token + fire
 * 'nexus-auth-required', non-2xx → throw with the server's message.
 */
const rpcFetch: typeof fetch = async (input, init) => {
  const token = getToken()
  const headers = new Headers(init?.headers)
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const res = await fetch(input, { ...init, headers })
  if (res.status === 401) {
    setToken(null)
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('nexus-auth-required'))
    throw new Error('Unauthorized')
  }
  if (!res.ok) {
    const error = (await res.clone().json().catch(() => ({ message: res.statusText }))) as {
      message?: string
      error?: string
    }
    throw new Error(error.message || error.error || `API error: ${res.status}`)
  }
  return res
}

/**
 * Unwrap a 2xx RPC response as the wire-contract type. rpcFetch has already
 * thrown for every non-2xx, so the error branches of the union never reach
 * this point. Delete per call site once the matching handler is typed.
 */
export const json = <T>(res: { json(): Promise<unknown> }): Promise<T> =>
  res.json() as Promise<T>

/** GET a compile-checked `$url()` — for query strings not yet validator-declared. */
export async function rpcGet<T>(url: URL | string): Promise<T> {
  const res = await rpcFetch(String(url))
  return (await res.json()) as T
}

/** Send a mutation to a compile-checked `$url()` with the old apiFetch wire shape. */
export async function mutate<T>(
  url: URL | string,
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  body?: unknown,
): Promise<T> {
  const res = await rpcFetch(String(url), {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  return (await res.json().catch(() => undefined)) as T
}

const opts = { fetch: rpcFetch }
const at = (path: string) => `${API_BASE}${path}`

// One client per /api mount (names mirror nexus-api/src/client.ts).
export const rpc = {
  auth: hc<AuthApi>(at("/api/auth"), opts),
  workflow: hc<WorkflowApi>(at("/api/workflow"), opts),
  products: hc<ProductsApi>(at("/api/products"), opts),
  review: hc<ReviewApi>(at("/api/review"), opts),
  publish: hc<PublishApi>(at("/api/publish"), opts),
  domains: hc<DomainsApi>(at("/api/domains"), opts),
  categories: hc<CategoriesApi>(at("/api/categories"), opts),
  platforms: hc<PlatformsApi>(at("/api/platforms"), opts),
  social: hc<SocialApi>(at("/api/social"), opts),
  prompts: hc<PromptsApi>(at("/api/prompts"), opts),
  aiModels: hc<AiModelsApi>(at("/api/ai-models"), opts),
  assets: hc<AssetsApi>(at("/api/assets"), opts),
  trends: hc<TrendsApi>(at("/api/trends"), opts),
  winners: hc<WinnersApi>(at("/api/winners"), opts),
  graveyard: hc<GraveyardApi>(at("/api/graveyard"), opts),
  history: hc<HistoryApi>(at("/api/history"), opts),
  settings: hc<SettingsApi>(at("/api/settings"), opts),
  keys: hc<KeysApi>(at("/api/keys"), opts),
  manager: hc<ManagerApi>(at("/api/manager"), opts),
  agent: hc<AgentApi>(at("/api/agent"), opts),
  team: hc<TeamApi>(at("/api/team"), opts),
  schedules: hc<SchedulesApi>(at("/api/schedules"), opts),
  autopilot: hc<AutopilotApi>(at("/api/autopilot"), opts),
  marketing: hc<MarketingApi>(at("/api/marketing"), opts),
  browser: hc<BrowserApi>(at("/api/browser"), opts),
  digest: hc<DigestApi>(at("/api/digest"), opts),
  learning: hc<LearningApi>(at("/api/learning"), opts),
  gumroad: hc<GumroadApi>(at("/api/gumroad"), opts),
  niches: hc<NichesApi>(at("/api/niches"), opts),
  scoring: hc<ScoringApi>(at("/api/scoring"), opts),
  pod: hc<PodApi>(at("/api/pod"), opts),
  browserActions: hc<BrowserActionsApi>(at("/api/browser-actions"), opts),
  browserAgent: hc<BrowserAgentApi>(at("/api/browser-agent"), opts),
  hyperbeam: hc<HyperbeamApi>(at("/api/hyperbeam"), opts),
  abTests: hc<AbTestsApi>(at("/api/ab-tests"), opts),
  blog: hc<BlogApi>(at("/api/blog"), opts),
  email: hc<EmailApi>(at("/api/email"), opts),
  leads: hc<LeadsApi>(at("/api/leads"), opts),
  competitors: hc<CompetitorsApi>(at("/api/competitors"), opts),
  observability: hc<ObservabilityApi>(at("/api/observability"), opts),
  freelance: hc<FreelanceApi>(at("/api/freelance"), opts),
  opportunities: hc<OpportunitiesApi>(at("/api/opportunities"), opts),
  pipeline: hc<PipelineApi>(at("/api/pipeline"), opts),
  stats: hc<StatsApi>(at("/api/stats"), opts),
  queue: hc<QueueApi>(at("/api/queue"), opts),
  portfolio: hc<PortfolioApi>(at("/api/portfolio"), opts),
  ventures: hc<VenturesApi>(at("/api/ventures"), opts),
  offers: hc<OffersApi>(at("/api/offers"), opts),
  trackedLinks: hc<TrackedLinksApi>(at("/api/tracked-links"), opts),
  events: hc<EventsApi>(at("/api/events"), opts),
  signals: hc<SignalsApi>(at("/api/signals"), opts),
  tasks: hc<TasksApi>(at("/api/tasks"), opts),
  agents: hc<AgentsApi>(at("/api/agents"), opts),
  brain: hc<BrainApi>(at("/api/brain"), opts),
  metrics: hc<MetricsApi>(at("/api/metrics"), opts),
  publisherQueue: hc<PublisherQueueApi>(at("/api/publisher-queue"), opts),
  analytics: hc<AnalyticsApi>(at("/api/analytics"), opts),
  autonome: hc<AutonomeApi>(at("/api/autonome"), opts),
  revenue: hc<RevenueApi>(at("/api/revenue"), opts),
  budget: hc<BudgetApi>(at("/api/budget"), opts),
  insights: hc<InsightsApi>(at("/api/insights"), opts),
  moneyMachine: hc<MoneyMachineApi>(at("/api/money-machine"), opts),
  announcements: hc<AnnouncementsApi>(at("/api/announcements"), opts),
  flags: hc<FlagsApi>(at("/api/flags"), opts),
}
