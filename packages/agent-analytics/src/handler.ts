/**
 * Handler — exposes the analytics agent to the orchestrator.
 *
 * Piggy-backs the 'analyse' AgentTaskType using payload.kind =
 * 'platform-analytics' as discriminator (same pattern as the trend
 * finder + content planner).
 *
 * Inputs (payload):
 *   { kind: 'platform-analytics',
 *     posts?: PublishedPostRef[],        // explicit list, optional
 *     adapters?: Partial<Record<Platform, AnalyticsAdapter>>,
 *     store?: SnapshotStore,
 *     windowDays?: number,
 *     buildReport?: boolean }            // default true
 *
 * When posts/store/adapters are omitted, the caller wires them via
 * the runtime config (D1 + creds) at the worker boundary. This
 * handler is exposed as a pure function so it can run in tests, in
 * a Worker scheduled() event, or via an HTTP route.
 */

import { collectAnalytics, type CollectResult } from './pipeline/collector'
import { buildReport } from './pipeline/analyser'
import { InMemorySnapshotStore } from './pipeline/storage'
import type {
  AnalyticsAdapter,
  AnalyticsReport,
  Platform,
  PublishedPostRef,
  SnapshotStore,
} from './types'

export interface AnalyticsHandlerInput {
  posts: PublishedPostRef[]
  adapters: Partial<Record<Platform, AnalyticsAdapter>>
  store?: SnapshotStore
  windowDays?: number
  buildReport?: boolean
  now?: () => Date
}

export interface AnalyticsHandlerResult {
  collection: CollectResult
  report: AnalyticsReport | null
}

export async function runPlatformAnalytics(
  input: AnalyticsHandlerInput,
): Promise<AnalyticsHandlerResult> {
  const store = input.store ?? new InMemorySnapshotStore()
  const collection = await collectAnalytics({
    adapters: input.adapters,
    store,
    posts: input.posts,
    now: input.now,
  })
  const report = input.buildReport === false
    ? null
    : await buildReport(store, { windowDays: input.windowDays ?? 7, now: input.now })
  return { collection, report }
}
