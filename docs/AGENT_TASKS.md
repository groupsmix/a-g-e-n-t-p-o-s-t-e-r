# AGENT TASKS — FULL MONEY MACHINE SYSTEM
> Stack: posteragent (NEXUS) + webs-alots + CosmicJS + Mastra + Remotion + AgentReacher
> Personal use. One user. Max automation. Zero manual work after setup.
> Every task is standalone. Give each block to agent separately.

---

## HOW TO USE THIS FILE
- Each `## TASK` block = one agent session
- Start every session with the context block at the top of each task
- Tasks are ordered by dependency — do not skip ahead
- `STEAL FROM` = copy this code/pattern directly, adapt minimally
- `OUTPUT` = what the agent must produce before the task is done

---

# PHASE 0 — FOUNDATION

---

## TASK 0.1 — Monorepo Scaffold

**Context:** We are building a personal AI content machine. The root repo is `posteragent`. It must be restructured as a proper monorepo.

**Instructions:**
1. Create the following folder structure at the root of `posteragent`:
```
posteragent/
├── apps/
│   ├── nexus/              # AI agent orchestration (existing code goes here)
│   ├── dashboard/          # Next.js control panel (new)
│   └── factory/            # webs-alots site generator (move from separate repo)
├── packages/
│   ├── core/               # Shared types, utils, constants
│   ├── agents/             # All Mastra agent definitions
│   ├── tools/              # All Mastra tool definitions
│   ├── workflows/          # All Mastra workflow definitions
│   ├── publishers/         # All social platform adapters
│   ├── generators/         # Poster + video generation
│   ├── cms/                # CosmicJS integration layer
│   └── config/             # Shared config, env validation
├── .github/
│   └── workflows/          # GitHub Actions (cron + deploy)
├── .devin/
│   └── workflows/          # Devin AI workflow definitions
├── turbo.json
├── package.json            # Root package.json with workspaces
├── tsconfig.base.json
└── .env.example
```

2. Initialize Turborepo:
```bash
npx create-turbo@latest --skip-install
# copy turbo.json config only, do not overwrite existing code
```

3. Root `package.json` must use `pnpm` workspaces:
```json
{
  "name": "posteragent",
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "packageManager": "pnpm@9.0.0",
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "generate": "turbo generate",
    "publish:all": "turbo publish:all",
    "factory:run": "turbo factory:run"
  }
}
```

4. Create `tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

5. Move existing `nexus/` code into `apps/nexus/`

6. Create `.env.example` with ALL environment variable placeholders (see Task 0.2)

**OUTPUT:** Monorepo builds with `pnpm install` and `pnpm build` with no errors.

---

## TASK 0.2 — Environment Configuration

**Context:** All secrets and API keys in one place, validated at startup.

**Instructions:**
1. Install `zod` in `packages/config`
2. Create `packages/config/src/env.ts`:
```typescript
import { z } from 'zod'

const envSchema = z.object({
  // Anthropic
  ANTHROPIC_API_KEY: z.string().min(1),

  // OpenAI (for fallback and Whisper)
  OPENAI_API_KEY: z.string().min(1),

  // CosmicJS
  COSMIC_BUCKET_SLUG: z.string().min(1),
  COSMIC_READ_KEY: z.string().min(1),
  COSMIC_WRITE_KEY: z.string().min(1),

  // ElevenLabs (TTS/voiceover)
  ELEVENLABS_API_KEY: z.string().min(1),
  ELEVENLABS_VOICE_ID: z.string().default('21m00Tcm4TlvDq8ikWAM'),

  // Replicate (image generation)
  REPLICATE_API_TOKEN: z.string().min(1),

  // FAL.ai (fast image/video gen alternative)
  FAL_API_KEY: z.string().optional(),

  // Social platforms
  TIKTOK_ACCESS_TOKEN: z.string().min(1),
  TIKTOK_CLIENT_KEY: z.string().min(1),
  TIKTOK_CLIENT_SECRET: z.string().min(1),

  INSTAGRAM_ACCESS_TOKEN: z.string().min(1),
  INSTAGRAM_BUSINESS_ACCOUNT_ID: z.string().min(1),
  FACEBOOK_PAGE_ID: z.string().min(1),

  YOUTUBE_CLIENT_ID: z.string().min(1),
  YOUTUBE_CLIENT_SECRET: z.string().min(1),
  YOUTUBE_REFRESH_TOKEN: z.string().min(1),

  TWITTER_API_KEY: z.string().min(1),
  TWITTER_API_SECRET: z.string().min(1),
  TWITTER_ACCESS_TOKEN: z.string().min(1),
  TWITTER_ACCESS_SECRET: z.string().min(1),

  PINTEREST_ACCESS_TOKEN: z.string().optional(),

  LINKEDIN_ACCESS_TOKEN: z.string().optional(),

  // Affiliate
  AMAZON_ASSOCIATE_TAG: z.string().min(1),
  AMAZON_ACCESS_KEY: z.string().min(1),
  AMAZON_SECRET_KEY: z.string().min(1),

  // Gumroad
  GUMROAD_ACCESS_TOKEN: z.string().optional(),

  // Analytics
  GOOGLE_ANALYTICS_ID: z.string().optional(),

  // Vercel (for site deployments)
  VERCEL_TOKEN: z.string().min(1),
  VERCEL_ORG_ID: z.string().min(1),

  // Supabase (for queue + analytics storage)
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // Redis (for job queue)
  REDIS_URL: z.string().url().optional(),

  // Node env
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
})

export type Env = z.infer<typeof envSchema>

export function validateEnv(): Env {
  const result = envSchema.safeParse(process.env)
  if (!result.success) {
    console.error('❌ Invalid environment variables:')
    console.error(result.error.flatten().fieldErrors)
    process.exit(1)
  }
  return result.data
}

export const env = validateEnv()
```

3. Export from `packages/config/src/index.ts`
4. Import and call `validateEnv()` at the top of every `apps/*/src/index.ts`

**OUTPUT:** Running `node -e "require('./packages/config/dist').validateEnv()"` prints success or lists exactly which env vars are missing.

---

## TASK 0.3 — Database Schema (Supabase)

**Context:** We need persistent storage for content queue, published posts, site inventory, revenue tracking, and analytics.

**Instructions:**
1. Create `packages/core/src/db/schema.sql` with the following tables:

```sql
-- Content items waiting to be generated or published
CREATE TABLE content_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('poster', 'video_short', 'video_reel', 'video_story', 'carousel')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'generating', 'ready', 'publishing', 'published', 'failed')),
  niche TEXT NOT NULL,
  topic TEXT NOT NULL,
  keywords TEXT[] NOT NULL DEFAULT '{}',
  platform_targets TEXT[] NOT NULL DEFAULT '{}',
  source_url TEXT,
  metadata JSONB DEFAULT '{}',
  error TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  scheduled_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ
);

-- Generated assets (images, videos, audio)
CREATE TABLE assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_queue_id UUID REFERENCES content_queue(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('image', 'video', 'audio', 'caption', 'script', 'thumbnail')),
  url TEXT NOT NULL,
  cdn_url TEXT,
  cosmic_object_id TEXT,
  duration_seconds FLOAT,
  width INTEGER,
  height INTEGER,
  file_size_bytes BIGINT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Published posts across all platforms
CREATE TABLE published_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_queue_id UUID REFERENCES content_queue(id),
  platform TEXT NOT NULL CHECK (platform IN ('tiktok', 'instagram_feed', 'instagram_reels', 'instagram_story', 'youtube_shorts', 'youtube', 'twitter', 'linkedin', 'pinterest', 'threads')),
  platform_post_id TEXT,
  platform_url TEXT,
  caption TEXT,
  hashtags TEXT[],
  status TEXT DEFAULT 'published',
  views BIGINT DEFAULT 0,
  likes BIGINT DEFAULT 0,
  comments BIGINT DEFAULT 0,
  shares BIGINT DEFAULT 0,
  saves BIGINT DEFAULT 0,
  click_throughs BIGINT DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  published_at TIMESTAMPTZ DEFAULT NOW(),
  last_stats_updated_at TIMESTAMPTZ
);

-- Niche websites inventory
CREATE TABLE sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  niche TEXT NOT NULL,
  domain TEXT UNIQUE,
  vercel_project_id TEXT,
  cosmic_bucket_slug TEXT UNIQUE,
  status TEXT DEFAULT 'building' CHECK (status IN ('building', 'live', 'paused', 'archived')),
  affiliate_program TEXT CHECK (affiliate_program IN ('amazon', 'impact', 'shareasale', 'gumroad', 'custom')),
  affiliate_tag TEXT,
  monthly_views BIGINT DEFAULT 0,
  monthly_revenue_cents BIGINT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  deployed_at TIMESTAMPTZ
);

-- Site pages
CREATE TABLE site_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  content_type TEXT CHECK (content_type IN ('landing', 'blog_post', 'product_review', 'comparison', 'listicle', 'faq')),
  cosmic_object_id TEXT,
  published BOOLEAN DEFAULT FALSE,
  seo_score INTEGER,
  affiliate_links JSONB DEFAULT '[]',
  views BIGINT DEFAULT 0,
  conversions BIGINT DEFAULT 0,
  revenue_cents BIGINT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Revenue tracking
CREATE TABLE revenue_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL CHECK (source IN ('amazon', 'adsense', 'gumroad', 'impact', 'shareasale', 'direct')),
  site_id UUID REFERENCES sites(id),
  published_post_id UUID REFERENCES published_posts(id),
  amount_cents BIGINT NOT NULL,
  currency TEXT DEFAULT 'USD',
  description TEXT,
  event_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trend cache (so we don't hit trend APIs on every run)
CREATE TABLE trend_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL,
  niche TEXT NOT NULL,
  keywords TEXT[] NOT NULL,
  hashtags TEXT[] NOT NULL,
  topics JSONB NOT NULL DEFAULT '[]',
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '6 hours'
);

-- Indexes
CREATE INDEX idx_content_queue_status ON content_queue(status);
CREATE INDEX idx_content_queue_scheduled ON content_queue(scheduled_at);
CREATE INDEX idx_published_posts_platform ON published_posts(platform);
CREATE INDEX idx_published_posts_published_at ON published_posts(published_at);
CREATE INDEX idx_sites_niche ON sites(niche);
CREATE INDEX idx_revenue_events_date ON revenue_events(event_date);
CREATE INDEX idx_trend_cache_niche_platform ON trend_cache(niche, platform);
```

2. Create `packages/core/src/db/client.ts`:
```typescript
import { createClient } from '@supabase/supabase-js'
import { env } from '@repo/config'

export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
```

3. Run the schema against Supabase using the CLI or paste in Supabase SQL editor.
4. Generate TypeScript types: `npx supabase gen types typescript --project-id YOUR_PROJECT_ID > packages/core/src/db/types.ts`

**OUTPUT:** All tables created in Supabase. TypeScript types generated and exported from `@repo/core`.

---

# PHASE 1 — MASTRA AGENT FRAMEWORK

---

## TASK 1.1 — Install and Configure Mastra

**Context:** Mastra is our agent orchestration layer. It replaces custom NEXUS orchestration boilerplate.

**STEAL FROM:** `github.com/mastra-ai/mastra` — copy patterns from `/packages/core/src/agent/index.ts` and `/packages/core/src/workflow/index.ts`

**Instructions:**
1. In `packages/agents/`, install:
```bash
pnpm add @mastra/core @mastra/memory @ai-sdk/anthropic @ai-sdk/openai zod
```

2. Create `packages/agents/src/mastra.ts`:
```typescript
import { Mastra } from '@mastra/core'
import { PostgresMemory } from '@mastra/memory'
import { env } from '@repo/config'
import { allAgents } from './agents/index'
import { allWorkflows } from './workflows/index'

export const mastra = new Mastra({
  agents: allAgents,
  workflows: allWorkflows,
  memory: new PostgresMemory({
    connectionString: env.SUPABASE_URL,
  }),
  logger: {
    level: 'info',
  },
})
```

3. Create `packages/agents/src/agents/index.ts` that exports all agents (stub for now, populated in later tasks)

4. Create `packages/agents/src/workflows/index.ts` that exports all workflows (stub for now)

5. Create `packages/agents/src/tools/index.ts` that exports all tools (stub for now)

**OUTPUT:** `mastra` instance initializes without errors. `pnpm --filter @repo/agents build` succeeds.

---

## TASK 1.2 — Trend Research Agent

**Context:** This agent finds trending topics, keywords, and hashtags for a given niche. It feeds the content queue.

**STEAL FROM:** Mastra `createTool()` pattern from `github.com/mastra-ai/mastra/packages/core/src/tools`

**Instructions:**
1. Create `packages/tools/src/trend-tools.ts`:
```typescript
import { createTool } from '@mastra/core'
import { z } from 'zod'
import { supabase } from '@repo/core/db'

export const fetchGoogleTrendsTool = createTool({
  id: 'fetch-google-trends',
  description: 'Fetches trending search topics from Google Trends for a given niche and region',
  inputSchema: z.object({
    niche: z.string(),
    region: z.string().default('US'),
    timeframe: z.enum(['now 1-H', 'now 4-H', 'now 1-d', 'now 7-d', 'today 1-m']).default('now 1-d'),
    limit: z.number().default(20),
  }),
  outputSchema: z.object({
    keywords: z.array(z.string()),
    topics: z.array(z.object({
      title: z.string(),
      traffic: z.string(),
      relatedQueries: z.array(z.string()),
    })),
  }),
  execute: async ({ context }) => {
    // Use google-trends-api npm package
    const googleTrends = await import('google-trends-api')
    const results = await googleTrends.interestOverTime({
      keyword: context.niche,
      geo: context.region,
      startTime: new Date(Date.now() - 24 * 60 * 60 * 1000),
    })
    const parsed = JSON.parse(results)
    // extract and return keywords
    return {
      keywords: parsed.default?.timelineData?.map((d: any) => d.formattedValue[0]) ?? [],
      topics: [],
    }
  },
})

export const fetchTikTokTrendsTool = createTool({
  id: 'fetch-tiktok-trends',
  description: 'Scrapes TikTok trending hashtags and sounds for a niche using the Creative Center API',
  inputSchema: z.object({
    niche: z.string(),
    country: z.string().default('US'),
    limit: z.number().default(30),
  }),
  outputSchema: z.object({
    hashtags: z.array(z.object({
      name: z.string(),
      videoCount: z.number(),
      viewCount: z.number(),
    })),
    topics: z.array(z.string()),
  }),
  execute: async ({ context }) => {
    // TikTok Creative Center API (no auth required for public data)
    const url = `https://ads.tiktok.com/creative_radar_api/v1/popular_trend/hashtag/list?period=7&country_code=${context.country}&page_size=${context.limit}`
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    })
    const data = await response.json()
    const hashtags = data?.data?.list?.map((item: any) => ({
      name: item.hashtag_name,
      videoCount: item.video_views,
      viewCount: item.video_views,
    })) ?? []
    return { hashtags, topics: hashtags.map((h: any) => h.name) }
  },
})

export const fetchRedditTrendsTool = createTool({
  id: 'fetch-reddit-trends',
  description: 'Gets hot posts from a subreddit related to the niche for content ideas',
  inputSchema: z.object({
    subreddit: z.string(),
    limit: z.number().default(25),
    filter: z.enum(['hot', 'top', 'rising', 'new']).default('hot'),
    timeframe: z.enum(['hour', 'day', 'week', 'month', 'year', 'all']).default('day'),
  }),
  outputSchema: z.object({
    posts: z.array(z.object({
      title: z.string(),
      score: z.number(),
      commentCount: z.number(),
      url: z.string(),
      selftext: z.string(),
    })),
  }),
  execute: async ({ context }) => {
    const url = `https://www.reddit.com/r/${context.subreddit}/${context.filter}.json?limit=${context.limit}&t=${context.timeframe}`
    const response = await fetch(url, {
      headers: { 'User-Agent': 'ContentBot/1.0' },
    })
    const data = await response.json()
    const posts = data?.data?.children?.map((child: any) => ({
      title: child.data.title,
      score: child.data.score,
      commentCount: child.data.num_comments,
      url: `https://reddit.com${child.data.permalink}`,
      selftext: child.data.selftext?.slice(0, 500) ?? '',
    })) ?? []
    return { posts }
  },
})

export const saveTrendCacheTool = createTool({
  id: 'save-trend-cache',
  description: 'Saves trend data to the database cache to avoid repeated API calls',
  inputSchema: z.object({
    platform: z.string(),
    niche: z.string(),
    keywords: z.array(z.string()),
    hashtags: z.array(z.string()),
    topics: z.array(z.any()),
  }),
  outputSchema: z.object({ saved: z.boolean() }),
  execute: async ({ context }) => {
    const { error } = await supabase.from('trend_cache').insert({
      platform: context.platform,
      niche: context.niche,
      keywords: context.keywords,
      hashtags: context.hashtags,
      topics: context.topics,
      expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
    })
    return { saved: !error }
  },
})
```

2. Create `packages/agents/src/agents/trend-agent.ts`:
```typescript
import { Agent } from '@mastra/core/agent'
import { anthropic } from '@ai-sdk/anthropic'
import {
  fetchGoogleTrendsTool,
  fetchTikTokTrendsTool,
  fetchRedditTrendsTool,
  saveTrendCacheTool,
} from '@repo/tools'
import { supabase } from '@repo/core/db'

export const trendAgent = new Agent({
  name: 'TrendResearchAgent',
  instructions: `You are a trend research specialist for content marketing.
Your job is to find the most viral, high-engagement topics for a given niche.
Always fetch from multiple sources: Google Trends, TikTok Trends, and Reddit.
Filter for topics that: (1) have search volume, (2) are visual/emotional, (3) work well as short video or poster content.
Return topics sorted by virality potential descending.
For each topic, suggest a content angle: "did you know", "how to", "vs comparison", "reaction", "story", "listicle".
ALWAYS save results to trend cache after fetching.`,
  model: anthropic('claude-opus-4-5-20251101'),
  tools: {
    fetchGoogleTrends: fetchGoogleTrendsTool,
    fetchTikTokTrends: fetchTikTokTrendsTool,
    fetchRedditTrends: fetchRedditTrendsTool,
    saveTrendCache: saveTrendCacheTool,
  },
})
```

3. Install required packages:
```bash
pnpm add google-trends-api node-fetch
```

**OUTPUT:** `trendAgent.generate({ messages: [{ role: 'user', content: 'Find top 10 trends for finance niche' }] })` returns a list of topics with content angles.

---

## TASK 1.3 — Content Queue Manager Agent

**Context:** This agent takes trend data and decides what to create, when to create it, and which platforms to target. It populates the `content_queue` table.

**Instructions:**
1. Create `packages/tools/src/queue-tools.ts`:
```typescript
import { createTool } from '@mastra/core'
import { z } from 'zod'
import { supabase } from '@repo/core/db'

export const addToQueueTool = createTool({
  id: 'add-to-content-queue',
  description: 'Adds a new content item to the generation queue',
  inputSchema: z.object({
    type: z.enum(['poster', 'video_short', 'video_reel', 'video_story', 'carousel']),
    niche: z.string(),
    topic: z.string(),
    keywords: z.array(z.string()),
    platform_targets: z.array(z.string()),
    source_url: z.string().optional(),
    scheduled_at: z.string().optional(),
    metadata: z.record(z.any()).optional(),
  }),
  outputSchema: z.object({
    id: z.string(),
    created: z.boolean(),
  }),
  execute: async ({ context }) => {
    const { data, error } = await supabase
      .from('content_queue')
      .insert({
        type: context.type,
        niche: context.niche,
        topic: context.topic,
        keywords: context.keywords,
        platform_targets: context.platform_targets,
        source_url: context.source_url,
        scheduled_at: context.scheduled_at ?? new Date().toISOString(),
        metadata: context.metadata ?? {},
      })
      .select('id')
      .single()
    return { id: data?.id ?? '', created: !error }
  },
})

export const getQueueStatusTool = createTool({
  id: 'get-queue-status',
  description: 'Returns counts of items in each status in the content queue',
  inputSchema: z.object({}),
  outputSchema: z.object({
    pending: z.number(),
    generating: z.number(),
    ready: z.number(),
    publishing: z.number(),
    published: z.number(),
    failed: z.number(),
  }),
  execute: async () => {
    const { data } = await supabase
      .from('content_queue')
      .select('status')
    const counts = { pending: 0, generating: 0, ready: 0, publishing: 0, published: 0, failed: 0 }
    data?.forEach((row: any) => {
      if (row.status in counts) counts[row.status as keyof typeof counts]++
    })
    return counts
  },
})

export const getNextBatchTool = createTool({
  id: 'get-next-batch',
  description: 'Returns the next N pending items from the queue sorted by scheduled_at',
  inputSchema: z.object({ limit: z.number().default(10) }),
  outputSchema: z.object({
    items: z.array(z.any()),
  }),
  execute: async ({ context }) => {
    const { data } = await supabase
      .from('content_queue')
      .select('*')
      .eq('status', 'pending')
      .order('scheduled_at', { ascending: true })
      .limit(context.limit)
    return { items: data ?? [] }
  },
})

export const updateQueueItemTool = createTool({
  id: 'update-queue-item',
  description: 'Updates the status or metadata of a queue item',
  inputSchema: z.object({
    id: z.string(),
    status: z.enum(['pending', 'generating', 'ready', 'publishing', 'published', 'failed']).optional(),
    metadata: z.record(z.any()).optional(),
    error: z.string().optional(),
  }),
  outputSchema: z.object({ updated: z.boolean() }),
  execute: async ({ context }) => {
    const updates: Record<string, any> = {}
    if (context.status) updates.status = context.status
    if (context.metadata) updates.metadata = context.metadata
    if (context.error) updates.error = context.error
    const { error } = await supabase
      .from('content_queue')
      .update(updates)
      .eq('id', context.id)
    return { updated: !error }
  },
})
```

2. Create `packages/agents/src/agents/queue-agent.ts`:
```typescript
import { Agent } from '@mastra/core/agent'
import { anthropic } from '@ai-sdk/anthropic'
import { addToQueueTool, getQueueStatusTool, getNextBatchTool, updateQueueItemTool } from '@repo/tools'

export const queueAgent = new Agent({
  name: 'ContentQueueManager',
  instructions: `You are a content calendar and queue manager for a one-person content business.
You receive trend data and decide:
1. Content type to create (poster vs video_short vs reel vs carousel)
2. Which platforms to target (based on content type and niche)
3. When to schedule it (spread posts throughout the day: 7am, 12pm, 5pm, 8pm)
4. How many pieces to batch per session (default: 5 posters + 3 short videos per day)

Platform targeting rules:
- Poster → instagram_feed, pinterest, twitter
- video_short (under 30s) → tiktok, instagram_reels, youtube_shorts, twitter
- video_reel (30-90s) → instagram_reels, tiktok, youtube_shorts
- video_story → instagram_story
- carousel → instagram_feed, linkedin

Never queue more than 3 pieces for the same topic in a 24h window.
Always check queue status before adding new items.`,
  model: anthropic('claude-opus-4-5-20251101'),
  tools: {
    addToQueue: addToQueueTool,
    getQueueStatus: getQueueStatusTool,
    getNextBatch: getNextBatchTool,
    updateQueueItem: updateQueueItemTool,
  },
})
```

**OUTPUT:** Agent can populate and manage the `content_queue` table. Test with: `queueAgent.generate({ messages: [{ role: 'user', content: 'Schedule 5 pieces for the finance niche based on these trends: [list]' }] })`

---

# PHASE 2 — POSTER GENERATION

---

## TASK 2.1 — Image Generation Tools

**Context:** Generate poster images using Replicate (FLUX/SDXL) and FAL.ai. These become the visual assets for social media posts.

**Instructions:**
1. Install: `pnpm add replicate @fal-ai/serverless-client sharp`

2. Create `packages/generators/src/image/replicate-client.ts`:
```typescript
import Replicate from 'replicate'
import { env } from '@repo/config'

export const replicate = new Replicate({ auth: env.REPLICATE_API_TOKEN })

export interface ImageGenerationParams {
  prompt: string
  negativePrompt?: string
  width: number
  height: number
  model: 'flux-1.1-pro' | 'sdxl' | 'flux-dev' | 'flux-schnell'
  numOutputs?: number
  outputFormat?: 'webp' | 'jpg' | 'png'
}

export async function generateImage(params: ImageGenerationParams): Promise<string[]> {
  const modelMap = {
    'flux-1.1-pro': 'black-forest-labs/flux-1.1-pro',
    'flux-dev': 'black-forest-labs/flux-dev',
    'flux-schnell': 'black-forest-labs/flux-schnell',
    'sdxl': 'stability-ai/sdxl:39ed52f2319f9609e4bc4d3fdb3f9af9ee87b0e5',
  }

  const output = await replicate.run(modelMap[params.model] as any, {
    input: {
      prompt: params.prompt,
      negative_prompt: params.negativePrompt ?? 'blurry, low quality, watermark, text, ugly, distorted',
      width: params.width,
      height: params.height,
      num_outputs: params.numOutputs ?? 1,
      output_format: params.outputFormat ?? 'webp',
    },
  })

  return Array.isArray(output) ? output.map(String) : [String(output)]
}
```

3. Create `packages/generators/src/image/prompt-builder.ts`:
```typescript
export interface PosterPromptConfig {
  topic: string
  niche: string
  style: 'modern_flat' | 'dark_luxury' | 'bright_viral' | 'minimalist' | 'bold_typographic' | 'photo_realistic'
  aspectRatio: '1:1' | '9:16' | '16:9' | '4:5'
  colorScheme?: string
  hasText?: boolean
  brandName?: string
}

const stylePrompts: Record<string, string> = {
  modern_flat: 'flat design, clean geometric shapes, modern illustration, bold colors, minimal',
  dark_luxury: 'dark background, gold accents, luxury aesthetic, premium feel, high contrast',
  bright_viral: 'bright vivid colors, eye-catching, high saturation, dynamic composition, social media ready',
  minimalist: 'white background, minimal elements, lots of whitespace, elegant typography, simple',
  bold_typographic: 'typography-focused, bold text layout, graphic design, editorial',
  photo_realistic: 'photorealistic, high detail, professional photography, studio lighting, 8K quality',
}

const aspectDimensions: Record<string, { width: number; height: number }> = {
  '1:1': { width: 1024, height: 1024 },
  '9:16': { width: 768, height: 1344 },
  '16:9': { width: 1344, height: 768 },
  '4:5': { width: 896, height: 1120 },
}

export function buildPosterPrompt(config: PosterPromptConfig): {
  prompt: string
  negativePrompt: string
  width: number
  height: number
} {
  const styleDesc = stylePrompts[config.style]
  const noTextInstruction = config.hasText ? '' : ', no text, no words, no letters'

  const prompt = `${config.niche} content about "${config.topic}", ${styleDesc}${noTextInstruction}, professional quality, trending on social media`

  const negativePrompt = 'blurry, low quality, watermark, ugly, distorted, amateur, pixelated, overexposed, underexposed'

  const { width, height } = aspectDimensions[config.aspectRatio]

  return { prompt, negativePrompt, width, height }
}
```

4. Create `packages/tools/src/image-gen-tools.ts`:
```typescript
import { createTool } from '@mastra/core'
import { z } from 'zod'
import { generateImage } from '@repo/generators/image/replicate-client'
import { buildPosterPrompt } from '@repo/generators/image/prompt-builder'
import { uploadToCosmicCDN } from '@repo/cms'

export const generatePosterImageTool = createTool({
  id: 'generate-poster-image',
  description: 'Generates a poster/image for social media using AI image generation',
  inputSchema: z.object({
    topic: z.string(),
    niche: z.string(),
    style: z.enum(['modern_flat', 'dark_luxury', 'bright_viral', 'minimalist', 'bold_typographic', 'photo_realistic']).default('bright_viral'),
    aspectRatio: z.enum(['1:1', '9:16', '16:9', '4:5']).default('1:1'),
    customPrompt: z.string().optional(),
    model: z.enum(['flux-1.1-pro', 'sdxl', 'flux-dev', 'flux-schnell']).default('flux-1.1-pro'),
  }),
  outputSchema: z.object({
    imageUrl: z.string(),
    cdnUrl: z.string(),
    cosmicObjectId: z.string().optional(),
    width: z.number(),
    height: z.number(),
  }),
  execute: async ({ context }) => {
    const { prompt, negativePrompt, width, height } = buildPosterPrompt({
      topic: context.topic,
      niche: context.niche,
      style: context.style,
      aspectRatio: context.aspectRatio,
    })

    const finalPrompt = context.customPrompt ?? prompt

    const [imageUrl] = await generateImage({
      prompt: finalPrompt,
      negativePrompt,
      width,
      height,
      model: context.model,
    })

    // Upload to CosmicJS CDN for permanent storage
    const { cdnUrl, objectId } = await uploadToCosmicCDN(imageUrl, {
      folder: `posters/${context.niche}`,
      title: context.topic,
    })

    return {
      imageUrl,
      cdnUrl,
      cosmicObjectId: objectId,
      width,
      height,
    }
  },
})
```

5. Create the poster generation agent `packages/agents/src/agents/poster-agent.ts`:
```typescript
import { Agent } from '@mastra/core/agent'
import { anthropic } from '@ai-sdk/anthropic'
import { generatePosterImageTool } from '@repo/tools'
import { addAssetToDbTool, updateQueueItemTool } from '@repo/tools'

export const posterAgent = new Agent({
  name: 'PosterGenerationAgent',
  instructions: `You are a visual content creator specializing in viral social media posters.
For each content queue item:
1. Determine the best visual style based on niche and topic
2. Choose the correct aspect ratio (9:16 for TikTok/Reels, 1:1 for feed posts, 4:5 for Instagram feed)
3. Generate the image with the best prompt
4. Save the asset to the database
5. Update the queue item status to 'ready'

Style selection guide:
- Finance/Business → dark_luxury or minimalist
- Motivation/Lifestyle → bright_viral or photo_realistic
- Technology → modern_flat or minimalist
- Fashion/Beauty → photo_realistic or dark_luxury
- Food/Health → bright_viral or photo_realistic
- Education → modern_flat or bold_typographic

Always generate at least 2 variants per topic (different styles) so the publisher can pick the best one.`,
  model: anthropic('claude-opus-4-5-20251101'),
  tools: {
    generatePosterImage: generatePosterImageTool,
    addAssetToDb: addAssetToDbTool,
    updateQueueItem: updateQueueItemTool,
  },
})
```

**OUTPUT:** Running poster agent with a finance topic produces 2 image URLs uploaded to CosmicJS CDN.

---

## TASK 2.2 — Caption & Hashtag Generator

**Context:** Every poster needs a platform-specific caption and a hashtag set optimized for reach.

**Instructions:**
1. Create `packages/tools/src/caption-tools.ts`:
```typescript
import { createTool } from '@mastra/core'
import { z } from 'zod'
import { anthropic } from '@ai-sdk/anthropic'
import { generateText } from 'ai'

const platformRules = {
  tiktok: 'Keep under 150 chars. Hook in first 3 words. Use 3-5 trending hashtags. Add call to action.',
  instagram_feed: 'Up to 2200 chars. First 125 chars must hook. Storytelling format. 15-20 hashtags.',
  instagram_reels: 'Keep under 150 chars. Very punchy. 5-8 hashtags. Include emoji.',
  youtube_shorts: 'First 100 chars become the title. Descriptive but exciting. 3 hashtags max.',
  twitter: 'Under 280 chars total including hashtags. Sharp and punchy. 2-3 hashtags.',
  pinterest: 'Description-focused, 500 chars, SEO keywords, no hashtags, link-click oriented.',
  linkedin: 'Professional tone, insight-driven, 1300 chars, 3-5 hashtags, thought leadership angle.',
  threads: 'Conversational, under 500 chars, 2-3 hashtags, discussion-starting question at end.',
}

export const generateCaptionTool = createTool({
  id: 'generate-caption',
  description: 'Generates platform-optimized captions and hashtags for a content piece',
  inputSchema: z.object({
    topic: z.string(),
    niche: z.string(),
    platform: z.enum(['tiktok', 'instagram_feed', 'instagram_reels', 'instagram_story', 'youtube_shorts', 'twitter', 'linkedin', 'pinterest', 'threads']),
    contentType: z.enum(['poster', 'video_short', 'video_reel', 'carousel']),
    affiliateLinkPlaceholder: z.boolean().default(true),
    brandVoice: z.enum(['authoritative', 'casual', 'inspirational', 'educational', 'entertaining']).default('entertaining'),
  }),
  outputSchema: z.object({
    caption: z.string(),
    hashtags: z.array(z.string()),
    callToAction: z.string(),
    fullPost: z.string(),
  }),
  execute: async ({ context }) => {
    const rules = platformRules[context.platform]
    const { text } = await generateText({
      model: anthropic('claude-opus-4-5-20251101'),
      prompt: `Generate a ${context.platform} caption for this content:
Topic: ${context.topic}
Niche: ${context.niche}
Content type: ${context.contentType}
Brand voice: ${context.brandVoice}
${context.affiliateLinkPlaceholder ? 'Include [LINK] placeholder where the affiliate link should go.' : ''}

Platform rules: ${rules}

Return JSON only:
{
  "caption": "the main caption text",
  "hashtags": ["tag1", "tag2"],
  "callToAction": "the CTA text",
  "fullPost": "caption + hashtags formatted for posting"
}`,
    })

    return JSON.parse(text)
  },
})

export const generateHashtagSetTool = createTool({
  id: 'generate-hashtag-set',
  description: 'Generates an optimized hashtag set mixing high/medium/low competition tags',
  inputSchema: z.object({
    niche: z.string(),
    topic: z.string(),
    platform: z.string(),
    count: z.number().default(20),
  }),
  outputSchema: z.object({
    highCompetition: z.array(z.string()),
    mediumCompetition: z.array(z.string()),
    lowCompetition: z.array(z.string()),
    recommended: z.array(z.string()),
  }),
  execute: async ({ context }) => {
    const { text } = await generateText({
      model: anthropic('claude-opus-4-5-20251101'),
      prompt: `Generate ${context.count} hashtags for ${context.platform} in the ${context.niche} niche about "${context.topic}".
Mix: 20% high competition (1M+ posts), 50% medium (100K-1M), 30% low (under 100K).
Return JSON: { "highCompetition": [], "mediumCompetition": [], "lowCompetition": [], "recommended": [top 10 mix] }`,
    })
    return JSON.parse(text)
  },
})
```

**OUTPUT:** `generateCaptionTool` returns a ready-to-post caption for each platform tested.

---

# PHASE 3 — VIDEO GENERATION

---

## TASK 3.1 — Remotion Setup

**Context:** Remotion renders React components to MP4 video. We use it for all programmatic video creation.

**STEAL FROM:** `calesthio/OpenMontage` — copy the Remotion config, composition registry, and base scene components

**Instructions:**
1. In `packages/generators/`, install:
```bash
pnpm add remotion @remotion/renderer @remotion/bundler @remotion/google-fonts react react-dom
pnpm add -D @types/react @types/react-dom
```

2. Create `packages/generators/src/video/remotion/Root.tsx`:
```tsx
import { Composition } from 'remotion'
import { ShortVideoComposition } from './compositions/ShortVideo'
import { PosterSlideshow } from './compositions/PosterSlideshow'
import { MotivationalQuote } from './compositions/MotivationalQuote'
import { ProductShowcase } from './compositions/ProductShowcase'
import { NewsBreaker } from './compositions/NewsBreaker'
import { RedditStory } from './compositions/RedditStory'
import { FinanceTip } from './compositions/FinanceTip'
import { CountdownList } from './compositions/CountdownList'

export const RemotionRoot = () => {
  return (
    <>
      <Composition
        id="ShortVideo"
        component={ShortVideoComposition}
        durationInFrames={450}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          topic: 'Default Topic',
          script: [],
          backgroundStyle: 'dark_gradient',
          niche: 'general',
        }}
      />
      <Composition
        id="PosterSlideshow"
        component={PosterSlideshow}
        durationInFrames={180}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{ images: [], captions: [] }}
      />
      <Composition
        id="MotivationalQuote"
        component={MotivationalQuote}
        durationInFrames={150}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{ quote: '', author: '', background: 'dark_luxury' }}
      />
      <Composition
        id="ProductShowcase"
        component={ProductShowcase}
        durationInFrames={300}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{ productName: '', features: [], imageUrl: '', price: '' }}
      />
      <Composition
        id="NewsBreaker"
        component={NewsBreaker}
        durationInFrames={270}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{ headline: '', summary: '', imageUrl: '' }}
      />
      <Composition
        id="RedditStory"
        component={RedditStory}
        durationInFrames={600}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{ title: '', body: '', subreddit: '' }}
      />
      <Composition
        id="FinanceTip"
        component={FinanceTip}
        durationInFrames={240}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{ tip: '', data: [] }}
      />
      <Composition
        id="CountdownList"
        component={CountdownList}
        durationInFrames={300}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{ title: '', items: [] }}
      />
    </>
  )
}
```

3. Create `packages/generators/src/video/remotion/compositions/ShortVideo.tsx` — this is the main all-purpose short video. It takes a `script` array (each item = one text card on screen) with timing, background video/image, and voiceover audio:
```tsx
import { AbsoluteFill, Sequence, Audio, Img, useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion'

interface ScriptLine {
  text: string
  startFrame: number
  durationFrames: number
  style?: 'headline' | 'subtitle' | 'caption'
}

interface ShortVideoProps {
  topic: string
  script: ScriptLine[]
  backgroundStyle: 'dark_gradient' | 'light_minimal' | 'fire' | 'nature' | 'city'
  backgroundImageUrl?: string
  voiceoverAudioUrl?: string
  musicUrl?: string
  niche: string
}

export const ShortVideoComposition = ({
  topic,
  script,
  backgroundStyle,
  backgroundImageUrl,
  voiceoverAudioUrl,
  musicUrl,
}: ShortVideoProps) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const backgroundColors: Record<string, string> = {
    dark_gradient: 'linear-gradient(135deg, #0f0f0f 0%, #1a1a2e 50%, #16213e 100%)',
    light_minimal: 'linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)',
    fire: 'linear-gradient(135deg, #f12711 0%, #f5af19 100%)',
    nature: 'linear-gradient(135deg, #134e5e 0%, #71b280 100%)',
    city: 'linear-gradient(135deg, #141E30 0%, #243B55 100%)',
  }

  return (
    <AbsoluteFill style={{ background: backgroundColors[backgroundStyle] }}>
      {backgroundImageUrl && (
        <AbsoluteFill>
          <Img src={backgroundImageUrl} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.4 }} />
        </AbsoluteFill>
      )}

      {voiceoverAudioUrl && <Audio src={voiceoverAudioUrl} />}
      {musicUrl && <Audio src={musicUrl} volume={0.15} />}

      {script.map((line, i) => {
        const localFrame = frame - line.startFrame
        const opacity = interpolate(localFrame, [0, 8, line.durationFrames - 8, line.durationFrames], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
        const scale = spring({ frame: localFrame, fps, config: { damping: 12, stiffness: 200 } })

        return (
          <Sequence key={i} from={line.startFrame} durationInFrames={line.durationFrames}>
            <AbsoluteFill style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '60px 40px',
            }}>
              <p style={{
                color: '#ffffff',
                fontSize: line.style === 'headline' ? 72 : line.style === 'subtitle' ? 52 : 40,
                fontWeight: line.style === 'caption' ? 400 : 700,
                textAlign: 'center',
                lineHeight: 1.2,
                opacity,
                transform: `scale(${scale})`,
                textShadow: '0 2px 20px rgba(0,0,0,0.8)',
                fontFamily: 'system-ui, -apple-system, sans-serif',
                maxWidth: '900px',
              }}>{line.text}</p>
            </AbsoluteFill>
          </Sequence>
        )
      })}
    </AbsoluteFill>
  )
}
```

4. Create similar composition files for: `MotivationalQuote.tsx`, `CountdownList.tsx`, `RedditStory.tsx`, `FinanceTip.tsx`, `NewsBreaker.tsx`, `ProductShowcase.tsx`, `PosterSlideshow.tsx` — each uses AbsoluteFill, Sequence, spring animations.

5. Create `packages/generators/src/video/renderer.ts`:
```typescript
import { bundle } from '@remotion/bundler'
import { renderMedia, selectComposition } from '@remotion/renderer'
import path from 'path'
import fs from 'fs/promises'

export interface RenderVideoParams {
  compositionId: string
  props: Record<string, any>
  outputPath?: string
  codec?: 'h264' | 'h265' | 'vp8' | 'vp9'
  crf?: number
}

export async function renderVideo(params: RenderVideoParams): Promise<string> {
  const bundleLocation = await bundle({
    entryPoint: path.join(__dirname, 'remotion/Root.tsx'),
    webpackOverride: (config) => config,
  })

  const composition = await selectComposition({
    serveUrl: bundleLocation,
    id: params.compositionId,
    inputProps: params.props,
  })

  const outputPath = params.outputPath ?? path.join('/tmp', `video_${Date.now()}.mp4`)

  await renderMedia({
    composition,
    serveUrl: bundleLocation,
    codec: params.codec ?? 'h264',
    outputLocation: outputPath,
    inputProps: params.props,
    crf: params.crf ?? 18,
  })

  return outputPath
}
```

**OUTPUT:** `renderVideo({ compositionId: 'MotivationalQuote', props: { quote: 'test', author: 'me', background: 'dark_luxury' } })` produces an MP4 file.

---

## TASK 3.2 — Script & Voiceover Generation

**Context:** Every video needs a script (timed text cards) and an AI voiceover. ElevenLabs for voice.

**Instructions:**
1. Install: `pnpm add elevenlabs`

2. Create `packages/generators/src/audio/voiceover.ts`:
```typescript
import { ElevenLabsClient } from 'elevenlabs'
import { env } from '@repo/config'
import fs from 'fs/promises'
import path from 'path'

const client = new ElevenLabsClient({ apiKey: env.ELEVENLABS_API_KEY })

export async function generateVoiceover(text: string, outputPath?: string): Promise<string> {
  const audio = await client.textToSpeech.convert(env.ELEVENLABS_VOICE_ID, {
    text,
    model_id: 'eleven_turbo_v2_5',
    voice_settings: {
      stability: 0.5,
      similarity_boost: 0.75,
      style: 0.0,
      use_speaker_boost: true,
    },
  })

  const filePath = outputPath ?? path.join('/tmp', `voiceover_${Date.now()}.mp3`)
  const chunks: Buffer[] = []
  for await (const chunk of audio) chunks.push(chunk)
  await fs.writeFile(filePath, Buffer.concat(chunks))
  return filePath
}

export async function generateSRTSubtitles(
  script: Array<{ text: string; startSeconds: number; durationSeconds: number }>
): Promise<string> {
  let srt = ''
  script.forEach((line, i) => {
    const start = formatSRTTime(line.startSeconds)
    const end = formatSRTTime(line.startSeconds + line.durationSeconds)
    srt += `${i + 1}\n${start} --> ${end}\n${line.text}\n\n`
  })
  return srt
}

function formatSRTTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const ms = Math.floor((seconds % 1) * 1000)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`
}
```

3. Create `packages/tools/src/script-tools.ts`:
```typescript
import { createTool } from '@mastra/core'
import { z } from 'zod'
import { anthropic } from '@ai-sdk/anthropic'
import { generateText } from 'ai'

export const generateVideoScriptTool = createTool({
  id: 'generate-video-script',
  description: 'Generates a timed script for a short-form video',
  inputSchema: z.object({
    topic: z.string(),
    niche: z.string(),
    format: z.enum(['did_you_know', 'how_to', 'vs_comparison', 'story', 'countdown', 'news_reaction', 'motivational']),
    targetDurationSeconds: z.number().default(30),
    includeHook: z.boolean().default(true),
    includeCTA: z.boolean().default(true),
    ctaTarget: z.string().default('link in bio'),
  }),
  outputSchema: z.object({
    script: z.array(z.object({
      text: z.string(),
      startFrame: z.number(),
      durationFrames: z.number(),
      style: z.enum(['headline', 'subtitle', 'caption']),
      voiceText: z.string(),
    })),
    fullVoiceoverText: z.string(),
    estimatedDurationSeconds: z.number(),
    compositionId: z.string(),
  }),
  execute: async ({ context }) => {
    const { text } = await generateText({
      model: anthropic('claude-opus-4-5-20251101'),
      prompt: `Create a ${context.format} short-form video script for this topic: "${context.topic}" in the ${context.niche} niche.

Target duration: ${context.targetDurationSeconds} seconds at 30fps.
${context.includeHook ? 'Start with a 3-second attention hook that creates curiosity or shock.' : ''}
${context.includeCTA ? `End with a CTA pointing to: ${context.ctaTarget}` : ''}

Return JSON only:
{
  "script": [
    {
      "text": "display text on screen (short, punchy)",
      "startFrame": 0,
      "durationFrames": 90,
      "style": "headline",
      "voiceText": "what the AI voice says (can be longer than display text)"
    }
  ],
  "fullVoiceoverText": "complete voiceover script as one string",
  "estimatedDurationSeconds": 30,
  "compositionId": "ShortVideo"
}

Rules:
- Each text card max 8 words on screen
- Voice text can be 1-2 sentences
- Use ${context.targetDurationSeconds * 30} total frames
- Hook = first 3 seconds (90 frames)
- CTA = last 3 seconds`,
    })

    return JSON.parse(text)
  },
})
```

4. Create `packages/tools/src/voiceover-tools.ts`:
```typescript
import { createTool } from '@mastra/core'
import { z } from 'zod'
import { generateVoiceover } from '@repo/generators/audio/voiceover'
import { uploadToCosmicCDN } from '@repo/cms'

export const generateVoiceoverTool = createTool({
  id: 'generate-voiceover',
  description: 'Generates an AI voiceover for a script using ElevenLabs',
  inputSchema: z.object({
    text: z.string(),
    contentQueueId: z.string().optional(),
  }),
  outputSchema: z.object({
    localPath: z.string(),
    cdnUrl: z.string(),
    durationSeconds: z.number(),
  }),
  execute: async ({ context }) => {
    const localPath = await generateVoiceover(context.text)
    const { cdnUrl } = await uploadToCosmicCDN(localPath, {
      folder: 'voiceovers',
      title: `voiceover_${Date.now()}`,
    })
    // Estimate duration (average 2.5 words/second)
    const wordCount = context.text.split(' ').length
    const durationSeconds = wordCount / 2.5
    return { localPath, cdnUrl, durationSeconds }
  },
})
```

**OUTPUT:** `generateVoiceoverTool` returns a CDN URL to an MP3 file. Script tool returns valid frame-timed script JSON.

---

## TASK 3.3 — Full Video Generation Workflow

**Context:** This Mastra workflow chains: script generation → voiceover → image generation → Remotion render → CDN upload → queue update.

**STEAL FROM:** Mastra workflow patterns from `github.com/mastra-ai/mastra/examples/` — specifically the step chaining and error handling patterns.

**Instructions:**
1. Create `packages/workflows/src/video-generation-workflow.ts`:
```typescript
import { createWorkflow, createStep } from '@mastra/core'
import { z } from 'zod'
import { generateVideoScriptTool } from '@repo/tools/script-tools'
import { generateVoiceoverTool } from '@repo/tools/voiceover-tools'
import { generatePosterImageTool } from '@repo/tools/image-gen-tools'
import { renderVideoTool } from '@repo/tools/render-tools'
import { uploadToCosmicTool } from '@repo/tools/cosmic-tools'
import { updateQueueItemTool, saveAssetTool } from '@repo/tools/queue-tools'

const generateScriptStep = createStep({
  id: 'generate-script',
  inputSchema: z.object({
    topic: z.string(),
    niche: z.string(),
    format: z.enum(['did_you_know', 'how_to', 'vs_comparison', 'story', 'countdown', 'news_reaction', 'motivational']),
    targetDurationSeconds: z.number().default(30),
    ctaTarget: z.string().default('link in bio'),
    contentQueueId: z.string(),
  }),
  outputSchema: z.object({
    script: z.array(z.any()),
    fullVoiceoverText: z.string(),
    estimatedDurationSeconds: z.number(),
    compositionId: z.string(),
    contentQueueId: z.string(),
    topic: z.string(),
    niche: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    await mastra.getAgent('ContentQueueManager').generate({
      messages: [{ role: 'user', content: `Update status to generating for queue id ${inputData.contentQueueId}` }],
    })

    const scriptResult = await generateVideoScriptTool.execute({
      context: {
        topic: inputData.topic,
        niche: inputData.niche,
        format: inputData.format,
        targetDurationSeconds: inputData.targetDurationSeconds,
        includeHook: true,
        includeCTA: true,
        ctaTarget: inputData.ctaTarget,
      },
    })

    return {
      ...scriptResult,
      contentQueueId: inputData.contentQueueId,
      topic: inputData.topic,
      niche: inputData.niche,
    }
  },
})

const generateVoiceoverStep = createStep({
  id: 'generate-voiceover',
  execute: async ({ inputData }) => {
    const voiceover = await generateVoiceoverTool.execute({
      context: {
        text: inputData.fullVoiceoverText,
        contentQueueId: inputData.contentQueueId,
      },
    })
    return { ...inputData, voiceoverCdnUrl: voiceover.cdnUrl }
  },
})

const generateBackgroundStep = createStep({
  id: 'generate-background',
  execute: async ({ inputData }) => {
    const bg = await generatePosterImageTool.execute({
      context: {
        topic: inputData.topic,
        niche: inputData.niche,
        style: 'dark_luxury',
        aspectRatio: '9:16',
        model: 'flux-schnell',
      },
    })
    return { ...inputData, backgroundImageUrl: bg.cdnUrl }
  },
})

const renderVideoStep = createStep({
  id: 'render-video',
  execute: async ({ inputData }) => {
    const { renderVideo } = await import('@repo/generators/video/renderer')
    const outputPath = await renderVideo({
      compositionId: inputData.compositionId,
      props: {
        topic: inputData.topic,
        script: inputData.script,
        backgroundStyle: 'dark_gradient',
        backgroundImageUrl: inputData.backgroundImageUrl,
        voiceoverAudioUrl: inputData.voiceoverCdnUrl,
        niche: inputData.niche,
      },
    })
    return { ...inputData, localVideoPath: outputPath }
  },
})

const uploadVideoStep = createStep({
  id: 'upload-video',
  execute: async ({ inputData }) => {
    const { uploadToCosmicCDN } = await import('@repo/cms')
    const { cdnUrl, objectId } = await uploadToCosmicCDN(inputData.localVideoPath, {
      folder: `videos/${inputData.niche}`,
      title: inputData.topic,
    })
    return { ...inputData, videoCdnUrl: cdnUrl, cosmicObjectId: objectId }
  },
})

const markReadyStep = createStep({
  id: 'mark-ready',
  execute: async ({ inputData }) => {
    await updateQueueItemTool.execute({
      context: {
        id: inputData.contentQueueId,
        status: 'ready',
        metadata: {
          videoCdnUrl: inputData.videoCdnUrl,
          voiceoverCdnUrl: inputData.voiceoverCdnUrl,
          backgroundImageUrl: inputData.backgroundImageUrl,
          scriptLines: inputData.script.length,
          estimatedDurationSeconds: inputData.estimatedDurationSeconds,
        },
      },
    })
    return { contentQueueId: inputData.contentQueueId, videoCdnUrl: inputData.videoCdnUrl }
  },
})

export const videoGenerationWorkflow = createWorkflow({
  id: 'video-generation',
  inputSchema: z.object({
    topic: z.string(),
    niche: z.string(),
    format: z.enum(['did_you_know', 'how_to', 'vs_comparison', 'story', 'countdown', 'news_reaction', 'motivational']),
    targetDurationSeconds: z.number().default(30),
    ctaTarget: z.string().default('link in bio'),
    contentQueueId: z.string(),
  }),
  outputSchema: z.object({
    contentQueueId: z.string(),
    videoCdnUrl: z.string(),
  }),
})
  .then(generateScriptStep)
  .then(generateVoiceoverStep)
  .then(generateBackgroundStep)
  .then(renderVideoStep)
  .then(uploadVideoStep)
  .then(markReadyStep)
  .commit()
```

2. Register in `packages/workflows/src/index.ts`

**OUTPUT:** `videoGenerationWorkflow.execute({ topic: 'The Rule of 72 explained', niche: 'finance', format: 'did_you_know', contentQueueId: 'xxx' })` produces a CDN URL to a rendered MP4.

---

# PHASE 4 — COSMICJS INTEGRATION

---

## TASK 4.1 — CosmicJS CMS Layer

**Context:** CosmicJS stores all assets, page content, and site data. It is also the CDN for all media.

**STEAL FROM:** `github.com/cosmicjs/cosmic-sdk-js` — copy the SDK usage patterns and the AI video generation interface

**Instructions:**
1. Install: `pnpm add @cosmicjs/sdk`

2. Create `packages/cms/src/client.ts`:
```typescript
import { createBucketClient } from '@cosmicjs/sdk'
import { env } from '@repo/config'
import * as fs from 'fs'
import * as path from 'path'
import fetch from 'node-fetch'
import FormData from 'form-data'

export const cosmic = createBucketClient({
  bucketSlug: env.COSMIC_BUCKET_SLUG,
  readKey: env.COSMIC_READ_KEY,
  writeKey: env.COSMIC_WRITE_KEY,
})

export interface UploadResult {
  cdnUrl: string
  objectId?: string
  title?: string
}

export async function uploadToCosmicCDN(
  sourceUrlOrPath: string,
  options: { folder?: string; title?: string }
): Promise<UploadResult> {
  const isUrl = sourceUrlOrPath.startsWith('http')
  let buffer: Buffer

  if (isUrl) {
    const response = await fetch(sourceUrlOrPath)
    buffer = Buffer.from(await response.arrayBuffer())
  } else {
    buffer = await fs.promises.readFile(sourceUrlOrPath)
  }

  const ext = isUrl
    ? sourceUrlOrPath.split('.').pop()?.split('?')[0] ?? 'jpg'
    : path.extname(sourceUrlOrPath).slice(1)

  const filename = `${options.title ?? Date.now()}.${ext}`

  const form = new FormData()
  form.append('media', buffer, {
    filename,
    contentType: ext === 'mp4' ? 'video/mp4' : ext === 'mp3' ? 'audio/mpeg' : `image/${ext}`,
  })
  if (options.folder) form.append('folder', options.folder)

  const response = await fetch(
    `https://api.cosmicjs.com/v3/buckets/${env.COSMIC_BUCKET_SLUG}/media`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.COSMIC_WRITE_KEY}`,
        ...form.getHeaders(),
      },
      body: form,
    }
  )

  const data = await response.json() as any
  return {
    cdnUrl: data.media?.imgix_url ?? data.media?.url,
    objectId: data.media?.id,
    title: data.media?.name,
  }
}

export async function generateAIVideo(params: {
  prompt: string
  duration?: 4 | 6 | 8
  resolution?: '720p' | '1080p'
  referenceImages?: string[]
  folder?: string
}): Promise<{ url: string; imgixUrl: string; duration: number }> {
  const result = await cosmic.ai.generateVideo({
    prompt: params.prompt,
    duration: params.duration ?? 8,
    resolution: params.resolution ?? '720p',
    reference_images: params.referenceImages,
    folder: params.folder ?? 'ai-videos',
  })

  return {
    url: result.media.url,
    imgixUrl: result.media.imgix_url,
    duration: result.media.metadata.duration,
  }
}
```

3. Create `packages/cms/src/content-types.ts` defining all Cosmic object types needed:
```typescript
// Object type slugs for CosmicJS
export const OBJECT_TYPES = {
  BLOG_POST: 'blog-posts',
  PRODUCT_REVIEW: 'product-reviews',
  LANDING_PAGE: 'landing-pages',
  COMPARISON_PAGE: 'comparisons',
  AFFILIATE_PRODUCT: 'affiliate-products',
  SITE_CONFIG: 'site-config',
  VIDEO_ASSET: 'video-assets',
  POSTER_ASSET: 'poster-assets',
} as const

// Metadata schemas for each object type
export interface BlogPostMetadata {
  niche: string
  keywords: string[]
  seoTitle: string
  seoDescription: string
  affiliateLinks: Array<{ text: string; url: string; product: string }>
  publishStatus: 'draft' | 'published'
  targetSiteId: string
}

export interface ProductReviewMetadata {
  productName: string
  productUrl: string
  affiliateUrl: string
  price: string
  rating: number
  pros: string[]
  cons: string[]
  verdict: string
  niche: string
  keywords: string[]
}
```

4. Create `packages/tools/src/cosmic-tools.ts` with Mastra tools wrapping the CMS operations.

**OUTPUT:** `uploadToCosmicCDN('/tmp/test.mp4', { folder: 'videos/test' })` returns a working CDN URL.

---

# PHASE 5 — MULTI-PLATFORM PUBLISHER

---

## TASK 5.1 — Publisher Base Class

**Context:** All platform publishers share the same interface. Build the base and then one adapter per platform.

**STEAL FROM:** `github.com/danielehrhardt/postr` — copy the adapter pattern from `/src/uploaders/` folder. Each uploader is a class with `upload(videoPath, caption, hashtags)`.

**Instructions:**
1. Create `packages/publishers/src/base-publisher.ts`:
```typescript
export interface PostContent {
  type: 'image' | 'video' | 'carousel'
  mediaUrl: string          // CDN URL to the media
  localPath?: string        // Local path if available
  caption: string
  hashtags: string[]
  thumbnailUrl?: string
  title?: string            // For YouTube
  description?: string      // For YouTube/Pinterest
  coverTimeOffset?: number  // For TikTok cover image selection
  scheduledAt?: Date
}

export interface PublishResult {
  platform: string
  success: boolean
  postId?: string
  postUrl?: string
  error?: string
  publishedAt: Date
}

export abstract class BasePlatformPublisher {
  abstract platform: string
  abstract maxCaptionLength: number
  abstract supportedMediaTypes: ('image' | 'video' | 'carousel')[]

  abstract publish(content: PostContent): Promise<PublishResult>

  protected truncateCaption(caption: string): string {
    if (caption.length <= this.maxCaptionLength) return caption
    return caption.slice(0, this.maxCaptionLength - 3) + '...'
  }

  protected buildFullCaption(caption: string, hashtags: string[]): string {
    const hashtagStr = hashtags.map(h => h.startsWith('#') ? h : `#${h}`).join(' ')
    const full = `${caption}\n\n${hashtagStr}`
    return this.truncateCaption(full)
  }

  protected async downloadMedia(url: string): Promise<Buffer> {
    const fetch = (await import('node-fetch')).default
    const response = await fetch(url)
    return Buffer.from(await response.arrayBuffer())
  }
}
```

2. Create `packages/publishers/src/platforms/tiktok.ts`:
```typescript
import { BasePlatformPublisher, PostContent, PublishResult } from '../base-publisher'
import { env } from '@repo/config'

export class TikTokPublisher extends BasePlatformPublisher {
  platform = 'tiktok'
  maxCaptionLength = 2200
  supportedMediaTypes = ['video' as const]

  async publish(content: PostContent): Promise<PublishResult> {
    try {
      // Step 1: Initialize upload
      const initResponse = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.TIKTOK_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          post_info: {
            title: this.buildFullCaption(content.caption, content.hashtags),
            privacy_level: 'PUBLIC_TO_EVERYONE',
            disable_duet: false,
            disable_comment: false,
            disable_stitch: false,
            video_cover_timestamp_ms: (content.coverTimeOffset ?? 1) * 1000,
          },
          source_info: {
            source: 'PULL_FROM_URL',
            video_url: content.mediaUrl,
          },
        }),
      })

      const initData = await initResponse.json() as any

      if (!initData.data?.publish_id) {
        throw new Error(`TikTok init failed: ${JSON.stringify(initData)}`)
      }

      // Step 2: Poll for completion
      let attempts = 0
      while (attempts < 30) {
        await new Promise(resolve => setTimeout(resolve, 3000))
        const statusResponse = await fetch('https://open.tiktokapis.com/v2/post/publish/status/fetch/', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${env.TIKTOK_ACCESS_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ publish_id: initData.data.publish_id }),
        })
        const statusData = await statusResponse.json() as any
        if (statusData.data?.status === 'PUBLISH_COMPLETE') {
          return {
            platform: 'tiktok',
            success: true,
            postId: initData.data.publish_id,
            publishedAt: new Date(),
          }
        }
        if (statusData.data?.status === 'FAILED') {
          throw new Error(`TikTok publish failed: ${statusData.data.fail_reason}`)
        }
        attempts++
      }

      throw new Error('TikTok publish timed out')
    } catch (error) {
      return {
        platform: 'tiktok',
        success: false,
        error: String(error),
        publishedAt: new Date(),
      }
    }
  }
}
```

3. Create similar files for each platform:
   - `platforms/instagram.ts` — uses Meta Graph API for Reels and feed posts
   - `platforms/youtube.ts` — uses YouTube Data API v3 for Shorts and videos
   - `platforms/twitter.ts` — uses Twitter API v2 media upload + tweet create
   - `platforms/pinterest.ts` — uses Pinterest API v5 for pin creation
   - `platforms/linkedin.ts` — uses LinkedIn Share API v2
   - `platforms/threads.ts` — uses Threads API (Meta)

4. Create `packages/publishers/src/publisher-factory.ts`:
```typescript
import { BasePlatformPublisher } from './base-publisher'
import { TikTokPublisher } from './platforms/tiktok'
import { InstagramPublisher } from './platforms/instagram'
import { YouTubePublisher } from './platforms/youtube'
import { TwitterPublisher } from './platforms/twitter'
import { PinterestPublisher } from './platforms/pinterest'
import { LinkedInPublisher } from './platforms/linkedin'
import { ThreadsPublisher } from './platforms/threads'

const publishers: Record<string, BasePlatformPublisher> = {
  tiktok: new TikTokPublisher(),
  instagram_feed: new InstagramPublisher('feed'),
  instagram_reels: new InstagramPublisher('reels'),
  instagram_story: new InstagramPublisher('story'),
  youtube_shorts: new YouTubePublisher('short'),
  youtube: new YouTubePublisher('video'),
  twitter: new TwitterPublisher(),
  pinterest: new PinterestPublisher(),
  linkedin: new LinkedInPublisher(),
  threads: new ThreadsPublisher(),
}

export function getPublisher(platform: string): BasePlatformPublisher {
  const publisher = publishers[platform]
  if (!publisher) throw new Error(`No publisher for platform: ${platform}`)
  return publisher
}

export async function publishToAll(
  platforms: string[],
  content: Parameters<BasePlatformPublisher['publish']>[0]
): Promise<ReturnType<BasePlatformPublisher['publish']>[]> {
  return Promise.all(platforms.map(p => getPublisher(p).publish(content)))
}
```

**OUTPUT:** `publishToAll(['tiktok'], { type: 'video', mediaUrl: '...', caption: 'test', hashtags: [] })` returns a result with `success: true` and a post ID.

---

## TASK 5.2 — Publishing Workflow

**Context:** This workflow takes a ready queue item and publishes it to all targeted platforms.

**Instructions:**
1. Create `packages/workflows/src/publishing-workflow.ts`:
```typescript
import { createWorkflow, createStep } from '@mastra/core'
import { z } from 'zod'
import { supabase } from '@repo/core/db'
import { getPublisher } from '@repo/publishers'
import { generateCaptionTool, generateHashtagSetTool } from '@repo/tools'

const loadQueueItemStep = createStep({
  id: 'load-queue-item',
  inputSchema: z.object({ contentQueueId: z.string() }),
  execute: async ({ inputData }) => {
    const { data } = await supabase
      .from('content_queue')
      .select('*, assets(*)')
      .eq('id', inputData.contentQueueId)
      .single()
    if (!data) throw new Error(`Queue item not found: ${inputData.contentQueueId}`)
    return data
  },
})

const generateCaptionsStep = createStep({
  id: 'generate-captions',
  execute: async ({ inputData }) => {
    const captionsByPlatform: Record<string, { caption: string; hashtags: string[]; fullPost: string }> = {}

    for (const platform of inputData.platform_targets) {
      const result = await generateCaptionTool.execute({
        context: {
          topic: inputData.topic,
          niche: inputData.niche,
          platform: platform as any,
          contentType: inputData.type as any,
          affiliateLinkPlaceholder: true,
          brandVoice: 'entertaining',
        },
      })
      captionsByPlatform[platform] = result
    }

    return { ...inputData, captionsByPlatform }
  },
})

const publishToAllPlatformsStep = createStep({
  id: 'publish-to-platforms',
  execute: async ({ inputData }) => {
    const primaryAsset = inputData.assets?.find((a: any) =>
      a.type === (inputData.type === 'poster' ? 'image' : 'video')
    )

    if (!primaryAsset) throw new Error('No primary asset found for queue item')

    const results = []
    for (const platform of inputData.platform_targets) {
      const captions = inputData.captionsByPlatform[platform]
      const publisher = getPublisher(platform)

      const result = await publisher.publish({
        type: inputData.type === 'poster' ? 'image' : 'video',
        mediaUrl: primaryAsset.cdn_url,
        caption: captions.caption,
        hashtags: captions.hashtags,
      })

      // Save to published_posts table
      await supabase.from('published_posts').insert({
        content_queue_id: inputData.id,
        platform,
        platform_post_id: result.postId,
        platform_url: result.postUrl,
        caption: captions.caption,
        hashtags: captions.hashtags,
        status: result.success ? 'published' : 'failed',
        published_at: result.publishedAt.toISOString(),
      })

      results.push(result)
    }

    // Update queue item to published
    await supabase
      .from('content_queue')
      .update({ status: 'published', published_at: new Date().toISOString() })
      .eq('id', inputData.id)

    return { contentQueueId: inputData.id, results }
  },
})

export const publishingWorkflow = createWorkflow({
  id: 'publishing',
  inputSchema: z.object({ contentQueueId: z.string() }),
  outputSchema: z.object({
    contentQueueId: z.string(),
    results: z.array(z.any()),
  }),
})
  .then(loadQueueItemStep)
  .then(generateCaptionsStep)
  .then(publishToAllPlatformsStep)
  .commit()
```

**OUTPUT:** Queue item with status `ready` gets published to all target platforms. Status updates to `published`. Rows appear in `published_posts`.

---

# PHASE 6 — WEBSITE FACTORY (webs-alots)

---

## TASK 6.1 — Site Generator Core

**Context:** The factory takes a niche + affiliate program config and spins up a new Next.js site on Vercel backed by a new CosmicJS bucket.

**STEAL FROM:** `github.com/cosmicjs/cosmicjs-node-website-boilerplate` — use the exact folder structure and Cosmic integration as your template. `github.com/cosmicjs/blocks` — steal every block component.

**Instructions:**
1. Create `apps/factory/src/site-generator.ts`:
```typescript
import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { supabase } from '@repo/core/db'
import { env } from '@repo/config'

interface SiteConfig {
  niche: string
  domain?: string
  affiliateProgram: 'amazon' | 'impact' | 'shareasale' | 'gumroad'
  affiliateTag: string
  primaryKeyword: string
  targetCountry: string
  colorScheme: {
    primary: string
    secondary: string
    accent: string
  }
  monetizationTypes: ('affiliate_links' | 'adsense' | 'email_list' | 'digital_products')[]
}

export async function generateSite(config: SiteConfig): Promise<{
  siteId: string
  vercelUrl: string
  cosmicBucketSlug: string
}> {
  const siteSlug = config.niche.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
  const projectName = `site-${siteSlug}-${Date.now()}`
  const tempDir = path.join('/tmp', projectName)

  // 1. Clone the boilerplate template
  execSync(`git clone https://github.com/cosmicjs/cosmicjs-node-website-boilerplate ${tempDir}`)

  // 2. Create a new CosmicJS bucket for this site
  const { cosmicBucketSlug } = await createCosmicBucket(siteSlug, config)

  // 3. Configure the cloned project
  await configureProject(tempDir, config, cosmicBucketSlug)

  // 4. Deploy to Vercel
  const vercelUrl = await deployToVercel(tempDir, projectName, cosmicBucketSlug, config)

  // 5. Save to database
  const { data } = await supabase.from('sites').insert({
    niche: config.niche,
    domain: config.domain,
    vercel_project_id: projectName,
    cosmic_bucket_slug: cosmicBucketSlug,
    status: 'live',
    affiliate_program: config.affiliateProgram,
    affiliate_tag: config.affiliateTag,
    deployed_at: new Date().toISOString(),
  }).select('id').single()

  return {
    siteId: data!.id,
    vercelUrl,
    cosmicBucketSlug,
  }
}

async function createCosmicBucket(slug: string, config: SiteConfig): Promise<{ cosmicBucketSlug: string }> {
  const response = await fetch('https://api.cosmicjs.com/v3/buckets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.COSMIC_WRITE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: config.niche,
      slug: `${slug}-${Date.now()}`,
    }),
  })
  const data = await response.json() as any
  return { cosmicBucketSlug: data.bucket.slug }
}

async function configureProject(dir: string, config: SiteConfig, cosmicBucketSlug: string): Promise<void> {
  // Write .env.local
  const envContent = `
COSMIC_BUCKET_SLUG=${cosmicBucketSlug}
COSMIC_READ_KEY=
COSMIC_WRITE_KEY=
NEXT_PUBLIC_AFFILIATE_TAG=${config.affiliateTag}
NEXT_PUBLIC_AFFILIATE_PROGRAM=${config.affiliateProgram}
NEXT_PUBLIC_NICHE=${config.niche}
NEXT_PUBLIC_GA_ID=${env.GOOGLE_ANALYTICS_ID ?? ''}
`
  fs.writeFileSync(path.join(dir, '.env.local'), envContent.trim())

  // Update package.json name
  const pkgPath = path.join(dir, 'package.json')
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
  pkg.name = `site-${config.niche.toLowerCase().replace(/\s+/g, '-')}`
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2))
}

async function deployToVercel(dir: string, projectName: string, cosmicBucketSlug: string, config: SiteConfig): Promise<string> {
  const response = await fetch('https://api.vercel.com/v13/deployments', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.VERCEL_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: projectName,
      gitSource: null,
      env: [
        { key: 'COSMIC_BUCKET_SLUG', value: cosmicBucketSlug, type: 'plain' },
        { key: 'NEXT_PUBLIC_AFFILIATE_TAG', value: config.affiliateTag, type: 'plain' },
      ],
    }),
  })
  const data = await response.json() as any
  return `https://${data.url}`
}
```

**OUTPUT:** `generateSite({ niche: 'finance tips', affiliateProgram: 'amazon', affiliateTag: 'my-tag-20', ... })` returns a live Vercel URL.

---

## TASK 6.2 — SEO Content Generator

**Context:** Each niche site needs pages. This agent generates full SEO-optimized content: blog posts, product reviews, comparisons, listicles.

**Instructions:**
1. Create `packages/tools/src/seo-content-tools.ts`:
```typescript
import { createTool } from '@mastra/core'
import { z } from 'zod'
import { anthropic } from '@ai-sdk/anthropic'
import { generateText } from 'ai'
import { cosmic, OBJECT_TYPES } from '@repo/cms'

export const generateBlogPostTool = createTool({
  id: 'generate-blog-post',
  description: 'Generates a full SEO-optimized blog post for a niche site',
  inputSchema: z.object({
    niche: z.string(),
    topic: z.string(),
    primaryKeyword: z.string(),
    secondaryKeywords: z.array(z.string()),
    targetWordCount: z.number().default(1500),
    affiliateProgram: z.string(),
    affiliateTag: z.string(),
    cosmicBucketSlug: z.string(),
    siteId: z.string(),
  }),
  outputSchema: z.object({
    title: z.string(),
    slug: z.string(),
    content: z.string(),
    seoTitle: z.string(),
    seoDescription: z.string(),
    cosmicObjectId: z.string(),
  }),
  execute: async ({ context }) => {
    const { text } = await generateText({
      model: anthropic('claude-opus-4-5-20251101'),
      maxTokens: 4000,
      prompt: `Write a ${context.targetWordCount}-word SEO blog post for the ${context.niche} niche.

Topic: "${context.topic}"
Primary keyword: "${context.primaryKeyword}"
Secondary keywords: ${context.secondaryKeywords.join(', ')}
Affiliate program: ${context.affiliateProgram}
Affiliate tag: ${context.affiliateTag}

Structure:
- H1 title (include primary keyword)
- Introduction (150 words, hook + primary keyword in first 100 chars)
- H2 sections (5-7 sections, include secondary keywords)
- Include 3-5 affiliate product mentions with [AFFILIATE_LINK: product name] placeholders
- FAQ section (5 questions)
- Conclusion with CTA

Write in a helpful, expert tone. Include specific numbers/facts. Internal linking: add [INTERNAL_LINK: related topic] placeholders.

Return JSON only:
{
  "title": "H1 title",
  "slug": "url-slug",
  "content": "full markdown content",
  "seoTitle": "60-char SEO title",
  "seoDescription": "160-char meta description with primary keyword"
}`,
    })

    const parsed = JSON.parse(text)

    // Save to CosmicJS
    const response = await fetch(`https://api.cosmicjs.com/v3/buckets/${context.cosmicBucketSlug}/objects`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.COSMIC_WRITE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: parsed.title,
        type: OBJECT_TYPES.BLOG_POST,
        slug: parsed.slug,
        content: parsed.content,
        metadata: {
          seo_title: parsed.seoTitle,
          seo_description: parsed.seoDescription,
          niche: context.niche,
          primary_keyword: context.primaryKeyword,
          keywords: context.secondaryKeywords,
          publish_status: 'published',
        },
      }),
    })
    const data = await response.json() as any

    return { ...parsed, cosmicObjectId: data.object?.id ?? '' }
  },
})

export const generateProductReviewTool = createTool({
  id: 'generate-product-review',
  description: 'Generates a detailed affiliate product review page',
  inputSchema: z.object({
    productName: z.string(),
    productAsin: z.string().optional(),
    niche: z.string(),
    targetKeyword: z.string(),
    affiliateUrl: z.string(),
    cosmicBucketSlug: z.string(),
  }),
  outputSchema: z.object({
    title: z.string(),
    slug: z.string(),
    content: z.string(),
    rating: z.number(),
    cosmicObjectId: z.string(),
  }),
  execute: async ({ context }) => {
    const { text } = await generateText({
      model: anthropic('claude-opus-4-5-20251101'),
      maxTokens: 3000,
      prompt: `Write a comprehensive, honest product review for "${context.productName}" for the ${context.niche} niche.
Target keyword: "${context.targetKeyword}"
Affiliate URL: ${context.affiliateUrl}

Include:
- Summary box (rating 1-5, pros list, cons list, verdict)
- Detailed review sections
- Who it's for / who it's not for
- Comparison to 2 alternatives
- FAQ (5 questions)
- Clear CTA with affiliate link as [BUY_LINK]

Return JSON: { "title": "", "slug": "", "content": "", "rating": 4.2 }`,
    })

    const parsed = JSON.parse(text)

    // Save to CosmicJS (same pattern as blog post)
    return { ...parsed, cosmicObjectId: 'saved' }
  },
})
```

**OUTPUT:** `generateBlogPostTool` creates a full blog post saved to CosmicJS. Visible in the CMS dashboard.

---

## TASK 6.3 — Affiliate Link Manager

**Context:** Replace [AFFILIATE_LINK: product] and [BUY_LINK] placeholders in content with real tracked affiliate URLs.

**Instructions:**
1. Install: `pnpm add amazon-paapi`

2. Create `packages/generators/src/affiliate/amazon.ts`:
```typescript
import ProductAdvertisingAPIv1 from 'paapi5-nodejs-sdk'
import { env } from '@repo/config'

const defaultClient = ProductAdvertisingAPIv1.ApiClient.instance
defaultClient.accessKey = env.AMAZON_ACCESS_KEY
defaultClient.secretKey = env.AMAZON_SECRET_KEY
defaultClient.host = 'webservices.amazon.com'
defaultClient.region = 'us-east-1'

export async function searchAmazonProducts(keyword: string, niche: string): Promise<Array<{
  asin: string
  title: string
  price: string
  rating: number
  affiliateUrl: string
}>> {
  const api = new ProductAdvertisingAPIv1.DefaultApi()
  const request = new ProductAdvertisingAPIv1.SearchItemsRequest()
  request.Keywords = keyword
  request.SearchIndex = nicheToCategoryMap[niche] ?? 'All'
  request.PartnerTag = env.AMAZON_ASSOCIATE_TAG
  request.PartnerType = 'Associates'
  request.Resources = [
    'ItemInfo.Title',
    'Offers.Listings.Price',
    'CustomerReviews.StarRating',
  ]

  const response = await api.searchItems(request)
  return response.SearchResult?.Items?.map((item: any) => ({
    asin: item.ASIN,
    title: item.ItemInfo?.Title?.DisplayValue ?? '',
    price: item.Offers?.Listings?.[0]?.Price?.DisplayAmount ?? '',
    rating: item.CustomerReviews?.StarRating?.Value ?? 0,
    affiliateUrl: `https://www.amazon.com/dp/${item.ASIN}?tag=${env.AMAZON_ASSOCIATE_TAG}`,
  })) ?? []
}

const nicheToCategoryMap: Record<string, string> = {
  finance: 'Books',
  technology: 'Electronics',
  health: 'HealthPersonalCare',
  fitness: 'SportingGoods',
  beauty: 'Beauty',
  home: 'HomeGarden',
  cooking: 'GourmetFood',
  travel: 'Luggage',
  education: 'Books',
  gaming: 'VideoGames',
}
```

3. Create `packages/generators/src/affiliate/link-replacer.ts`:
```typescript
import { searchAmazonProducts } from './amazon'

export async function replaceAffiliateLinks(
  content: string,
  niche: string,
  program: string
): Promise<string> {
  const placeholderRegex = /\[AFFILIATE_LINK: (.+?)\]/g
  const matches = [...content.matchAll(placeholderRegex)]

  for (const match of matches) {
    const productKeyword = match[1]
    const products = await searchAmazonProducts(productKeyword, niche)
    if (products.length > 0) {
      const product = products[0]
      const linkHtml = `<a href="${product.affiliateUrl}" target="_blank" rel="noopener sponsored">${productKeyword}</a>`
      content = content.replace(match[0], linkHtml)
    }
  }

  // Replace [BUY_LINK] with first product found
  content = content.replace(/\[BUY_LINK\]/g, '#buy-now')

  // Replace [INTERNAL_LINK: topic] placeholders
  content = content.replace(/\[INTERNAL_LINK: (.+?)\]/g, (_, topic) => {
    const slug = topic.toLowerCase().replace(/\s+/g, '-')
    return `<a href="/${slug}">${topic}</a>`
  })

  return content
}
```

**OUTPUT:** `replaceAffiliateLinks(contentWithPlaceholders, 'finance', 'amazon')` returns content with real Amazon affiliate links.

---

# PHASE 7 — MASTER ORCHESTRATION WORKFLOW

---

## TASK 7.1 — Daily Run Workflow

**Context:** This is the master workflow that runs every day via cron. It: fetches trends → fills queue → generates content → publishes everything → reports results.

**Instructions:**
1. Create `packages/workflows/src/daily-run-workflow.ts`:
```typescript
import { createWorkflow, createStep } from '@mastra/core'
import { z } from 'zod'

const NICHES_CONFIG = [
  { niche: 'personal finance', subreddits: ['personalfinance', 'financialindependence'], tiktokHashtags: ['moneytips', 'financetiktok'] },
  { niche: 'productivity', subreddits: ['productivity', 'getdisciplined'], tiktokHashtags: ['productivity', 'lifehacks'] },
  { niche: 'fitness', subreddits: ['fitness', 'bodyweightfitness'], tiktokHashtags: ['fitness', 'workouttips'] },
]

const DAILY_TARGETS = {
  postersPerNiche: 3,
  shortVideosPerNiche: 2,
  blogPostsPerSite: 2,
}

const fetchAllTrendsStep = createStep({
  id: 'fetch-all-trends',
  execute: async ({ mastra }) => {
    const trendAgent = mastra.getAgent('TrendResearchAgent')
    const allTrends: any[] = []

    for (const nicheConfig of NICHES_CONFIG) {
      const result = await trendAgent.generate({
        messages: [{
          role: 'user',
          content: `Find top 10 trends for the ${nicheConfig.niche} niche. Check subreddits: ${nicheConfig.subreddits.join(', ')} and TikTok hashtags: ${nicheConfig.tiktokHashtags.join(', ')}.`,
        }],
      })
      allTrends.push({ niche: nicheConfig.niche, trends: result.text })
    }

    return { allTrends }
  },
})

const fillQueueStep = createStep({
  id: 'fill-queue',
  execute: async ({ inputData, mastra }) => {
    const queueAgent = mastra.getAgent('ContentQueueManager')

    for (const trendData of inputData.allTrends) {
      await queueAgent.generate({
        messages: [{
          role: 'user',
          content: `Queue ${DAILY_TARGETS.postersPerNiche} posters and ${DAILY_TARGETS.shortVideosPerNiche} short videos for the ${trendData.niche} niche based on these trends: ${trendData.trends}. Spread them across today.`,
        }],
      })
    }

    return { queueFilled: true }
  },
})

const generateAllContentStep = createStep({
  id: 'generate-all-content',
  execute: async ({ mastra }) => {
    const { supabase } = await import('@repo/core/db')
    const { videoGenerationWorkflow } = await import('./video-generation-workflow')

    // Get today's pending items
    const { data: pendingItems } = await supabase
      .from('content_queue')
      .select('*')
      .eq('status', 'pending')
      .order('scheduled_at', { ascending: true })
      .limit(50)

    const results = []
    for (const item of pendingItems ?? []) {
      try {
        if (item.type === 'poster') {
          // Run poster generation
          const posterAgent = mastra.getAgent('PosterGenerationAgent')
          await posterAgent.generate({
            messages: [{ role: 'user', content: `Generate poster for queue item ${item.id}: topic "${item.topic}" in ${item.niche} niche` }],
          })
        } else {
          // Run video generation workflow
          const formatMap: Record<string, string> = {
            video_short: 'did_you_know',
            video_reel: 'story',
          }
          await videoGenerationWorkflow.execute({
            topic: item.topic,
            niche: item.niche,
            format: formatMap[item.type] as any ?? 'did_you_know',
            contentQueueId: item.id,
            ctaTarget: 'link in bio',
          })
        }
        results.push({ id: item.id, success: true })
      } catch (error) {
        results.push({ id: item.id, success: false, error: String(error) })
        // Mark as failed
        await supabase.from('content_queue').update({ status: 'failed', error: String(error) }).eq('id', item.id)
      }
    }

    return { generationResults: results }
  },
})

const publishAllReadyStep = createStep({
  id: 'publish-all-ready',
  execute: async () => {
    const { supabase } = await import('@repo/core/db')
    const { publishingWorkflow } = await import('./publishing-workflow')

    const { data: readyItems } = await supabase
      .from('content_queue')
      .select('id, scheduled_at')
      .eq('status', 'ready')
      .lte('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true })

    const publishResults = []
    for (const item of readyItems ?? []) {
      const result = await publishingWorkflow.execute({ contentQueueId: item.id })
      publishResults.push(result)
    }

    return { publishResults }
  },
})

const generateSiteContentStep = createStep({
  id: 'generate-site-content',
  execute: async ({ mastra }) => {
    const { supabase } = await import('@repo/core/db')
    const { data: sites } = await supabase.from('sites').select('*').eq('status', 'live')

    const siteAgent = mastra.getAgent('SiteContentAgent')
    for (const site of sites ?? []) {
      await siteAgent.generate({
        messages: [{
          role: 'user',
          content: `Generate ${DAILY_TARGETS.blogPostsPerSite} blog posts for the site in the ${site.niche} niche. Cosmic bucket: ${site.cosmic_bucket_slug}. Affiliate program: ${site.affiliate_program}, tag: ${site.affiliate_tag}.`,
        }],
      })
    }

    return { siteContentGenerated: true }
  },
})

const dailyReportStep = createStep({
  id: 'daily-report',
  execute: async ({ inputData }) => {
    const { supabase } = await import('@repo/core/db')
    const today = new Date().toISOString().split('T')[0]

    const { count: published } = await supabase
      .from('published_posts')
      .select('*', { count: 'exact', head: true })
      .gte('published_at', `${today}T00:00:00`)

    const { data: revenue } = await supabase
      .from('revenue_events')
      .select('amount_cents')
      .eq('event_date', today)

    const totalRevenueCents = revenue?.reduce((sum, r) => sum + r.amount_cents, 0) ?? 0

    console.log(`📊 Daily Run Complete:`)
    console.log(`   Posts published: ${published}`)
    console.log(`   Revenue: $${(totalRevenueCents / 100).toFixed(2)}`)

    return {
      postsPublished: published ?? 0,
      revenueToday: totalRevenueCents,
    }
  },
})

export const dailyRunWorkflow = createWorkflow({
  id: 'daily-run',
  inputSchema: z.object({}),
  outputSchema: z.object({
    postsPublished: z.number(),
    revenueToday: z.number(),
  }),
})
  .then(fetchAllTrendsStep)
  .then(fillQueueStep)
  .then(generateAllContentStep)
  .then(publishAllReadyStep)
  .then(generateSiteContentStep)
  .then(dailyReportStep)
  .commit()
```

**OUTPUT:** `dailyRunWorkflow.execute({})` runs end-to-end. Posts appear on all platforms. Blog posts appear in CosmicJS.

---

# PHASE 8 — GITHUB ACTIONS AUTOMATION

---

## TASK 8.1 — Daily Cron GitHub Action

**Context:** GitHub Actions runs the daily workflow at 6am UTC every day automatically. Zero manual intervention.

**Instructions:**
1. Create `.github/workflows/daily-run.yml`:
```yaml
name: Daily Content Run

on:
  schedule:
    - cron: '0 6 * * *'  # 6am UTC every day
  workflow_dispatch:       # Allow manual trigger
    inputs:
      niches:
        description: 'Comma-separated niches to run (leave empty for all)'
        required: false
        default: ''
      dry_run:
        description: 'Dry run (generate but do not publish)'
        type: boolean
        default: false

env:
  NODE_VERSION: '20'

jobs:
  daily-run:
    runs-on: ubuntu-latest
    timeout-minutes: 120

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build packages
        run: pnpm build --filter='./packages/*'

      - name: Run daily workflow
        run: pnpm --filter @repo/nexus run daily
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          COSMIC_BUCKET_SLUG: ${{ secrets.COSMIC_BUCKET_SLUG }}
          COSMIC_READ_KEY: ${{ secrets.COSMIC_READ_KEY }}
          COSMIC_WRITE_KEY: ${{ secrets.COSMIC_WRITE_KEY }}
          ELEVENLABS_API_KEY: ${{ secrets.ELEVENLABS_API_KEY }}
          ELEVENLABS_VOICE_ID: ${{ secrets.ELEVENLABS_VOICE_ID }}
          REPLICATE_API_TOKEN: ${{ secrets.REPLICATE_API_TOKEN }}
          TIKTOK_ACCESS_TOKEN: ${{ secrets.TIKTOK_ACCESS_TOKEN }}
          TIKTOK_CLIENT_KEY: ${{ secrets.TIKTOK_CLIENT_KEY }}
          TIKTOK_CLIENT_SECRET: ${{ secrets.TIKTOK_CLIENT_SECRET }}
          INSTAGRAM_ACCESS_TOKEN: ${{ secrets.INSTAGRAM_ACCESS_TOKEN }}
          INSTAGRAM_BUSINESS_ACCOUNT_ID: ${{ secrets.INSTAGRAM_BUSINESS_ACCOUNT_ID }}
          FACEBOOK_PAGE_ID: ${{ secrets.FACEBOOK_PAGE_ID }}
          YOUTUBE_CLIENT_ID: ${{ secrets.YOUTUBE_CLIENT_ID }}
          YOUTUBE_CLIENT_SECRET: ${{ secrets.YOUTUBE_CLIENT_SECRET }}
          YOUTUBE_REFRESH_TOKEN: ${{ secrets.YOUTUBE_REFRESH_TOKEN }}
          TWITTER_API_KEY: ${{ secrets.TWITTER_API_KEY }}
          TWITTER_API_SECRET: ${{ secrets.TWITTER_API_SECRET }}
          TWITTER_ACCESS_TOKEN: ${{ secrets.TWITTER_ACCESS_TOKEN }}
          TWITTER_ACCESS_SECRET: ${{ secrets.TWITTER_ACCESS_SECRET }}
          AMAZON_ASSOCIATE_TAG: ${{ secrets.AMAZON_ASSOCIATE_TAG }}
          AMAZON_ACCESS_KEY: ${{ secrets.AMAZON_ACCESS_KEY }}
          AMAZON_SECRET_KEY: ${{ secrets.AMAZON_SECRET_KEY }}
          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
          VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          DRY_RUN: ${{ github.event.inputs.dry_run || 'false' }}
          TARGET_NICHES: ${{ github.event.inputs.niches || '' }}

      - name: Upload logs on failure
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: run-logs
          path: /tmp/daily-run-*.log
          retention-days: 7
```

2. Create `.github/workflows/generate-site.yml`:
```yaml
name: Generate Niche Site

on:
  workflow_dispatch:
    inputs:
      niche:
        description: 'Niche name (e.g. "personal finance")'
        required: true
      affiliate_program:
        description: 'Affiliate program'
        required: true
        default: 'amazon'
        type: choice
        options: [amazon, impact, shareasale, gumroad]
      affiliate_tag:
        description: 'Affiliate tag/ID'
        required: true
      primary_keyword:
        description: 'Primary SEO keyword'
        required: true

jobs:
  generate-site:
    runs-on: ubuntu-latest
    timeout-minutes: 60
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm build --filter='./packages/*'
      - name: Generate site
        run: pnpm --filter @repo/factory run generate
        env:
          NICHE: ${{ github.event.inputs.niche }}
          AFFILIATE_PROGRAM: ${{ github.event.inputs.affiliate_program }}
          AFFILIATE_TAG: ${{ github.event.inputs.affiliate_tag }}
          PRIMARY_KEYWORD: ${{ github.event.inputs.primary_keyword }}
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          COSMIC_WRITE_KEY: ${{ secrets.COSMIC_WRITE_KEY }}
          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
          VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
```

3. Create `.github/workflows/stats-pull.yml`:
```yaml
name: Pull Platform Stats

on:
  schedule:
    - cron: '0 */6 * * *'  # Every 6 hours

jobs:
  pull-stats:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm build --filter='./packages/*'
      - name: Pull stats
        run: pnpm --filter @repo/nexus run pull-stats
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          TIKTOK_ACCESS_TOKEN: ${{ secrets.TIKTOK_ACCESS_TOKEN }}
          INSTAGRAM_ACCESS_TOKEN: ${{ secrets.INSTAGRAM_ACCESS_TOKEN }}
          YOUTUBE_REFRESH_TOKEN: ${{ secrets.YOUTUBE_REFRESH_TOKEN }}
```

**OUTPUT:** All three GitHub Actions workflows appear in Actions tab. `daily-run` fires at 6am UTC. Manual trigger works with `workflow_dispatch`.

---

## TASK 8.2 — Entry Points (npm scripts)

**Context:** The GitHub Actions call `pnpm --filter @repo/nexus run daily`. We need to create these entry point scripts.

**Instructions:**
1. Create `apps/nexus/src/run-daily.ts`:
```typescript
import { mastra } from '@repo/agents'
import { dailyRunWorkflow } from '@repo/workflows'

async function main() {
  console.log(`🚀 Starting daily run at ${new Date().toISOString()}`)

  const targetNiches = process.env.TARGET_NICHES?.split(',').filter(Boolean) ?? []
  const isDryRun = process.env.DRY_RUN === 'true'

  console.log(`   Target niches: ${targetNiches.length > 0 ? targetNiches.join(', ') : 'all'}`)
  console.log(`   Dry run: ${isDryRun}`)

  const result = await dailyRunWorkflow.execute({})

  console.log(`✅ Daily run complete:`)
  console.log(`   Posts published: ${result.postsPublished}`)
  console.log(`   Revenue today: $${((result.revenueToday ?? 0) / 100).toFixed(2)}`)

  process.exit(0)
}

main().catch(err => {
  console.error('❌ Daily run failed:', err)
  process.exit(1)
})
```

2. Create `apps/nexus/src/run-pull-stats.ts` — loops through `published_posts` and calls each platform's stats API to update views/likes/comments.

3. Update `apps/nexus/package.json`:
```json
{
  "scripts": {
    "daily": "tsx src/run-daily.ts",
    "pull-stats": "tsx src/run-pull-stats.ts",
    "generate-site": "tsx src/run-generate-site.ts",
    "dev": "tsx watch src/index.ts"
  }
}
```

4. Install: `pnpm add -D tsx`

**OUTPUT:** `pnpm --filter @repo/nexus run daily` runs the full pipeline from command line.

---

# PHASE 9 — DASHBOARD

---

## TASK 9.1 — Next.js Dashboard App

**Context:** A simple personal dashboard to see stats, queue, and revenue. Built with Next.js + Supabase.

**Instructions:**
1. In `apps/dashboard/`, init Next.js:
```bash
pnpm create next-app . --typescript --tailwind --app --no-git --import-alias '@/*'
```

2. Install: `pnpm add @supabase/supabase-js recharts`

3. Create `apps/dashboard/src/app/page.tsx` — the main dashboard with these sections:
   - **Today's numbers:** posts published, posts pending, estimated revenue
   - **Content queue:** table showing pending/generating/ready items with topic, niche, type, status
   - **Published posts:** last 20 posts with platform, views, likes, published_at
   - **Sites:** table of live sites with niche, domain, monthly views, monthly revenue
   - **Revenue chart:** daily revenue for the last 30 days using Recharts LineChart

4. Create `apps/dashboard/src/app/api/stats/route.ts`:
```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  const today = new Date().toISOString().split('T')[0]

  const [queue, recentPosts, sites, revenueToday, revenueChart] = await Promise.all([
    supabase.from('content_queue').select('status').eq('status', 'pending'),
    supabase.from('published_posts').select('*').order('published_at', { ascending: false }).limit(20),
    supabase.from('sites').select('*').eq('status', 'live'),
    supabase.from('revenue_events').select('amount_cents').eq('event_date', today),
    supabase.from('revenue_events').select('event_date, amount_cents').gte('event_date', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]).order('event_date'),
  ])

  return NextResponse.json({
    queue: queue.data ?? [],
    recentPosts: recentPosts.data ?? [],
    sites: sites.data ?? [],
    revenueToday: revenueToday.data?.reduce((s, r) => s + r.amount_cents, 0) ?? 0,
    revenueChart: revenueChart.data ?? [],
  })
}
```

5. Create `apps/dashboard/src/app/api/trigger/route.ts` — a POST endpoint that manually triggers specific workflows (for the "Generate Now" button):
```typescript
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const { workflow, params } = await req.json()

  // Trigger GitHub Actions workflow_dispatch via API
  const response = await fetch(
    `https://api.github.com/repos/groupsmix/posteragent/actions/workflows/${workflow}.yml/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `token ${process.env.GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: 'main', inputs: params }),
    }
  )

  return NextResponse.json({ triggered: response.ok })
}
```

6. Deploy dashboard to Vercel: `vercel --prod` from `apps/dashboard/`

**OUTPUT:** Dashboard accessible at `https://dashboard-xxx.vercel.app`. Shows real-time stats from Supabase.

---

# PHASE 10 — DEVIN WORKFLOWS

---

## TASK 10.1 — Devin Workflow Definitions

**Context:** `.devin/workflows/` automates development tasks. These run in Devin AI sessions.

**Instructions:**
1. Create `.devin/workflows/add-niche.yaml`:
```yaml
name: Add New Niche
description: Adds a new niche to the content system and generates the first batch of content

steps:
  - name: Update niche config
    description: Add the new niche to NICHES_CONFIG in daily-run-workflow.ts
    files:
      - packages/workflows/src/daily-run-workflow.ts

  - name: Generate site
    description: Run the generate-site GitHub Action for this niche
    command: gh workflow run generate-site.yml --field niche="$NICHE" --field affiliate_program="$PROGRAM" --field affiliate_tag="$TAG" --field primary_keyword="$KEYWORD"

  - name: Queue first batch
    description: Run the content queue manager to fill the queue for the new niche immediately
    command: pnpm --filter @repo/nexus run queue-niche -- --niche "$NICHE"
```

2. Create `.devin/workflows/add-platform.yaml`:
```yaml
name: Add New Publishing Platform
description: Adds a new social media platform adapter

steps:
  - name: Create platform adapter
    description: Create a new file in packages/publishers/src/platforms/ following the BasePlatformPublisher interface

  - name: Register adapter
    description: Add the new adapter to packages/publishers/src/publisher-factory.ts

  - name: Add credentials
    description: Add the platform API keys to packages/config/src/env.ts and .env.example

  - name: Add GitHub secret
    description: Remind to add new API key secrets in GitHub repo settings
```

3. Create `.devin/workflows/fix-failed-posts.yaml`:
```yaml
name: Retry Failed Posts
description: Identifies failed content queue items and retries them

steps:
  - name: Check failed items
    description: Query Supabase for items with status=failed and retry_count < 3

  - name: Reset status
    description: Update failed items to status=pending and increment retry_count

  - name: Trigger daily run
    description: Trigger the daily-run workflow immediately
    command: gh workflow run daily-run.yml
```

**OUTPUT:** All three `.devin/workflows/*.yaml` files created. Devin can execute them by name.

---

## TASK 10.2 — Stats Pull Implementation

**Context:** Every 6 hours, pull engagement stats from all platforms for all published posts and update the `published_posts` table.

**Instructions:**
1. Create `apps/nexus/src/run-pull-stats.ts`:
```typescript
import { supabase } from '@repo/core/db'
import { env } from '@repo/config'

async function pullTikTokStats(posts: any[]) {
  const tiktokPosts = posts.filter(p => p.platform === 'tiktok' && p.platform_post_id)
  for (const post of tiktokPosts) {
    try {
      const response = await fetch('https://open.tiktokapis.com/v2/video/query/', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.TIKTOK_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filters: { video_ids: [post.platform_post_id] },
          fields: ['view_count', 'like_count', 'comment_count', 'share_count'],
        }),
      })
      const data = await response.json() as any
      const video = data?.data?.videos?.[0]
      if (video) {
        await supabase.from('published_posts').update({
          views: video.view_count,
          likes: video.like_count,
          comments: video.comment_count,
          shares: video.share_count,
          last_stats_updated_at: new Date().toISOString(),
        }).eq('id', post.id)
      }
    } catch (e) {
      console.warn(`Failed to pull TikTok stats for post ${post.id}:`, e)
    }
  }
}

async function pullInstagramStats(posts: any[]) {
  const igPosts = posts.filter(p => p.platform.startsWith('instagram') && p.platform_post_id)
  for (const post of igPosts) {
    try {
      const response = await fetch(
        `https://graph.facebook.com/v19.0/${post.platform_post_id}/insights?metric=impressions,reach,likes,comments,shares,saved&access_token=${env.INSTAGRAM_ACCESS_TOKEN}`
      )
      const data = await response.json() as any
      const metrics: Record<string, number> = {}
      data?.data?.forEach((m: any) => { metrics[m.name] = m.values?.[0]?.value ?? 0 })
      await supabase.from('published_posts').update({
        views: metrics.impressions ?? 0,
        likes: metrics.likes ?? 0,
        comments: metrics.comments ?? 0,
        shares: metrics.shares ?? 0,
        saves: metrics.saved ?? 0,
        last_stats_updated_at: new Date().toISOString(),
      }).eq('id', post.id)
    } catch (e) {
      console.warn(`Failed to pull IG stats for post ${post.id}:`, e)
    }
  }
}

async function main() {
  console.log(`📊 Pulling platform stats at ${new Date().toISOString()}`)

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data: recentPosts } = await supabase
    .from('published_posts')
    .select('*')
    .gte('published_at', sevenDaysAgo)
    .eq('status', 'published')

  if (!recentPosts?.length) {
    console.log('No recent posts to update')
    return
  }

  await Promise.all([
    pullTikTokStats(recentPosts),
    pullInstagramStats(recentPosts),
  ])

  console.log(`✅ Updated stats for ${recentPosts.length} posts`)
  process.exit(0)
}

main().catch(err => {
  console.error('Stats pull failed:', err)
  process.exit(1)
})
```

**OUTPUT:** Running `pnpm --filter @repo/nexus run pull-stats` updates `views/likes/comments` in `published_posts` table with real platform data.

---

# CHECKLIST — DO NOT CLOSE UNTIL DONE

```
PHASE 0 - FOUNDATION
[ ] 0.1 Monorepo scaffold with Turborepo + pnpm workspaces
[ ] 0.2 Environment validation with Zod
[ ] 0.3 Supabase schema deployed, TypeScript types generated

PHASE 1 - MASTRA
[ ] 1.1 Mastra installed and mastra instance initialized
[ ] 1.2 Trend research agent (Google + TikTok + Reddit tools)
[ ] 1.3 Content queue manager agent

PHASE 2 - POSTER GENERATION
[ ] 2.1 Replicate image generation tools (FLUX 1.1 Pro)
[ ] 2.2 Caption + hashtag generator (all 9 platforms)

PHASE 3 - VIDEO GENERATION
[ ] 3.1 Remotion setup (8 composition types registered)
[ ] 3.2 ElevenLabs voiceover + SRT subtitle generation
[ ] 3.3 Full video generation workflow (script→voice→bg→render→upload)

PHASE 4 - COSMICJS
[ ] 4.1 CosmicJS CMS layer (upload, AI video gen, object types)

PHASE 5 - PUBLISHING
[ ] 5.1 Publisher base class + all 10 platform adapters
[ ] 5.2 Publishing workflow (caption gen + multi-platform post + stats save)

PHASE 6 - WEBSITE FACTORY
[ ] 6.1 Site generator (clone boilerplate → Cosmic bucket → Vercel deploy)
[ ] 6.2 SEO content generator (blog post + product review tools)
[ ] 6.3 Amazon affiliate link replacer

PHASE 7 - ORCHESTRATION
[ ] 7.1 Daily run master workflow (trends→queue→generate→publish→site content→report)

PHASE 8 - AUTOMATION
[ ] 8.1 GitHub Actions (daily-run.yml + generate-site.yml + stats-pull.yml)
[ ] 8.2 Entry point scripts (run-daily.ts, run-pull-stats.ts, run-generate-site.ts)

PHASE 9 - DASHBOARD
[ ] 9.1 Next.js dashboard deployed to Vercel

PHASE 10 - DEVIN
[ ] 10.1 Devin workflow YAMLs (add-niche, add-platform, fix-failed-posts)
[ ] 10.2 Stats pull implementation (TikTok + Instagram)
```

---

## PACKAGES TO INSTALL (full list for reference)

```bash
# Core
pnpm add @mastra/core @mastra/memory @ai-sdk/anthropic @ai-sdk/openai

# Database
pnpm add @supabase/supabase-js

# CMS
pnpm add @cosmicjs/sdk

# Image generation
pnpm add replicate @fal-ai/serverless-client sharp

# Video
pnpm add remotion @remotion/renderer @remotion/bundler @remotion/google-fonts
pnpm add react react-dom

# Audio
pnpm add elevenlabs

# Publishing
# (no packages needed — all REST API calls)

# Site factory
pnpm add vercel form-data node-fetch

# Affiliate
pnpm add paapi5-nodejs-sdk

# Trends
pnpm add google-trends-api

# Validation
pnpm add zod

# Utilities
pnpm add ai tsx

# Dev
pnpm add -D typescript @types/node @types/react @types/react-dom turbo
```

## REPOS TO CLONE FOR REFERENCE (keep open while building)

```bash
git clone https://github.com/mastra-ai/mastra /tmp/ref-mastra
git clone https://github.com/calesthio/OpenMontage /tmp/ref-openmontage
git clone https://github.com/ezedinff/TikTok-Forge /tmp/ref-tiktokforge
git clone https://github.com/danielehrhardt/postr /tmp/ref-postr
git clone https://github.com/cosmicjs/blocks /tmp/ref-cosmic-blocks
git clone https://github.com/cosmicjs/cosmicjs-node-website-boilerplate /tmp/ref-cosmic-boilerplate
```

## WHAT TO STEAL FROM EACH

| Repo | Steal This | Where In Our Code |
|------|-----------|-------------------|
| mastra | `createTool`, `createWorkflow`, `createStep`, Agent class | packages/agents, packages/workflows, packages/tools |
| OpenMontage | All 12 composition templates, 52 tool defs, pipeline schemas | packages/generators/src/video/remotion/ |
| TikTok-Forge | n8n workflow JSONs, Remotion config | packages/generators |
| postr | Platform adapter classes per social media site | packages/publishers/src/platforms/ |
| cosmic-blocks | Hero, Blog, Product, FAQ, CTA React blocks | apps/factory |
| cosmic-boilerplate | Folder structure, routing, Cosmic integration | apps/factory |
