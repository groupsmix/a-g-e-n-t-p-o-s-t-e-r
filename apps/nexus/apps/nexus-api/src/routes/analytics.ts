/**
 * /api/analytics — surfaces platform_analytics rows for the dashboard
 * and exposes a manual "run collector now" endpoint that the cron
 * trigger also calls.
 *
 *   GET  /summary         → AnalyticsReport over the last 7 days
 *   GET  /posts/:platform → recent snapshots for one platform
 *   POST /collect         → kick the collector manually
 *
 * Backed by @posteragent/agent-analytics (TASK-702) against the
 * shared D1 database (migration 026).
 */

import { Hono } from 'hono'
import type { Env } from '../env'
import {
  D1SnapshotStore,
  buildReport,
  loadPublishedPostsFromD1,
  collectAnalytics,
  XAnalyticsAdapter,
  LinkedInAnalyticsAdapter,
  InstagramAnalyticsAdapter,
  YouTubeAnalyticsAdapter,
  NoopAnalyticsAdapter,
  type AnalyticsAdapter,
  type Platform,
} from '@posteragent/agent-analytics'
import { getSecret } from '../services/publishers'

export const analyticsRoutes = new Hono<{ Bindings: Env }>()

export async function buildAdapters(env: Env): Promise<Partial<Record<Platform, AnalyticsAdapter>>> {
  const adapters: Partial<Record<Platform, AnalyticsAdapter>> = {}
  const xBearer = await getSecret(env, 'X_BEARER_TOKEN')
  if (xBearer) adapters.x = new XAnalyticsAdapter(xBearer)
  const liToken = await getSecret(env, 'LINKEDIN_ACCESS_TOKEN')
  if (liToken) adapters.linkedin = new LinkedInAnalyticsAdapter(liToken)
  const igToken = await getSecret(env, 'INSTAGRAM_GRAPH_TOKEN')
  if (igToken) adapters.instagram = new InstagramAnalyticsAdapter(igToken)
  const ytKey = await getSecret(env, 'YOUTUBE_API_KEY')
  if (ytKey) adapters.youtube = new YouTubeAnalyticsAdapter(ytKey)
  // Platforms without public analytics APIs: record a zero-snapshot so the
  // dashboard still lists the post (rather than dropping it silently).
  adapters.tiktok ??= new NoopAnalyticsAdapter('tiktok')
  adapters.newsletter ??= new NoopAnalyticsAdapter('newsletter')
  adapters.blog ??= new NoopAnalyticsAdapter('blog')
  return adapters
}

analyticsRoutes.get('/summary', async (c) => {
  try {
    const store = new D1SnapshotStore(c.env.DB)
    const days = Math.min(Math.max(parseInt(c.req.query('days') ?? '7', 10) || 7, 1), 90)
    const report = await buildReport(store, { windowDays: days })
    return c.json({ source: 'live' as const, report })
  } catch (err) {
    return c.json({
      source: 'unconfigured' as const,
      report: null,
      note: err instanceof Error ? err.message : String(err),
    })
  }
})

analyticsRoutes.get('/posts/:platform', async (c) => {
  const platform = c.req.param('platform') as Platform
  const days = Math.min(Math.max(parseInt(c.req.query('days') ?? '7', 10) || 7, 1), 90)
  try {
    const store = new D1SnapshotStore(c.env.DB)
    const sinceIso = new Date(Date.now() - days * 86_400_000).toISOString()
    const snaps = await store.rangeByPlatform(platform, sinceIso)
    return c.json({ platform, days, snapshots: snaps })
  } catch (err) {
    return c.json({ platform, days, snapshots: [], note: err instanceof Error ? err.message : String(err) })
  }
})

analyticsRoutes.post('/collect', async (c) => {
  try {
    const store = new D1SnapshotStore(c.env.DB)
    const posts = await loadPublishedPostsFromD1(c.env.DB, { windowDays: 30 })
    const adapters = await buildAdapters(c.env)
    const r = await collectAnalytics({ adapters, store, posts })
    return c.json({
      ok: true,
      attempted: r.attempted,
      succeeded: r.succeeded,
      failed: r.failed,
      unrouted: r.unrouted,
      errors: r.errors.slice(0, 25),
    })
  } catch (err) {
    return c.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500)
  }
})
