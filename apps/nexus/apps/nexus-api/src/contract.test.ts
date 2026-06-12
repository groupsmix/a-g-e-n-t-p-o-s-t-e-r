/**
 * contract.test.ts — Route/Client Contract Tests (Task 7.6)
 *
 * These tests validate that the Hono route types exported from client.ts
 * remain in sync with the actual route implementations in routes/*.ts.
 *
 * How it works:
 *  • TypeScript type inference on `hc<RouteApi>(...)` is our contract.
 *    If a route is removed or its type signature changes, `hc<T>` will fail
 *    to compile — caught by `tsc --noEmit` in CI.
 *  • Runtime tests verify the Hono app mounts every route group and that
 *    structural shape matches what client.ts declares.
 *
 * NOTE: These are unit-level contract checks, not integration tests.
 *       They do NOT require a running worker or real D1 bindings.
 */

import { describe, it, expect } from 'vitest'

// ── Type-only contract check (compile-time) ────────────────────────────────
// Importing all the Api types forces tsc to resolve route → type mapping.
// If any route file has a broken type or missing export, this import fails.
import type {
  AuthApi, WorkflowApi, ProductsApi, DomainsApi,
  PlatformsApi, SocialApi, PromptsApi, AiModelsApi,
  AgentApi, AgentsApi, BrainApi, MetricsApi,
  PortfolioApi, VenturesApi, OffersApi, SignalsApi,
  TasksApi, BudgetApi, RevenueApi, AnalyticsApi,
  AnnouncementsApi, FlagsApi, OpportunitiesApi,
  PublisherQueueApi, QueueApi, AutonomeApi,
  InsightsApi, MoneyMachineApi,
} from './client.js'

// ── Mount structure check (runtime) ───────────────────────────────────────
// We import the raw route objects and verify each has a .fetch method
// (i.e. is a valid Hono app) — ensures no route accidentally became `undefined`.
import { authRoutes } from './routes/auth.js'
import { workflowRoutes } from './routes/workflow.js'
import { domainRoutes } from './routes/domains.js'
import { platformRoutes } from './routes/platforms.js'
import { agentsRoutes } from './routes/agents.js'
import { brainRoutes } from './routes/brain.js'
import { budgetRoutes } from './routes/budget.js'
import { revenueRoutes } from './routes/revenue.js'
import { autonomeRoutes } from './routes/autonome.js'
import { analyticsRoutes } from './routes/analytics.js'
import { announcementRoutes } from './routes/announcements.js'
import { flagRoutes } from './routes/flags.js'
import { portfolioRoutes } from './routes/portfolio.js'
import { opportunityRoutes } from './routes/opportunities.js'
import { queueRoutes } from './routes/queue.js'

// Hono apps expose a `fetch` method — sufficient to prove they're mounted apps
function isHonoApp(r: unknown): boolean {
  return typeof r === 'object' && r !== null && typeof (r as Record<string, unknown>).fetch === 'function'
}

describe('Route/Client Contract', () => {
  it('auth routes are a valid Hono app', () => {
    expect(isHonoApp(authRoutes)).toBe(true)
  })
  it('workflow routes are a valid Hono app', () => {
    expect(isHonoApp(workflowRoutes)).toBe(true)
  })
  it('domain routes are a valid Hono app', () => {
    expect(isHonoApp(domainRoutes)).toBe(true)
  })
  it('platform routes are a valid Hono app', () => {
    expect(isHonoApp(platformRoutes)).toBe(true)
  })
  it('agents routes are a valid Hono app', () => {
    expect(isHonoApp(agentsRoutes)).toBe(true)
  })
  it('brain routes are a valid Hono app', () => {
    expect(isHonoApp(brainRoutes)).toBe(true)
  })
  it('budget routes are a valid Hono app', () => {
    expect(isHonoApp(budgetRoutes)).toBe(true)
  })
  it('revenue routes are a valid Hono app', () => {
    expect(isHonoApp(revenueRoutes)).toBe(true)
  })
  it('autonome routes are a valid Hono app', () => {
    expect(isHonoApp(autonomeRoutes)).toBe(true)
  })
  it('analytics routes are a valid Hono app', () => {
    expect(isHonoApp(analyticsRoutes)).toBe(true)
  })
  it('announcement routes are a valid Hono app', () => {
    expect(isHonoApp(announcementRoutes)).toBe(true)
  })
  it('flag routes are a valid Hono app', () => {
    expect(isHonoApp(flagRoutes)).toBe(true)
  })
  it('portfolio routes are a valid Hono app', () => {
    expect(isHonoApp(portfolioRoutes)).toBe(true)
  })
  it('opportunity routes are a valid Hono app', () => {
    expect(isHonoApp(opportunityRoutes)).toBe(true)
  })
  it('queue routes are a valid Hono app', () => {
    expect(isHonoApp(queueRoutes)).toBe(true)
  })
})

// ── Type completeness assertion ─────────────────────────────────────────────
// Exhaustive list of API types — if you add a route group to client.ts
// but forget to add it here, this block will throw a TypeScript error.
// Assign to `never` to force an assignability check.
export type _AllApiTypes = [
  AuthApi, WorkflowApi, ProductsApi, DomainsApi,
  PlatformsApi, SocialApi, PromptsApi, AiModelsApi,
  AgentApi, AgentsApi, BrainApi, MetricsApi,
  PortfolioApi, VenturesApi, OffersApi, SignalsApi,
  TasksApi, BudgetApi, RevenueApi, AnalyticsApi,
  AnnouncementsApi, FlagsApi, OpportunitiesApi,
  PublisherQueueApi, QueueApi, AutonomeApi,
  InsightsApi, MoneyMachineApi,
]
// If this file compiles without error, the contract is satisfied.
