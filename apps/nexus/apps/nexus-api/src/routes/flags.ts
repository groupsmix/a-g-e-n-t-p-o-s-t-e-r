import { Hono } from 'hono'
import type { FeatureFlags, FlagKey, FlagValue } from '@posteragent/types/nexus'
import type { Env } from '../env'

const FLAGS_KEY = 'feature_flags'

export const FLAG_DEFAULTS: FeatureFlags = {
  daily_run_enabled: true,
  site_generation_enabled: true,
  video_generation_enabled: true,
  poster_generation_enabled: true,
  voiceover_enabled: true,
  dry_run_mode: false,
  auto_publish_tiktok: true,
  auto_publish_instagram_reels: true,
  auto_publish_instagram_feed: true,
  auto_publish_youtube_shorts: true,
  auto_publish_twitter: true,
  auto_publish_pinterest: false,
  auto_publish_linkedin: false,
  auto_publish_threads: false,
  max_posts_per_day: 20,
  max_videos_per_day: 5,
  max_sites_per_week: 2,
  max_blog_posts_per_day: 10,
}

function parseStoredFlags(raw: string | null): Partial<FeatureFlags> {
  if (!raw) return {}
  try {
    return JSON.parse(raw) as Partial<FeatureFlags>
  } catch {
    return {}
  }
}

function mergeFlags(stored: Partial<FeatureFlags>): FeatureFlags {
  return { ...FLAG_DEFAULTS, ...stored }
}

function hasExpectedType(key: FlagKey, value: unknown): value is FlagValue {
  return typeof value === typeof FLAG_DEFAULTS[key]
}

export const flagRoutes = new Hono<{ Bindings: Env }>()
  .get('/', async (c) => {
    const stored = parseStoredFlags(await c.env.CONFIG.get(FLAGS_KEY))
    return c.json({ flags: mergeFlags(stored) })
  })
  .get('/:key', async (c) => {
    const key = c.req.param('key') as FlagKey
    if (!(key in FLAG_DEFAULTS)) return c.json({ error: 'Unknown flag' }, 404)

    const stored = parseStoredFlags(await c.env.CONFIG.get(FLAGS_KEY))
    const flags = mergeFlags(stored)
    return c.json({ key, value: flags[key] })
  })
  .patch('/:key', async (c) => {
    const key = c.req.param('key') as FlagKey
    if (!(key in FLAG_DEFAULTS)) return c.json({ error: 'Unknown flag' }, 400)

    const body = await c.req.json<{ value?: unknown }>()
    if (body.value === undefined) return c.json({ error: 'value is required' }, 400)
    if (!hasExpectedType(key, body.value)) {
      return c.json({ error: `Invalid value type for ${key}` }, 400)
    }

    const stored = parseStoredFlags(await c.env.CONFIG.get(FLAGS_KEY))
    ;(stored as Record<FlagKey, FlagValue | undefined>)[key] = body.value
    await c.env.CONFIG.put(FLAGS_KEY, JSON.stringify(stored))

    return c.json({ key, value: stored[key], updated: true })
  })
  .post('/reset', async (c) => {
    await c.env.CONFIG.delete(FLAGS_KEY)
    return c.json({ reset: true, defaults: FLAG_DEFAULTS })
  })
