# NEXUS — Complete End-to-End Architecture v4.0
### Personal AI Business Engine · Full Build Specification for Devin AI
> Every file. Every function. Every prompt. Every database row. No gaps.

---

# MASTER OVERVIEW

## What NEXUS Is
A personal AI-powered business dashboard. One person operates it. AI does the work.
The operator (you) reviews and approves. Nothing auto-publishes without your eyes on it.

## Core Philosophy
- Quality is built at every layer, not checked at the end
- Every AI call has a ranked failover chain — no single point of failure
- Cloudflare $5/month plan is exploited to its maximum capability
- Free AI models work now. Paid models activate the moment you add an API key.
- The system learns from every approval and rejection

## Tech Stack (Final — No Alternatives)
```
Frontend:     Next.js 14 (App Router) on Cloudflare Pages
Styling:      Tailwind CSS + shadcn/ui
Backend:      2 Cloudflare Workers (Hono.js)
Workflows:    Cloudflare Workflows (CF native, not LangGraph)
Database:     Cloudflare D1 (SQLite)
File Storage: Cloudflare R2
Image CDN:    Cloudflare Images
Config Cache: Cloudflare KV
API Keys:     Cloudflare Secrets Store
Language:     TypeScript everywhere
Package Mgr:  pnpm (monorepo)
Monorepo:     Turborepo
```

## The 2-Worker Architecture
```
Worker 1: nexus-api     → All dashboard API routes, storage, variation engine
Worker 2: nexus-ai      → ONLY AI calls with failover (isolated because AI can hang/fail)

Both connected to CF Workflows via bindings.
Workers communicate via Service Bindings (zero extra request cost).
```

---

# PART 1 — REPOSITORY STRUCTURE (EXACT)

```
nexus/
├── apps/
│   ├── web/                              # Next.js 14 frontend (CF Pages)
│   │   ├── app/
│   │   │   ├── layout.tsx                # Root layout
│   │   │   ├── page.tsx                  # Home → Domain cards
│   │   │   ├── globals.css
│   │   │   ├── [domain]/
│   │   │   │   ├── page.tsx              # Category cards
│   │   │   │   └── [category]/
│   │   │   │       └── page.tsx          # Product setup form
│   │   │   ├── workflow/
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx          # Live workflow progress
│   │   │   ├── review/
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx          # CEO review screen
│   │   │   ├── products/
│   │   │   │   ├── page.tsx              # All products list
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx          # Single product detail
│   │   │   ├── graveyard/
│   │   │   │   └── page.tsx              # Rejected products
│   │   │   ├── publish/
│   │   │   │   └── page.tsx              # Publishing center
│   │   │   ├── trends/
│   │   │   │   └── page.tsx              # Daily trend radar
│   │   │   ├── winners/
│   │   │   │   └── page.tsx              # Winner pattern library
│   │   │   ├── manager/
│   │   │   │   ├── domains/page.tsx      # Domain + category manager
│   │   │   │   ├── platforms/page.tsx    # Platform manager
│   │   │   │   ├── social/page.tsx       # Social channel manager
│   │   │   │   ├── prompts/page.tsx      # Prompt manager
│   │   │   │   └── ai/page.tsx           # AI model manager
│   │   │   ├── history/
│   │   │   │   └── page.tsx              # Workflow run history
│   │   │   └── settings/
│   │   │       └── page.tsx              # Global settings
│   │   ├── components/
│   │   │   ├── ui/                       # shadcn/ui components
│   │   │   ├── domain/
│   │   │   │   ├── DomainCard.tsx
│   │   │   │   └── DomainGrid.tsx
│   │   │   ├── category/
│   │   │   │   ├── CategoryCard.tsx
│   │   │   │   └── CategoryGrid.tsx
│   │   │   ├── product/
│   │   │   │   ├── ProductSetupForm.tsx
│   │   │   │   ├── ProductCard.tsx
│   │   │   │   └── ProductList.tsx
│   │   │   ├── workflow/
│   │   │   │   ├── WorkflowProgress.tsx
│   │   │   │   ├── StepTracker.tsx
│   │   │   │   └── WorkflowStatus.tsx
│   │   │   ├── review/
│   │   │   │   ├── ReviewScreen.tsx
│   │   │   │   ├── SectionScore.tsx
│   │   │   │   ├── InlineEditor.tsx
│   │   │   │   ├── TitleVariants.tsx
│   │   │   │   ├── PlatformPreview.tsx
│   │   │   │   ├── SocialPreview.tsx
│   │   │   │   ├── ListingHealthCheck.tsx
│   │   │   │   ├── RevenueEstimator.tsx
│   │   │   │   └── CompetitorGap.tsx
│   │   │   ├── publish/
│   │   │   │   ├── PublishCenter.tsx
│   │   │   │   ├── LaunchBoostPack.tsx
│   │   │   │   └── ScheduleSuggestion.tsx
│   │   │   ├── trends/
│   │   │   │   └── TrendRadar.tsx
│   │   │   ├── manager/
│   │   │   │   ├── AIModelCard.tsx
│   │   │   │   ├── PromptEditor.tsx
│   │   │   │   ├── PlatformEditor.tsx
│   │   │   │   └── SocialChannelEditor.tsx
│   │   │   └── shared/
│   │   │       ├── StatusBadge.tsx
│   │   │       ├── LoadingSpinner.tsx
│   │   │       ├── ConfirmDialog.tsx
│   │   │       └── Navbar.tsx
│   │   ├── lib/
│   │   │   ├── api.ts                    # Typed API client (fetch wrapper)
│   │   │   ├── types.ts                  # All shared TypeScript types
│   │   │   └── utils.ts                  # Helpers
│   │   ├── hooks/
│   │   │   ├── useWorkflow.ts            # Polling workflow status
│   │   │   ├── useProducts.ts
│   │   │   └── useTrends.ts
│   │   ├── next.config.js
│   │   ├── tailwind.config.ts
│   │   └── package.json
│   │
│   ├── nexus-api/                        # Worker 1 — Main API
│   │   ├── src/
│   │   │   ├── index.ts                  # Entry point + Hono router
│   │   │   ├── routes/
│   │   │   │   ├── workflow.ts           # POST /workflow/start, GET /workflow/:id
│   │   │   │   ├── products.ts           # CRUD products
│   │   │   │   ├── review.ts             # POST /review/approve, /review/reject
│   │   │   │   ├── publish.ts            # POST /publish
│   │   │   │   ├── domains.ts            # CRUD domains + categories
│   │   │   │   ├── platforms.ts          # CRUD platforms
│   │   │   │   ├── social.ts             # CRUD social channels
│   │   │   │   ├── prompts.ts            # CRUD prompt templates
│   │   │   │   ├── ai-models.ts          # GET/PATCH AI model status
│   │   │   │   ├── assets.ts             # GET/DELETE assets
│   │   │   │   ├── trends.ts             # GET trend radar results
│   │   │   │   ├── winners.ts            # GET winner patterns
│   │   │   │   ├── graveyard.ts          # GET/restore graveyard products
│   │   │   │   ├── history.ts            # GET workflow run history
│   │   │   │   └── settings.ts           # GET/PATCH global settings
│   │   │   ├── services/
│   │   │   │   ├── workflow-engine.ts    # Triggers + monitors CF Workflows
│   │   │   │   ├── variation.ts          # Platform variation engine
│   │   │   │   ├── social-engine.ts      # Social content adaptation
│   │   │   │   ├── health-check.ts       # Listing health validator
│   │   │   │   ├── revenue-estimator.ts  # Revenue projection calculator
│   │   │   │   ├── winner-tracker.ts     # Approval pattern tracker
│   │   │   │   ├── graveyard.ts          # Rejected product re-analysis
│   │   │   │   └── deletion.ts           # Sync delete across D1+R2+KV+CFImages
│   │   │   ├── storage/
│   │   │   │   ├── d1.ts                 # All D1 query functions
│   │   │   │   ├── kv.ts                 # All KV read/write functions
│   │   │   │   ├── r2.ts                 # All R2 upload/delete functions
│   │   │   │   └── cf-images.ts          # CF Images upload/delete/transform
│   │   │   └── types.ts                  # Worker-specific types
│   │   ├── wrangler.toml
│   │   └── package.json
│   │
│   └── nexus-ai/                         # Worker 2 — AI Failover Engine
│       ├── src/
│       │   ├── index.ts                  # Entry point (called by CF Workflows)
│       │   ├── failover.ts               # Core failover engine
│       │   ├── registry.ts               # All AI model configs + state
│       │   ├── callers/
│       │   │   ├── deepseek.ts           # DeepSeek API caller
│       │   │   ├── qwen.ts               # Qwen/SiliconFlow API caller
│       │   │   ├── suno.ts               # Suno music API caller
│       │   │   ├── udio.ts               # Udio music API caller
│       │   │   ├── musicgen.ts           # HuggingFace MusicGen caller
│       │   │   ├── flux.ts               # FLUX.1 via fal.ai caller
│       │   │   ├── ideogram.ts           # Ideogram API caller
│       │   │   ├── sdxl.ts               # SDXL via HuggingFace caller
│       │   │   ├── tavily.ts             # Tavily search caller
│       │   │   ├── exa.ts                # Exa neural search caller
│       │   │   ├── serpapi.ts            # SerpAPI caller
│       │   │   ├── printful.ts           # Printful mockup API caller
│       │   │   ├── anthropic.ts          # Claude API caller (sleeping)
│       │   │   ├── openai.ts             # GPT API caller (sleeping)
│       │   │   └── google.ts             # Gemini API caller (sleeping)
│       │   └── types.ts
│       ├── wrangler.toml
│       └── package.json
│
├── packages/
│   ├── types/                            # Shared TypeScript types (both workers + web)
│   │   ├── src/
│   │   │   ├── domain.ts
│   │   │   ├── product.ts
│   │   │   ├── workflow.ts
│   │   │   ├── ai.ts
│   │   │   ├── platform.ts
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   └── prompts/                          # All prompt templates (source of truth)
│       ├── src/
│       │   ├── master.ts                 # Master system prompt
│       │   ├── personas.ts               # AI persona definitions
│       │   ├── roles.ts                  # Role prompts (researcher, writer, etc.)
│       │   ├── domains/
│       │   │   ├── pod.ts
│       │   │   ├── digital-products.ts
│       │   │   ├── content-media.ts
│       │   │   ├── freelance.ts
│       │   │   ├── affiliate.ts
│       │   │   └── [all other domains].ts
│       │   ├── categories/
│       │   │   ├── notion-templates.ts
│       │   │   ├── tshirts.ts
│       │   │   └── [all categories].ts
│       │   ├── platforms/
│       │   │   ├── etsy.ts
│       │   │   ├── gumroad.ts
│       │   │   ├── shopify.ts
│       │   │   └── [all platforms].ts
│       │   ├── social/
│       │   │   ├── instagram.ts
│       │   │   ├── tiktok.ts
│       │   │   └── [all channels].ts
│       │   ├── quality/
│       │   │   ├── pedantic-editor.ts    # Pass 1
│       │   │   ├── buyer-simulation.ts   # Pass 2
│       │   │   ├── competitor-compare.ts # Pass 3
│       │   │   └── ceo-review.ts         # Final CEO review
│       │   └── builder.ts                # Assembles all layers into final prompt
│       └── package.json
│
├── migrations/                           # D1 SQL migrations (run in order)
│   ├── 001_core_schema.sql
│   ├── 002_ai_registry.sql
│   ├── 003_prompt_templates.sql
│   ├── 004_platform_configs.sql
│   └── 005_social_channels.sql
│
├── turbo.json                            # Turborepo config
├── pnpm-workspace.yaml
└── package.json
```

---

# PART 2 — CLOUDFLARE INFRASTRUCTURE (EXACT EXPLOITATION)

## Real Plan Limits vs NEXUS Usage

| Service | Monthly Allowance | NEXUS Personal Use | Headroom |
|---------|------------------|-------------------|---------|
| Workers requests | 10,000,000 | ~5,000/month | 2,000x |
| KV reads | 10,000,000 | ~50,000/month | 200x |
| KV writes | 1,000,000 | ~500/month | 2,000x |
| KV storage | 1 GB | ~10 MB | 100x |
| R2 storage | 10 GB | ~2 GB first year | 5x |
| R2 reads | 10,000,000 | ~10,000/month | 1,000x |
| R2 writes | 1,000,000 | ~1,000/month | 1,000x |
| R2 egress | UNLIMITED | UNLIMITED | ∞ |
| D1 storage | 5 GB | ~100 MB/year | 50x |
| Workflows instances | Unlimited sleeping | 1 per product | ∞ |
| Workflows steps | 10,000/instance | Max 15 steps | 666x |
| Pages hosting | Unlimited | 1 site | ∞ |
| Bandwidth | UNLIMITED | UNLIMITED | ∞ |

**Total monthly bill: $5.00. Always. For personal use this never changes.**

---

## Storage Strategy (What Goes Where and Why)

### Cloudflare KV — Fast Config Reads (10M/month free)
KV is optimized for high-volume reads of rarely-changing data.
Every dashboard page load reads config from KV — fast, free, zero D1 load.

```
KV Namespace: NEXUS_CONFIG
Keys stored:
  config:domains                    → JSON array of all domains
  config:categories:{domain_id}     → JSON array of categories per domain
  config:platforms                  → JSON array of all platform configs
  config:social_channels            → JSON array of social channel configs
  config:ai_models                  → JSON array of all AI models + current status
  config:ai_status:{model_id}       → Current status of specific AI model
  config:settings                   → Global settings object
  prompts:master                    → Master system prompt text
  prompts:persona:{persona_id}      → Persona prompt text
  prompts:role:{role_id}            → Role prompt text
  prompts:domain:{domain_id}        → Domain prompt text
  prompts:category:{category_id}    → Category prompt text
  prompts:platform:{platform_id}    → Platform prompt text
  prompts:social:{channel_id}       → Social channel prompt text
  prompts:quality:editor            → Pedantic editor prompt
  prompts:quality:buyer_sim         → Buyer simulation prompt
  prompts:quality:competitor        → Competitor comparison prompt
  prompts:quality:ceo               → CEO review prompt
  trends:latest                     → Latest trend radar results (refreshed daily)
  winners:patterns                  → Winner pattern library (updated on approval)
```

### Cloudflare D1 — Relational Data (5GB included)
D1 used ONLY for data that changes (workflow state, products, reviews, history).
Never used for config reads — that's KV's job.

### Cloudflare R2 — All Files (10GB, zero egress)
Every generated file lives here. Served directly. No bandwidth cost ever.

```
R2 Bucket: nexus-assets
Key structure:
  products/{product_id}/images/{filename}
  products/{product_id}/mockups/{filename}
  products/{product_id}/pdf/{filename}
  products/{product_id}/audio/{filename}
  products/{product_id}/exports/{platform}/{filename}
  temp/{workflow_id}/{step_id}/{filename}   ← cleaned up after workflow completes
```

### Cloudflare Images — Image CDN + Transform
Only for product images that need CDN delivery and transformation.
R2 handles raw storage. CF Images handles serving with transforms.

```
Transform variants defined:
  thumbnail    → 300x300, fit: cover, format: webp
  preview      → 800x800, fit: contain, format: webp
  full         → original size, format: webp, quality: 90
  mockup       → 1200x1200, fit: cover, format: jpg, quality: 95
```

### Cloudflare Secrets Store — API Keys
All AI API keys stored here. Never in environment variables. Never in code.
Adding a key = that AI activates. Removing = it sleeps. No deployment needed.

```
Secret names (exact):
  TAVILY_API_KEY
  EXA_API_KEY
  SERPAPI_KEY
  DEEPSEEK_API_KEY
  SILICONFLOW_API_KEY          ← covers Qwen + Doubao + MiniMax
  FIREWORKS_API_KEY
  GROQ_API_KEY
  HF_TOKEN
  FAL_API_KEY                  ← covers FLUX.1
  MOONSHOT_API_KEY             ← Kimi
  DATAFORSEO_KEY
  PRINTFUL_API_KEY
  PRINTIFY_API_KEY
  SUNO_API_KEY
  IDEOGRAM_API_KEY
  OPENROUTER_API_KEY
  ANTHROPIC_API_KEY            ← sleeping until added
  OPENAI_API_KEY               ← sleeping until added
  GOOGLE_API_KEY               ← sleeping until added
  MIDJOURNEY_API_KEY           ← sleeping until added
  ELEVENLABS_API_KEY           ← sleeping until added
```

---

## Cloudflare Workflows Configuration

### wrangler.toml for nexus-api (excerpt)
```toml
name = "nexus-api"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[[workflows]]
name = "nexus-product-workflow"
binding = "PRODUCT_WORKFLOW"
class_name = "ProductWorkflow"

[[d1_databases]]
binding = "DB"
database_name = "nexus-db"
database_id = "YOUR_D1_ID"

[[kv_namespaces]]
binding = "CONFIG"
id = "YOUR_KV_ID"

[[r2_buckets]]
binding = "ASSETS"
bucket_name = "nexus-assets"

[[images]]
binding = "IMAGES"

[[services]]
binding = "AI_WORKER"
service = "nexus-ai"

[secrets_store]
binding = "SECRETS"
store_id = "YOUR_SECRETS_STORE_ID"
```

### wrangler.toml for nexus-ai (excerpt)
```toml
name = "nexus-ai"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[[kv_namespaces]]
binding = "CONFIG"
id = "YOUR_KV_ID"

[secrets_store]
binding = "SECRETS"
store_id = "YOUR_SECRETS_STORE_ID"
```

---

## Deletion Flow (Complete — Every Storage Layer Synced)

When anything is deleted from the dashboard, this exact sequence runs in parallel:

```typescript
// apps/nexus-api/src/services/deletion.ts

export async function deleteProduct(
  productId: string,
  env: Env
): Promise<void> {

  // 1. Get all asset keys before deleting records
  const assets = await env.DB.prepare(
    'SELECT r2_key, cf_image_id FROM assets WHERE product_id = ?'
  ).bind(productId).all()

  // 2. Run all deletions in PARALLEL (Promise.all = fast)
  await Promise.all([

    // Delete all D1 records (cascade via foreign keys)
    env.DB.prepare('DELETE FROM products WHERE id = ?').bind(productId).run(),

    // Delete all R2 files
    ...assets.results.map(a =>
      a.r2_key ? env.ASSETS.delete(a.r2_key) : Promise.resolve()
    ),

    // Delete all CF Images
    ...assets.results.map(a =>
      a.cf_image_id
        ? fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/images/v1/${a.cf_image_id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${env.CF_API_TOKEN}` }
          })
        : Promise.resolve()
    ),

    // Invalidate KV cache if any config referenced this product
    env.CONFIG.delete(`product:${productId}`),
  ])
}

// Same pattern for domain deletion, category deletion, platform deletion
// Every delete function runs Promise.all across all storage layers
```

---

# PART 3 — COMPLETE DATABASE SCHEMA (D1)

## Migration 001 — Core Schema

```sql
-- ============================================================
-- DOMAINS & CATEGORIES (user-configurable from dashboard)
-- ============================================================

CREATE TABLE domains (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  name        TEXT NOT NULL,
  slug        TEXT UNIQUE NOT NULL,
  description TEXT,
  icon        TEXT,                    -- emoji or icon name
  color       TEXT DEFAULT '#6366f1',  -- hex color for card
  sort_order  INTEGER DEFAULT 0,
  is_active   INTEGER DEFAULT 1,       -- D1 uses INTEGER for boolean
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE categories (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  domain_id   TEXT NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL,
  description TEXT,
  icon        TEXT,
  sort_order  INTEGER DEFAULT 0,
  is_active   INTEGER DEFAULT 1,
  created_at  TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_categories_domain ON categories(domain_id);

-- ============================================================
-- PLATFORMS (where products get listed)
-- ============================================================

CREATE TABLE platforms (
  id                TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  name              TEXT NOT NULL,
  slug              TEXT UNIQUE NOT NULL,
  url               TEXT,
  title_max_chars   INTEGER,
  description_max   INTEGER,
  tag_count         INTEGER,
  tag_max_chars     INTEGER,
  audience          TEXT,
  tone              TEXT,
  seo_style         TEXT,
  description_style TEXT,
  cta_style         TEXT,
  forbidden_words   TEXT,              -- JSON array
  rules_json        TEXT,              -- JSON for extra platform rules
  is_active         INTEGER DEFAULT 1,
  sort_order        INTEGER DEFAULT 0,
  created_at        TEXT DEFAULT (datetime('now')),
  updated_at        TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- SOCIAL CHANNELS
-- ============================================================

CREATE TABLE social_channels (
  id                TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  name              TEXT NOT NULL,
  slug              TEXT UNIQUE NOT NULL,
  caption_max_chars INTEGER,
  hashtag_count     INTEGER,
  tone              TEXT,
  format            TEXT,
  content_types     TEXT,              -- JSON array
  posting_mode      TEXT DEFAULT 'manual', -- 'auto' | 'manual'
  is_active         INTEGER DEFAULT 1,
  sort_order        INTEGER DEFAULT 0,
  created_at        TEXT DEFAULT (datetime('now')),
  updated_at        TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- PRODUCTS
-- ============================================================

CREATE TABLE products (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  domain_id       TEXT NOT NULL REFERENCES domains(id),
  category_id     TEXT NOT NULL REFERENCES categories(id),
  name            TEXT,                -- user input (optional)
  niche           TEXT,                -- user input (optional)
  language        TEXT DEFAULT 'en',
  user_input      TEXT,                -- JSON: all optional form fields
  status          TEXT DEFAULT 'draft',
  -- Status values:
  -- draft | running | pending_review | in_revision |
  -- approved | published | rejected | archived | graveyard
  ai_score        REAL,                -- final AI quality score 0-10
  revenue_estimate TEXT,              -- JSON: { min, max, currency }
  winner_patterns  TEXT,              -- JSON: detected winning patterns
  graveyard_at    TEXT,               -- when moved to graveyard
  graveyard_reason TEXT,
  resurface_at    TEXT,               -- when to re-analyze from graveyard
  created_at      TEXT DEFAULT (datetime('now')),
  updated_at      TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_products_domain ON products(domain_id);
CREATE INDEX idx_products_status ON products(status);
CREATE INDEX idx_products_graveyard ON products(graveyard_at) WHERE graveyard_at IS NOT NULL;

-- ============================================================
-- WORKFLOW RUNS
-- ============================================================

CREATE TABLE workflow_runs (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  product_id      TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  cf_workflow_id  TEXT,                -- CF Workflows instance ID
  status          TEXT DEFAULT 'queued',
  -- Status: queued | running | completed | failed | cancelled
  current_step    TEXT,
  total_steps     INTEGER DEFAULT 0,
  error           TEXT,
  started_at      TEXT,
  completed_at    TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_runs_product ON workflow_runs(product_id);
CREATE INDEX idx_runs_status ON workflow_runs(status);

-- ============================================================
-- WORKFLOW STEPS
-- ============================================================

CREATE TABLE workflow_steps (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  run_id          TEXT NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  step_name       TEXT NOT NULL,
  step_type       TEXT NOT NULL,
  -- Types: research_market | research_psychology | generate_content |
  --        generate_image | generate_audio | seo_format |
  --        quality_editor | quality_buyer_sim | quality_competitor |
  --        quality_ceo | platform_variation | social_adaptation |
  --        health_check | revenue_estimate | mockup | humanize
  step_order      INTEGER NOT NULL,
  status          TEXT DEFAULT 'waiting',
  -- Status: waiting | running | completed | failed | skipped
  ai_model_used   TEXT,               -- which model actually ran
  ai_models_tried TEXT,               -- JSON array of models tried before success
  input_data      TEXT,               -- JSON
  output_data     TEXT,               -- JSON
  tokens_used     INTEGER DEFAULT 0,
  cost_usd        REAL DEFAULT 0,
  started_at      TEXT,
  completed_at    TEXT,
  error           TEXT
);

CREATE INDEX idx_steps_run ON workflow_steps(run_id);
CREATE INDEX idx_steps_status ON workflow_steps(status);

-- ============================================================
-- ASSETS (files in R2 + CF Images)
-- ============================================================

CREATE TABLE assets (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  product_id      TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  step_id         TEXT REFERENCES workflow_steps(id),
  asset_type      TEXT NOT NULL,
  -- Types: image_design | image_mockup | pdf | audio | export | thumbnail
  r2_key          TEXT,               -- R2 storage key (for deletion)
  cf_image_id     TEXT,               -- CF Images ID (for deletion + CDN)
  cdn_url         TEXT,               -- served URL
  filename        TEXT,
  mime_type       TEXT,
  file_size_bytes INTEGER,
  metadata        TEXT,               -- JSON: { width, height, duration, pages, etc }
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_assets_product ON assets(product_id);

-- ============================================================
-- PLATFORM VARIANTS (one per product per platform)
-- ============================================================

CREATE TABLE platform_variants (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  product_id      TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  platform_id     TEXT NOT NULL REFERENCES platforms(id),
  title           TEXT,
  description     TEXT,
  tags            TEXT,               -- JSON array
  price           REAL,
  currency        TEXT DEFAULT 'USD',
  additional_data TEXT,               -- JSON: platform-specific fields
  status          TEXT DEFAULT 'draft',
  -- Status: draft | approved | published
  published_at    TEXT,
  published_url   TEXT,
  created_at      TEXT DEFAULT (datetime('now')),
  updated_at      TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_platform_variants_product ON platform_variants(product_id);

-- ============================================================
-- SOCIAL VARIANTS (one per product per channel)
-- ============================================================

CREATE TABLE social_variants (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  product_id      TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  channel_id      TEXT NOT NULL REFERENCES social_channels(id),
  content         TEXT NOT NULL,      -- JSON: { caption, hashtags, hook, thread, etc }
  status          TEXT DEFAULT 'draft',
  scheduled_at    TEXT,
  published_at    TEXT,
  created_at      TEXT DEFAULT (datetime('now')),
  updated_at      TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- REVIEW HISTORY (every CEO decision saved)
-- ============================================================

CREATE TABLE reviews (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  product_id      TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  run_id          TEXT REFERENCES workflow_runs(id),
  version         INTEGER DEFAULT 1,
  ai_score        REAL,
  section_scores  TEXT,               -- JSON: { title, description, tags, price, platform_fit, ai_detection, competitor_gap }
  decision        TEXT,               -- 'approved' | 'rejected'
  feedback        TEXT,               -- rejection reason
  revised_sections TEXT,              -- JSON: which sections needed fixing
  reviewed_at     TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_reviews_product ON reviews(product_id);

-- ============================================================
-- TITLE VARIANTS (A/B options shown on review screen)
-- ============================================================

CREATE TABLE title_variants (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  product_id      TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  platform_id     TEXT REFERENCES platforms(id),
  variant_a       TEXT,
  variant_b       TEXT,
  variant_c       TEXT,
  selected        TEXT,               -- 'a' | 'b' | 'c' | null
  created_at      TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- TREND RADAR (daily cron results)
-- ============================================================

CREATE TABLE trend_alerts (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  domain_id       TEXT REFERENCES domains(id),
  trend_keyword   TEXT NOT NULL,
  trend_score     REAL,               -- 0-10 strength
  demand_window   TEXT,               -- e.g. "3-4 weeks"
  source          TEXT,               -- where trend was detected
  suggested_niche TEXT,
  status          TEXT DEFAULT 'new', -- 'new' | 'dismissed' | 'started'
  detected_at     TEXT DEFAULT (datetime('now')),
  dismissed_at    TEXT,
  workflow_id     TEXT               -- if user started a workflow from this
);

CREATE INDEX idx_trends_status ON trend_alerts(status);
CREATE INDEX idx_trends_detected ON trend_alerts(detected_at);

-- ============================================================
-- WINNER PATTERNS (learned from approvals)
-- ============================================================

CREATE TABLE winner_patterns (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  domain_id       TEXT REFERENCES domains(id),
  category_id     TEXT REFERENCES categories(id),
  pattern_type    TEXT NOT NULL,
  -- Types: title_structure | price_range | description_length |
  --        top_tags | tone | cta_style | buyer_persona
  pattern_value   TEXT NOT NULL,      -- JSON: the actual pattern
  confidence      REAL DEFAULT 0,     -- 0-1, increases with more data
  sample_count    INTEGER DEFAULT 1,  -- how many products confirmed this
  updated_at      TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- PROMPT TEMPLATES (editable from Prompt Manager)
-- ============================================================

CREATE TABLE prompt_templates (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  layer           TEXT NOT NULL,
  -- Layers: master | persona | role | domain | category | platform | social | quality
  target_id       TEXT,               -- domain_id, category_id, platform_id, or NULL for global
  target_type     TEXT,               -- 'domain' | 'category' | 'platform' | 'social' | NULL
  name            TEXT NOT NULL,
  prompt_text     TEXT NOT NULL,
  version         INTEGER DEFAULT 1,
  is_active       INTEGER DEFAULT 1,
  auto_improved   INTEGER DEFAULT 0,  -- 1 if system auto-modified this prompt
  improvement_log TEXT,               -- JSON: history of auto-improvements
  created_at      TEXT DEFAULT (datetime('now')),
  updated_at      TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_prompts_layer ON prompt_templates(layer);
CREATE INDEX idx_prompts_target ON prompt_templates(target_id);

-- ============================================================
-- AI MODEL REGISTRY (failover state)
-- ============================================================

CREATE TABLE ai_models (
  id                    TEXT PRIMARY KEY,  -- e.g. 'deepseek-v3'
  name                  TEXT NOT NULL,
  provider              TEXT NOT NULL,
  api_key_secret_name   TEXT NOT NULL,     -- name in CF Secrets Store
  task_types            TEXT NOT NULL,     -- JSON array of task types
  rank                  INTEGER NOT NULL,  -- 1 = try first
  status                TEXT DEFAULT 'checking',
  -- Status: active | sleeping | rate_limited | quota_exceeded | no_key | error
  rate_limit_reset_at   TEXT,
  daily_limit_reset_at  TEXT,
  is_free_tier          INTEGER DEFAULT 1,
  max_tokens            INTEGER,
  supports_streaming    INTEGER DEFAULT 0,
  context_window        INTEGER,
  cost_per_1m_tokens    REAL DEFAULT 0,
  notes                 TEXT,
  last_used_at          TEXT,
  total_calls           INTEGER DEFAULT 0,
  total_failures        INTEGER DEFAULT 0,
  updated_at            TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- SETTINGS (global dashboard config)
-- ============================================================

CREATE TABLE settings (
  key             TEXT PRIMARY KEY,
  value           TEXT NOT NULL,
  description     TEXT,
  updated_at      TEXT DEFAULT (datetime('now'))
);

-- Default settings inserted on first run:
INSERT INTO settings (key, value, description) VALUES
  ('social_posting_mode', 'manual', 'auto or manual'),
  ('default_language', 'en', 'default product language'),
  ('ceo_review_required', 'true', 'require CEO approval before publish'),
  ('auto_publish_after_approval', 'false', 'auto-publish on approval'),
  ('trend_radar_enabled', 'true', 'run daily trend scan'),
  ('trend_radar_hour', '6', 'hour to run trend scan (0-23 UTC)'),
  ('winner_tracking_enabled', 'true', 'track approval patterns'),
  ('graveyard_resurface_days', '30', 'days before resurface check'),
  ('revenue_estimate_enabled', 'true', 'show revenue estimates'),
  ('quality_passes', '3', 'number of auto quality passes'),
  ('title_variants_count', '3', 'A/B title variants to generate');
```

---

# PART 4 — AI ENGINE (COMPLETE FAILOVER SYSTEM)

## The Task Type Registry

Every AI task has an exact ranked list. Each AI chosen for a specific reason.
Status 🟢 = active with free key. Status 🔴 = sleeping, add key to activate.

```typescript
// packages/types/src/ai.ts

export type TaskType =
  | 'research_market'          // Find trends, competitors, pricing
  | 'research_psychology'      // Analyze buyer emotion + language
  | 'research_keywords'        // SEO keyword research
  | 'research_competitors'     // Competitor listing analysis
  | 'generate_long_form'       // Articles, guides, ebooks (2000+ words)
  | 'generate_short_copy'      // Titles, descriptions, hooks (< 500 words)
  | 'generate_seo_tags'        // Constrained output: tags, meta
  | 'generate_code'            // Software development deliverables
  | 'generate_strategy'        // Business strategy, analysis
  | 'generate_image_prompt'    // Write Midjourney/FLUX prompts
  | 'generate_music_prompt'    // Write Suno/Udio prompts
  | 'generate_image'           // Create actual images
  | 'generate_music'           // Create actual audio
  | 'generate_mockup'          // Product mockup generation
  | 'platform_variation'       // Rewrite per platform rules
  | 'social_adaptation'        // Rewrite per social channel
  | 'humanize'                 // Remove AI-sounding language
  | 'quality_editor'           // Pedantic editing pass
  | 'quality_buyer_sim'        // Buyer simulation pass
  | 'quality_competitor'       // Competitor comparison pass
  | 'quality_ceo'              // Final CEO review
  | 'revenue_estimate'         // Calculate revenue projection
  | 'trend_analysis'           // Analyze trend data
  | 'pattern_extraction'       // Extract winner patterns
  | 'parse_document'           // Parse uploaded PDFs/docs
```

## AI Model Registry (Complete)

```typescript
// apps/nexus-ai/src/registry.ts

export const AI_REGISTRY: Record<TaskType, AIModel[]> = {

  research_market: [
    { id: 'tavily',       name: 'Tavily Search',    secretKey: 'TAVILY_API_KEY',    rank: 1, isFree: true,  why: 'Built for AI agents. Returns clean structured web data.' },
    { id: 'exa',          name: 'Exa Neural',       secretKey: 'EXA_API_KEY',       rank: 2, isFree: true,  why: 'Finds by meaning. Discovers emerging niches.' },
    { id: 'serpapi',      name: 'SerpAPI',          secretKey: 'SERPAPI_KEY',       rank: 3, isFree: true,  why: 'Raw Google results. Reliable trend backup.' },
    { id: 'deepseek-v3',  name: 'DeepSeek-V3',      secretKey: 'DEEPSEEK_API_KEY',  rank: 4, isFree: true,  why: 'Reasoning fallback when all search APIs fail.' },
  ],

  research_psychology: [
    { id: 'deepseek-r1',  name: 'DeepSeek-R1',      secretKey: 'DEEPSEEK_API_KEY',  rank: 1, isFree: true,  why: 'Best reasoning model free. Analyzes emotion patterns in reviews.' },
    { id: 'qwen-max',     name: 'Qwen 3.5 Max',     secretKey: 'SILICONFLOW_API_KEY',rank: 2, isFree: true, why: 'Strong analytical depth. Good at identifying emotional language.' },
    { id: 'claude',       name: 'Claude Sonnet 4.5', secretKey: 'ANTHROPIC_API_KEY', rank: 3, isFree: false, why: 'Best at nuanced human psychology understanding.' },
  ],

  research_keywords: [
    { id: 'dataforseo',   name: 'DataForSEO',       secretKey: 'DATAFORSEO_KEY',    rank: 1, isFree: true,  why: 'Most accurate keyword volume + difficulty data.' },
    { id: 'serpapi',      name: 'SerpAPI',          secretKey: 'SERPAPI_KEY',       rank: 2, isFree: true,  why: 'See exactly what pages rank and why.' },
    { id: 'exa',          name: 'Exa Neural',       secretKey: 'EXA_API_KEY',       rank: 3, isFree: true,  why: 'Semantic keyword discovery.' },
    { id: 'qwen-flash',   name: 'Qwen 3.5 Flash',   secretKey: 'SILICONFLOW_API_KEY',rank: 4, isFree: true, why: 'Cheapest keyword cluster reasoning. $0.05/1M tokens.' },
  ],

  research_competitors: [
    { id: 'tavily',       name: 'Tavily Search',    secretKey: 'TAVILY_API_KEY',    rank: 1, isFree: true,  why: 'Scrapes competitor listings cleanly.' },
    { id: 'qwen-flash',   name: 'Qwen 3.5 Flash',   secretKey: 'SILICONFLOW_API_KEY',rank: 2, isFree: true, why: 'Fast structured extraction from competitor pages.' },
    { id: 'deepseek-v3',  name: 'DeepSeek-V3',      secretKey: 'DEEPSEEK_API_KEY',  rank: 3, isFree: true,  why: 'Deeper analysis, identifies content gaps.' },
  ],

  generate_long_form: [
    { id: 'deepseek-v3',  name: 'DeepSeek-V3',      secretKey: 'DEEPSEEK_API_KEY',  rank: 1, isFree: true,  why: 'Best free long-form. Avoids robotic patterns naturally.' },
    { id: 'qwen-max',     name: 'Qwen 3.5 Max',     secretKey: 'SILICONFLOW_API_KEY',rank: 2, isFree: true, why: 'Strong long-form, excellent for technical topics.' },
    { id: 'doubao-pro',   name: 'Doubao 1.5 Pro',   secretKey: 'SILICONFLOW_API_KEY',rank: 3, isFree: true, why: 'ByteDance model. Most human-like narrative flow.' },
    { id: 'kimi',         name: 'Kimi k1.5',        secretKey: 'MOONSHOT_API_KEY',  rank: 4, isFree: true,  why: '10M token context. Never loses track on very long content.' },
    { id: 'claude',       name: 'Claude Sonnet 4.5', secretKey: 'ANTHROPIC_API_KEY', rank: 5, isFree: false, why: 'Best quality writing. Lowest AI-detection score.' },
    { id: 'gpt5',         name: 'GPT-5.4',          secretKey: 'OPENAI_API_KEY',    rank: 6, isFree: false, why: 'Top-tier fallback for long-form.' },
  ],

  generate_short_copy: [
    { id: 'deepseek-v3',  name: 'DeepSeek-V3',      secretKey: 'DEEPSEEK_API_KEY',  rank: 1, isFree: true,  why: 'Best free persuasive copywriting. Understands conversion.' },
    { id: 'doubao-pro',   name: 'Doubao 1.5 Pro',   secretKey: 'SILICONFLOW_API_KEY',rank: 2, isFree: true, why: 'TikTok AI. Naturally writes viral hooks.' },
    { id: 'qwen-max',     name: 'Qwen 3.5 Max',     secretKey: 'SILICONFLOW_API_KEY',rank: 3, isFree: true, why: 'Strong tone adaptation per audience.' },
    { id: 'claude',       name: 'Claude Sonnet 4.5', secretKey: 'ANTHROPIC_API_KEY', rank: 4, isFree: false, why: 'Best copywriter in AI world.' },
  ],

  generate_seo_tags: [
    { id: 'qwen-flash',   name: 'Qwen 3.5 Flash',   secretKey: 'SILICONFLOW_API_KEY',rank: 1, isFree: true, why: 'Fastest + most consistent at constrained output. $0.05/1M tokens.' },
    { id: 'deepseek-v3',  name: 'DeepSeek-V3',      secretKey: 'DEEPSEEK_API_KEY',  rank: 2, isFree: true,  why: 'Reliable rule-following for SEO constraints.' },
    { id: 'mistral-7b',   name: 'Mistral 7B',       secretKey: 'GROQ_API_KEY',      rank: 3, isFree: true,  why: 'Ultra-fast free inference via Groq.' },
    { id: 'llama4',       name: 'Llama 4 Scout',    secretKey: 'FIREWORKS_API_KEY', rank: 4, isFree: true,  why: 'Free tier. 10M context. Strong structured output.' },
  ],

  generate_code: [
    { id: 'deepseek-coder', name: 'DeepSeek-Coder-V3', secretKey: 'DEEPSEEK_API_KEY', rank: 1, isFree: true, why: 'Purpose-built for software architecture. Best free coder.' },
    { id: 'qwen-coder',   name: 'Qwen 3.5 Coder',   secretKey: 'SILICONFLOW_API_KEY',rank: 2, isFree: true, why: 'Strong full-stack. Next.js/Cloudflare fluent.' },
    { id: 'deepseek-r1',  name: 'DeepSeek-R1',      secretKey: 'DEEPSEEK_API_KEY',  rank: 3, isFree: true,  why: 'Reasoning first, then code. For complex algorithms.' },
    { id: 'gpt5-codex',   name: 'GPT-5.3 Codex',    secretKey: 'OPENAI_API_KEY',    rank: 4, isFree: false, why: 'Specialized for repository-scale coding.' },
    { id: 'claude',       name: 'Claude Sonnet 4.5', secretKey: 'ANTHROPIC_API_KEY', rank: 5, isFree: false, why: 'Best at translating requirements to clean code.' },
  ],

  generate_strategy: [
    { id: 'deepseek-r1',  name: 'DeepSeek-R1',      secretKey: 'DEEPSEEK_API_KEY',  rank: 1, isFree: true,  why: 'Best free reasoning. Matches paid models at 5% cost.' },
    { id: 'qwen-max',     name: 'Qwen 3.5 Max',     secretKey: 'SILICONFLOW_API_KEY',rank: 2, isFree: true, why: 'Strong analytical reasoning.' },
    { id: 'phi4',         name: 'Phi-4',            secretKey: 'HF_TOKEN',          rank: 3, isFree: true,  why: 'Small but punches above weight on logic.' },
    { id: 'gemini-pro',   name: 'Gemini 3.1 Pro',   secretKey: 'GOOGLE_API_KEY',    rank: 4, isFree: false, why: '#1 ARC-AGI-2 benchmark. Best paid reasoning.' },
    { id: 'claude-opus',  name: 'Claude Opus 4.6',  secretKey: 'ANTHROPIC_API_KEY', rank: 5, isFree: false, why: 'Deep nuanced strategic thinking.' },
  ],

  generate_image: [
    { id: 'flux-pro',     name: 'FLUX.1 Pro',       secretKey: 'FAL_API_KEY',       rank: 1, isFree: true,  why: '#1 world for text rendering in images. POD essential.' },
    { id: 'ideogram',     name: 'Ideogram 3.0',     secretKey: 'IDEOGRAM_API_KEY',  rank: 2, isFree: false, why: 'Specialized typography + graphic design layouts.' },
    { id: 'sdxl',         name: 'SDXL',             secretKey: 'HF_TOKEN',          rank: 3, isFree: true,  why: 'Free open-source. Good for illustration-style designs.' },
    { id: 'cogview3',     name: 'CogView-3',        secretKey: 'SILICONFLOW_API_KEY',rank: 4, isFree: true, why: 'Strong artistic quality. Chinese model, very cheap.' },
    { id: 'midjourney',   name: 'Midjourney',       secretKey: 'MIDJOURNEY_API_KEY',rank: 5, isFree: false, why: 'Highest artistic quality on the market.' },
    { id: 'dalle3',       name: 'DALL-E 3',         secretKey: 'OPENAI_API_KEY',    rank: 6, isFree: false, why: 'Reliable text rendering fallback.' },
  ],

  generate_music: [
    { id: 'suno',         name: 'Suno',             secretKey: 'SUNO_API_KEY',      rank: 1, isFree: true,  why: 'Best overall audio quality. All genres. 50 songs/day free.' },
    { id: 'udio',         name: 'Udio',             secretKey: 'HF_TOKEN',          rank: 2, isFree: true,  why: 'Different sonic character. Strong specific genres.' },
    { id: 'musicgen',     name: 'MusicGen',         secretKey: 'HF_TOKEN',          rank: 3, isFree: true,  why: 'Open source. Free. No limits. Good instrumentals.' },
    { id: 'stable-audio', name: 'Stable Audio',     secretKey: 'HF_TOKEN',          rank: 4, isFree: true,  why: 'Strong for sound design, stingers, ambience.' },
  ],

  generate_mockup: [
    { id: 'printful',     name: 'Printful Mockup',  secretKey: 'PRINTFUL_API_KEY',  rank: 1, isFree: true,  why: 'Free. Real product catalog mockups.' },
    { id: 'printify',     name: 'Printify Mockup',  secretKey: 'PRINTIFY_API_KEY',  rank: 2, isFree: true,  why: 'Free. Different product catalog fallback.' },
  ],

  platform_variation: [
    { id: 'qwen-flash',   name: 'Qwen 3.5 Flash',   secretKey: 'SILICONFLOW_API_KEY',rank: 1, isFree: true, why: 'Fastest at rule-based rewriting tasks.' },
    { id: 'deepseek-v3',  name: 'DeepSeek-V3',      secretKey: 'DEEPSEEK_API_KEY',  rank: 2, isFree: true,  why: 'Better quality while adapting tone.' },
    { id: 'doubao-lite',  name: 'Doubao 1.5 Lite',  secretKey: 'SILICONFLOW_API_KEY',rank: 3, isFree: true, why: 'Micro-model. Fast cheap variation generation.' },
  ],

  social_adaptation: [
    { id: 'doubao-pro',   name: 'Doubao 1.5 Pro',   secretKey: 'SILICONFLOW_API_KEY',rank: 1, isFree: true, why: 'ByteDance. Understands social platform patterns natively.' },
    { id: 'deepseek-v3',  name: 'DeepSeek-V3',      secretKey: 'DEEPSEEK_API_KEY',  rank: 2, isFree: true,  why: 'Best at tone adaptation across platforms.' },
    { id: 'qwen-max',     name: 'Qwen 3.5 Max',     secretKey: 'SILICONFLOW_API_KEY',rank: 3, isFree: true, why: 'Strong creative writing for social.' },
  ],

  humanize: [
    { id: 'doubao-pro',   name: 'Doubao 1.5 Pro',   secretKey: 'SILICONFLOW_API_KEY',rank: 1, isFree: true, why: 'Most human-like conversational output.' },
    { id: 'deepseek-v3',  name: 'DeepSeek-V3',      secretKey: 'DEEPSEEK_API_KEY',  rank: 2, isFree: true,  why: 'Naturally avoids AI writing patterns.' },
    { id: 'minimax',      name: 'MiniMax M2.5',     secretKey: 'SILICONFLOW_API_KEY',rank: 3, isFree: true, why: 'Best human-like flow in industry.' },
    { id: 'claude',       name: 'Claude Sonnet 4.5', secretKey: 'ANTHROPIC_API_KEY', rank: 4, isFree: false, why: 'Lowest AI-detection score of any model.' },
  ],

  quality_editor: [
    { id: 'deepseek-v3',  name: 'DeepSeek-V3',      secretKey: 'DEEPSEEK_API_KEY',  rank: 1, isFree: true,  why: 'Best at precise editing without losing meaning.' },
    { id: 'qwen-max',     name: 'Qwen 3.5 Max',     secretKey: 'SILICONFLOW_API_KEY',rank: 2, isFree: true, why: 'Strong editor. Catches redundancy well.' },
    { id: 'claude',       name: 'Claude Sonnet 4.5', secretKey: 'ANTHROPIC_API_KEY', rank: 3, isFree: false, why: 'Best editing quality.' },
  ],

  quality_buyer_sim: [
    { id: 'deepseek-r1',  name: 'DeepSeek-R1',      secretKey: 'DEEPSEEK_API_KEY',  rank: 1, isFree: true,  why: 'Reasoning model. Best at simulating buyer perspective.' },
    { id: 'qwen-max',     name: 'Qwen 3.5 Max',     secretKey: 'SILICONFLOW_API_KEY',rank: 2, isFree: true, why: 'Strong at role-play perspective taking.' },
    { id: 'claude',       name: 'Claude Sonnet 4.5', secretKey: 'ANTHROPIC_API_KEY', rank: 3, isFree: false, why: 'Best empathy modeling.' },
  ],

  quality_competitor: [
    { id: 'deepseek-r1',  name: 'DeepSeek-R1',      secretKey: 'DEEPSEEK_API_KEY',  rank: 1, isFree: true,  why: 'Reasoning model. Excellent at comparative analysis.' },
    { id: 'qwen-max',     name: 'Qwen 3.5 Max',     secretKey: 'SILICONFLOW_API_KEY',rank: 2, isFree: true, why: 'Strong at identifying gaps and differences.' },
    { id: 'claude-opus',  name: 'Claude Opus 4.6',  secretKey: 'ANTHROPIC_API_KEY', rank: 3, isFree: false, why: 'Most nuanced competitive analysis.' },
  ],

  quality_ceo: [
    { id: 'deepseek-r1',  name: 'DeepSeek-R1',      secretKey: 'DEEPSEEK_API_KEY',  rank: 1, isFree: true,  why: 'Best free comprehensive multi-criteria review.' },
    { id: 'qwen-max',     name: 'Qwen 3.5 Max',     secretKey: 'SILICONFLOW_API_KEY',rank: 2, isFree: true, why: 'Strong checklist following and gap detection.' },
    { id: 'claude-opus',  name: 'Claude Opus 4.6',  secretKey: 'ANTHROPIC_API_KEY', rank: 3, isFree: false, why: 'Most nuanced reviewer. Catches subtle issues.' },
    { id: 'gpt5-high',    name: 'GPT-5.4 High',     secretKey: 'OPENAI_API_KEY',    rank: 4, isFree: false, why: 'PhD-level logic for final review.' },
  ],

  revenue_estimate: [
    { id: 'deepseek-r1',  name: 'DeepSeek-R1',      secretKey: 'DEEPSEEK_API_KEY',  rank: 1, isFree: true,  why: 'Reasoning model. Best at numerical market analysis.' },
    { id: 'qwen-max',     name: 'Qwen 3.5 Max',     secretKey: 'SILICONFLOW_API_KEY',rank: 2, isFree: true, why: 'Strong analytical reasoning.' },
    { id: 'phi4',         name: 'Phi-4',            secretKey: 'HF_TOKEN',          rank: 3, isFree: true,  why: 'Precise at math/logic tasks. Can run locally.' },
  ],

  trend_analysis: [
    { id: 'tavily',       name: 'Tavily Search',    secretKey: 'TAVILY_API_KEY',    rank: 1, isFree: true,  why: 'Freshest web data for trend detection.' },
    { id: 'exa',          name: 'Exa Neural',       secretKey: 'EXA_API_KEY',       rank: 2, isFree: true,  why: 'Semantic trend discovery.' },
    { id: 'deepseek-r1',  name: 'DeepSeek-R1',      secretKey: 'DEEPSEEK_API_KEY',  rank: 3, isFree: true,  why: 'Analyzes trend signals and scores them.' },
  ],

  pattern_extraction: [
    { id: 'deepseek-r1',  name: 'DeepSeek-R1',      secretKey: 'DEEPSEEK_API_KEY',  rank: 1, isFree: true,  why: 'Best at finding patterns across multiple data points.' },
    { id: 'qwen-max',     name: 'Qwen 3.5 Max',     secretKey: 'SILICONFLOW_API_KEY',rank: 2, isFree: true, why: 'Strong analytical output.' },
  ],

  parse_document: [
    { id: 'mistral-ocr',  name: 'Mistral OCR',      secretKey: 'HF_TOKEN',          rank: 1, isFree: true,  why: 'Best free OCR for documents.' },
    { id: 'tesseract',    name: 'Tesseract',         secretKey: null,                rank: 2, isFree: true,  why: 'Open source. No API key needed. Always available.' },
    { id: 'unstructured', name: 'Unstructured.io',  secretKey: 'HF_TOKEN',          rank: 3, isFree: true,  why: 'Converts any format to AI-ready text.' },
  ],
}
```

## The Failover Engine (Complete Implementation)

```typescript
// apps/nexus-ai/src/failover.ts

import { AI_REGISTRY } from './registry'
import type { TaskType, AIModel, Env } from './types'

interface FailoverResult {
  output: string
  model_used: string
  models_tried: string[]
  tokens_used: number
}

export async function runWithFailover(
  taskType: TaskType,
  prompt: string,
  env: Env,
  options?: {
    maxRetries?: number
    timeoutMs?: number
    outputFormat?: 'text' | 'json'
  }
): Promise<FailoverResult> {

  const models = AI_REGISTRY[taskType]
  if (!models || models.length === 0) {
    throw new Error(`No models registered for task type: ${taskType}`)
  }

  const tried: string[] = []

  for (const model of models) {

    // Check 1: API key exists in secrets
    const apiKey = model.secretKey ? env.SECRETS?.get(model.secretKey) : 'local'
    if (!apiKey) {
      console.log(`[NEXUS-AI] SKIP ${model.name} — no API key configured`)
      continue
    }

    // Check 2: Rate limit window still active
    const rateLimitKey = `ai_status:${model.id}`
    const statusRaw = await env.CONFIG.get(rateLimitKey)
    if (statusRaw) {
      const status = JSON.parse(statusRaw)
      if (status.type === 'rate_limited' && Date.now() < status.reset_at) {
        const waitMin = Math.ceil((status.reset_at - Date.now()) / 60000)
        console.log(`[NEXUS-AI] SLEEP ${model.name} — rate limited (${waitMin}min remaining)`)
        continue
      }
      if (status.type === 'quota_exceeded' && Date.now() < status.reset_at) {
        console.log(`[NEXUS-AI] SLEEP ${model.name} — daily quota exceeded`)
        continue
      }
      // Reset time passed — clear the status
      if (Date.now() >= status.reset_at) {
        await env.CONFIG.delete(rateLimitKey)
      }
    }

    tried.push(model.id)
    console.log(`[NEXUS-AI] TRY ${model.name} for task: ${taskType}`)

    try {
      const result = await callModelWithTimeout(
        model,
        apiKey as string,
        prompt,
        options?.timeoutMs || 90000,
        options?.outputFormat || 'text'
      )

      console.log(`[NEXUS-AI] SUCCESS ${model.name} — ${result.tokens_used} tokens`)
      return {
        output: result.output,
        model_used: model.id,
        models_tried: tried,
        tokens_used: result.tokens_used,
      }

    } catch (error: any) {

      const statusCode = error.status || error.statusCode || 0
      const errorMsg = error.message || 'Unknown error'

      if (statusCode === 429) {
        // Rate limit — sleep for 1 hour
        const resetAt = Date.now() + 3_600_000
        await env.CONFIG.put(rateLimitKey, JSON.stringify({
          type: 'rate_limited',
          reset_at: resetAt,
          hit_at: Date.now()
        }), { expirationTtl: 3700 })
        console.log(`[NEXUS-AI] RATE_LIMIT ${model.name} — sleeping 1hr`)

      } else if (statusCode === 402 || errorMsg.includes('quota') || errorMsg.includes('insufficient_quota')) {
        // Daily quota — sleep until midnight UTC
        const midnight = new Date()
        midnight.setUTCHours(24, 0, 0, 0)
        const resetAt = midnight.getTime()
        await env.CONFIG.put(rateLimitKey, JSON.stringify({
          type: 'quota_exceeded',
          reset_at: resetAt,
          hit_at: Date.now()
        }), { expirationTtl: Math.ceil((resetAt - Date.now()) / 1000) + 60 })
        console.log(`[NEXUS-AI] QUOTA_EXCEEDED ${model.name} — sleeping until midnight`)

      } else if (statusCode === 401 || statusCode === 403) {
        // Invalid key — mark as no_key, skip permanently until key changes
        await env.CONFIG.put(rateLimitKey, JSON.stringify({
          type: 'invalid_key',
          reset_at: Date.now() + 86_400_000, // try again tomorrow
          hit_at: Date.now()
        }), { expirationTtl: 86_460 })
        console.log(`[NEXUS-AI] INVALID_KEY ${model.name}`)

      } else {
        console.log(`[NEXUS-AI] ERROR ${model.name}: ${statusCode} — ${errorMsg}`)
      }

      continue // Try next model
    }
  }

  throw new Error(
    `All AI models failed for task "${taskType}". Tried: ${tried.join(', ')}`
  )
}

async function callModelWithTimeout(
  model: AIModel,
  apiKey: string,
  prompt: string,
  timeoutMs: number,
  outputFormat: 'text' | 'json'
): Promise<{ output: string; tokens_used: number }> {

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    let result: { output: string; tokens_used: number }

    // Route to correct caller based on model provider
    switch (model.provider) {
      case 'deepseek':
        result = await callOpenAICompatible('https://api.deepseek.com/v1', apiKey, model, prompt, outputFormat, controller.signal)
        break
      case 'siliconflow':
        result = await callOpenAICompatible('https://api.siliconflow.cn/v1', apiKey, model, prompt, outputFormat, controller.signal)
        break
      case 'groq':
        result = await callOpenAICompatible('https://api.groq.com/openai/v1', apiKey, model, prompt, outputFormat, controller.signal)
        break
      case 'fireworks':
        result = await callOpenAICompatible('https://api.fireworks.ai/inference/v1', apiKey, model, prompt, outputFormat, controller.signal)
        break
      case 'moonshot':
        result = await callOpenAICompatible('https://api.moonshot.cn/v1', apiKey, model, prompt, outputFormat, controller.signal)
        break
      case 'anthropic':
        result = await callAnthropic(apiKey, model, prompt, controller.signal)
        break
      case 'openai':
        result = await callOpenAICompatible('https://api.openai.com/v1', apiKey, model, prompt, outputFormat, controller.signal)
        break
      case 'google':
        result = await callGemini(apiKey, model, prompt, controller.signal)
        break
      case 'fal':
        result = await callFal(apiKey, model, prompt, controller.signal)
        break
      case 'huggingface':
        result = await callHuggingFace(apiKey, model, prompt, controller.signal)
        break
      case 'tavily':
        result = await callTavily(apiKey, prompt, controller.signal)
        break
      case 'exa':
        result = await callExa(apiKey, prompt, controller.signal)
        break
      default:
        throw new Error(`Unknown provider: ${model.provider}`)
    }

    return result

  } finally {
    clearTimeout(timeout)
  }
}

// Generic OpenAI-compatible API caller (covers DeepSeek, Qwen, Groq, Fireworks, Kimi, etc.)
async function callOpenAICompatible(
  baseUrl: string,
  apiKey: string,
  model: AIModel,
  prompt: string,
  outputFormat: 'text' | 'json',
  signal: AbortSignal
): Promise<{ output: string; tokens_used: number }> {

  const body: any = {
    model: model.apiModelName,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 4096,
    temperature: 0.7,
  }

  if (outputFormat === 'json') {
    body.response_format = { type: 'json_object' }
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal,
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: { message: response.statusText } }))
    const error: any = new Error(err?.error?.message || response.statusText)
    error.status = response.status
    throw error
  }

  const data = await response.json() as any
  return {
    output: data.choices[0].message.content,
    tokens_used: data.usage?.total_tokens || 0,
  }
}
```

---

# PART 5 — COMPLETE PROMPT SYSTEM

## The 8-Layer Prompt Architecture

Every AI call assembles these layers in order. Each layer is stored in KV (fast read).
The builder function in `packages/prompts/src/builder.ts` assembles them.

```
LAYER 0: PERSONA         Who the AI is (human identity with stakes)
LAYER 1: MASTER          Core rules that never change
LAYER 2: ROLE            What job this AI is doing right now
LAYER 3: DOMAIN          Domain-specific knowledge (POD vs Digital vs etc)
LAYER 4: CATEGORY        Category-specific rules (T-shirts vs Mugs vs etc)
LAYER 5: PLATFORM        Platform rules (Etsy vs Gumroad vs etc)
LAYER 6: WINNER INJECT   Patterns learned from your past approvals
LAYER 7: TASK            The actual specific instruction for this step
LAYER 8: OUTPUT SCHEMA   Exact JSON structure expected back
```

---

## LAYER 0 — PERSONA PROMPT

```
You are Marcus Chen.

Background: 15 years building e-commerce businesses. Started with $200 on eBay.
Built a 7-figure Etsy store from scratch. Listed over 4,000 products.
Lost money on 800 of them. Made serious money on 600. Learned from every single one.

You know exactly:
- What titles get clicked at 3% vs 0.3%
- What descriptions make people add to cart vs scroll past
- What price points feel like a deal vs feel cheap
- What images stop the scroll vs blend in
- Which SEO tags actually drive traffic vs look good but do nothing

You are NOT an AI assistant trying to be helpful.
You are a businessman protecting revenue.
You have no patience for generic output.
You would rather produce nothing than produce mediocre.

When you write a title, you think: "Would I click this?"
When you write a description, you think: "Does this make me want to buy?"
When you set a price, you think: "Is this leaving money on the table?"

Stakes: Every piece of content you produce either makes money or wastes my time.
Act accordingly.
```

---

## LAYER 1 — MASTER SYSTEM PROMPT

```
CORE OPERATING RULES (Non-negotiable):

1. BUYER LANGUAGE ONLY
   Never write in seller language. Write in the exact words buyers use.
   Seller: "High-quality premium product"
   Buyer: "Finally something that doesn't fall apart after two washes"
   The difference in those two sentences is the difference between selling and not selling.

2. SPECIFICITY OVER GENERALITY
   "Perfect for cat lovers" → REJECTED
   "Made for people who have a photo of their cat as their phone wallpaper" → ACCEPTED
   The more specific, the more the right buyer feels personally addressed.

3. NO AI FINGERPRINTS
   These phrases are permanently banned:
   - "Perfect for..." "High quality..." "Look no further..."
   - "Are you looking for..." "You won't be disappointed..."
   - "Whether you're a... or a..." "In today's world..."
   - Any sentence that starts with "I" when you're supposed to be writing copy
   - Any phrase that reads like a product description template
   If you catch yourself writing any of these, delete and rewrite.

4. TRANSFORMATION SELLING
   You are never selling a product. You are selling who the buyer becomes.
   A mug isn't a mug. It's the identity of "proud software engineer who finds 
   humor in their craft." A template isn't a template. It's the feeling of 
   finally having their business organized.
   Find the transformation. Sell the transformation.

5. MOBILE FIRST
   70% of Etsy buyers, 85% of TikTok buyers, 60% of Instagram buyers are on phone.
   Your first line must work in 3 seconds on a 6-inch screen.
   If the hook doesn't hit in the first 8 words, the rest doesn't matter.

6. OUTPUT PRECISION
   You will always return output in the exact JSON schema specified.
   No preamble. No explanation. No "Here is the output:"
   Just the JSON. Clean. Parseable. Complete.

7. QUALITY STANDARD
   Before submitting your response, ask yourself one question:
   "If this appeared on a professional's store and they were proud of it,
   would this output justify that pride?"
   If the answer is anything less than yes, rewrite until it is yes.
```

---

## LAYER 2 — ROLE PROMPTS

### Researcher Role
```
YOUR ROLE: Senior Market Intelligence Analyst

Your job is to extract real, actionable market data — not guess, not theorize.
Use the search results provided. Find the signal in the noise.

You are looking for:
1. What is actually selling right now (not what sold 6 months ago)
2. The exact language buyers use when they talk about this product (mine reviews)
3. The specific pain point that makes someone search for this
4. The price point that feels like a no-brainer (not too cheap to trust, not too expensive to click)
5. The gap — what does every competitor miss that a smart seller would fill?

Deliver findings as structured data. No fluff. No "based on my analysis..."
Just the intelligence, formatted for immediate use.
```

### Buyer Psychology Researcher Role
```
YOUR ROLE: Consumer Psychology Analyst

Your specific job: Extract the emotional language buyers actually use.
You are reading competitor reviews (provided below) and extracting:

1. BEFORE STATE: What words describe how they felt BEFORE buying?
   (frustrated, overwhelmed, embarrassed, stuck, jealous, lost)

2. AFTER STATE: What words describe how they feel AFTER buying?
   (proud, organized, excited, relieved, professional, ahead)

3. TRIGGER WORDS: What specific phrases appear in 3+ reviews?
   These are the exact words that should appear in copy.

4. OBJECTIONS: What doubts did buyers mention (even if they still bought)?
   These become the objections to pre-answer in the description.

5. IDENTITY SIGNAL: What does owning this product say about the buyer?
   This is the transformation frame for copywriting.

Output as structured JSON. Every word you extract should be a direct quote from reviews.
```

### Copywriter Role
```
YOUR ROLE: Elite Direct Response Copywriter

Your benchmark: Eugene Schwartz, Gary Halbert, David Ogilvy — but for e-commerce in 2025.

You write copy that makes people stop scrolling, feel understood, and reach for their wallet.

Your weapons:
- Pattern interrupt (the first line breaks expectation)
- Specificity (the details that prove you understand their world)
- Social proof signals (even implied, not just explicit)
- Scarcity of identity ("not everyone gets this" positioning)
- Transformation promise (before and after in one sentence)

Your kryptonite (never use):
- Features without benefits
- Adjectives that don't add specific information
- Any phrase that sounds like it was written by software
- Sentences that could apply to any product in any niche

Write like you have one shot to convince one specific person who is slightly skeptical.
Because that is exactly the situation you are in.
```

### SEO Strategist Role
```
YOUR ROLE: Platform SEO Specialist (2025)

You understand that platform SEO is not the same as Google SEO.
Etsy's algorithm weights: recency, conversion rate, click-through rate, review quality.
Gumroad's algorithm weights: keyword match, purchase history, social proof.

Your job: Make this product findable by the exact buyers who will convert.

Rules:
- Every tag must be an exact phrase a buyer types, not a category you think fits
- The title's first 40 characters are weighted most heavily — front-load the money keyword
- Description's first paragraph is crawled by Google — it must include the primary keyword naturally
- Never keyword-stuff. One keyword repeated 5 times is worse than 5 different related keywords once each
- Tags are buyer phrases, not product descriptions. "notion template for freelancers" not "notion, template, freelance"
```

### Quality Editor Role
```
YOUR ROLE: Pedantic Editor with Zero Tolerance for Waste

You have one job: Remove everything that doesn't earn its place.

Your edit criteria (in this order):
1. Delete every adjective that doesn't add specific, unique information
   "Beautiful design" → delete "beautiful" (every seller says this)
   "Minimalist black design with geometric patterns" → keep (specific)

2. Delete every sentence that repeats what a previous sentence already communicated

3. Delete every phrase that sounds like it could be on any product in any niche

4. Delete anything that addresses the seller's pride instead of the buyer's desire

5. Shorten every sentence that can be shortened without losing meaning
   "This is a product that will help you" → "This helps you"

6. After editing, check: does the remaining content still flow naturally?
   If removing something created an awkward gap, either rewrite the bridge or leave it.

Return ONLY the edited version. Do not explain what you changed. Do not justify deletions.
Just give me the cleaner, stronger version.
```

### Buyer Simulation Role
```
YOUR ROLE: Skeptical Buyer on Mobile

You are: [BUYER_PERSONA from research data]
You are browsing [PLATFORM] on your phone.
You have 8 seconds before you scroll past.
You've bought disappointing products before and you're slightly guarded.

Read the listing below. React as this exact buyer:

1. FIRST IMPRESSION (one sentence, gut reaction in 3 seconds)
2. FIRST QUESTION (what immediately comes to mind that isn't answered?)
3. DECISION (click or scroll — and the specific reason why)
4. THE ONE THING (what single change would make you immediately add to cart?)
5. PRICE REACTION (does the price feel fair, cheap, or expensive for what's offered?)

Be brutally honest. This buyer doesn't owe the seller anything.
Your job is to find the weakness before the real buyer does.
```

### Competitor Comparison Role
```
YOUR ROLE: Market Positioning Analyst

You have the top 3 competitor listings and my listing.
Your job: Be brutally honest about where my listing stands.

Analyze:
1. DIFFERENTIATION: Does my listing stand out or blend in? What specifically makes it different?

2. UNIQUE ANGLE: Is there a phrase, angle, or positioning in my listing that NO competitor uses?
   If yes, identify it exactly.
   If no, state that clearly.

3. CLICK TEST: If all 4 listings appeared in search results simultaneously, which gets clicked first?
   Your answer must be specific: "Listing X gets clicked because [specific reason]"

4. KEYWORD OPPORTUNITY: Is there a search term in the top 3 that my listing is missing?
   Is there a search term my listing uses that no competitor targets? (That's an opportunity.)

5. THE WINNING CHANGE: One specific change that would make my listing definitively better than
   all 3 competitors. Not "improve the description." Exactly what to change and to what.

Deliver findings as a structured JSON object. Every point must be specific and actionable.
```

### CEO Review Role
```
YOUR ROLE: Chief Revenue Officer doing final approval

You have one standard: Would you personally stake your reputation on this product?
Not "is it acceptable." Not "is it good enough." Would you be PROUD to have this on your store?

Score each criterion 1-10. You are harsh but fair.
A score of 7 is a fail. The bar is 8+.

TITLE STRENGTH (1-10)
- Does it include the primary keyword in the first 40 characters?
- Does it create curiosity or convey clear value instantly?
- Is it specific enough to attract the right buyer and repel the wrong one?

DESCRIPTION QUALITY (1-10)
- Does the first line stop the scroll?
- Does it sell the transformation, not just the product?
- Is it free of AI-sounding language?
- Does it answer the buyer's top 3 objections without being asked?

SEO QUALITY (1-10)
- Are the tags exact buyer search phrases (not product categories)?
- Is keyword density natural (not stuffed)?
- Does the description's first paragraph include the primary keyword?

PRICE LOGIC (1-10)
- Is it competitive with the top sellers in this niche?
- Does it end in .97 or .99 (psychologically optimized)?
- Is it positioned for value (not cheapest, not most expensive)?

PLATFORM FIT (1-10)
- Does the tone match this platform's buyer psychology?
- Does it respect the platform's character limits and formatting rules?
- Would a native user of this platform feel this belongs here?

HUMAN QUALITY (1-10)
- Read it out loud. Does it sound like a human wrote it?
- Are there any phrases that would make a real person laugh at how AI it sounds?
- Would it pass an AI detection tool?

COMPETITIVE POSITION (1-10)
- Does it have at least one unique angle no competitor listing uses?
- Would it stand out in a page of similar products?

OVERALL READINESS (1-10)
- If published right now, would it make money within 30 days?

OUTPUT FORMAT (strict JSON):
{
  "overall_score": [average of all scores],
  "approved": [true only if ALL individual scores >= 8],
  "scores": {
    "title": score,
    "description": score,
    "seo": score,
    "price": score,
    "platform_fit": score,
    "human_quality": score,
    "competitive_position": score,
    "overall_readiness": score
  },
  "issues": [
    {
      "criterion": "title",
      "score": 6,
      "problem": "exact description of what is wrong",
      "fix": "exact rewrite or specific instruction"
    }
  ],
  "competitor_gap": "specific untapped angle detected or null",
  "strongest_element": "the single best thing about this listing",
  "revised_sections": {
    "title": "new title if score < 8, else null",
    "description": "new description if score < 8, else null",
    "tags": ["new", "tags", "if", "score", "below", "8"]
  }
}
```

---

## LAYER 3 — DOMAIN PROMPTS (Key Examples)

### POD Domain
```
DOMAIN: Print-on-Demand (POD)

Market reality for 2025:
- Etsy has 96 million buyers. 70% browse on mobile.
- The average buyer decides in 2-3 seconds based on thumbnail + title only.
- Hyper-niche identity products massively outperform generic designs.
  "Dog owner" → weak. "Golden Retriever mom who works from home" → strong.
- The best-selling POD products are identity statements, not just designs.
  Buyers are saying: "This is who I am and I want others to know it."
- Text-based designs outperform illustration-heavy designs for new sellers.
  Text is clear on thumbnails. Complex art gets lost at 150px.

POD-specific rules:
- ALWAYS mention: unisex sizing, true-to-size, soft material (if apparel)
- ALWAYS include a size guide CTA: "Check our size chart before ordering"
- Design must work on BOTH light and dark colored products unless specified
- Price formula: Printful cost × 2.5 = minimum. × 3 = healthy margin.
- Best price endings for POD: $24.99, $29.99, $34.99
- Etsy tags for POD: use "[niche] gift" "[niche] shirt" "[identity] tee" "[occasion] present"
```

### Digital Products Domain
```
DOMAIN: Digital Products (instant download)

Market reality for 2025:
- Gumroad has $500M+ processed. Average conversion: 2-4% from product page.
- Buyers don't want information. They want transformation. They want the outcome.
  "100-page guide to productivity" → weak
  "The system that helped me reclaim 2 hours every day in 30 days" → strong
- Digital product buyers are sophisticated. They've bought bad products before.
  They are looking for red flags: generic content, AI-written fluff, vague promises.
- Preview images convert. Show a screenshot of actual content pages.
  Describe the interior visually: "You'll get 12 fillable Notion pages with..."
- The best-converting price points: $9, $17, $27, $47, $97
  Never $10, $20, $30 — these feel arbitrary. $27 feels considered.

Digital product rules:
- ALWAYS specify: "Instant download after purchase"
- ALWAYS specify: "Compatible with [free tools]" where relevant
- ALWAYS include what they get (the deliverable) and what they achieve (the outcome)
- For Notion templates: specify "Free Notion account required"
- For PDFs: specify page count and whether it's fillable
```

---

## LAYER 6 — WINNER PATTERN INJECTION

This layer is auto-generated from your approval history and injected dynamically.

```
YOUR PERSONAL WINNING PATTERNS (learned from [X] approved products):

Title patterns that work for you:
[Dynamically injected from winner_patterns table]
Example: "Titles starting with a specific identity group convert best for your audience"

Price points that work:
[Dynamically injected]
Example: "$27.99 outperforms $24.99 and $29.99 in your niche by 23%"

Description length that works:
[Dynamically injected]
Example: "Descriptions under 180 words outperform longer ones by 2x for your products"

Top performing tags from your store:
[Dynamically injected]
Example: "Tags including 'notion lover' and 'productivity gift' drive 40% of your traffic"

Apply these patterns to this product. They are proven for your specific market.
```

---

# PART 6 — COMPLETE WORKFLOW DEFINITIONS

## How CF Workflows Work in NEXUS

Each product run = one CF Workflow instance.
The Workflow is defined in `nexus-api` and calls `nexus-ai` via Service Binding.
Every step result is saved to D1 in real time.
The frontend polls `/api/workflow/:id/status` every 3 seconds to show live progress.

## Universal Workflow Step Runner

```typescript
// apps/nexus-api/src/services/workflow-engine.ts

import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers'

export class ProductWorkflow extends WorkflowEntrypoint<Env, WorkflowParams> {

  async run(event: WorkflowEvent<WorkflowParams>, step: WorkflowStep) {
    const { productId, domainSlug, categorySlug, userInput, runId } = event.payload

    // Load domain + category config from KV (fast read)
    const domainConfig = JSON.parse(
      await step.do('load_domain_config', () =>
        this.env.CONFIG.get(`config:domain:${domainSlug}`)
      )
    )

    // Load winner patterns for this domain/category
    const winnerPatterns = JSON.parse(
      await step.do('load_winner_patterns', () =>
        this.env.CONFIG.get(`winners:${domainSlug}:${categorySlug}`) || 'null'
      ) || 'null'
    )

    // ─────────────────────────────────────────────
    // STEP 1: Market Research
    // ─────────────────────────────────────────────
    const marketResearch = await step.do('research_market', async () => {
      await updateStepStatus(this.env, runId, 'research_market', 'running')

      const prompt = await buildPrompt({
        env: this.env,
        layers: ['persona', 'master', 'role:researcher', `domain:${domainSlug}`, `category:${categorySlug}`],
        task: buildMarketResearchTask(userInput, domainConfig),
        winnerPatterns,
        outputSchema: SCHEMAS.marketResearch,
      })

      const result = await this.env.AI_WORKER.runTask({
        taskType: 'research_market',
        prompt,
        outputFormat: 'json',
      })

      await saveStepResult(this.env, runId, 'research_market', result)
      return result.output
    })

    // ─────────────────────────────────────────────
    // STEP 2: Buyer Psychology Research
    // ─────────────────────────────────────────────
    const psychResearch = await step.do('research_psychology', async () => {
      await updateStepStatus(this.env, runId, 'research_psychology', 'running')

      const prompt = await buildPrompt({
        env: this.env,
        layers: ['persona', 'master', 'role:psychology_researcher', `domain:${domainSlug}`],
        task: buildPsychologyResearchTask(marketResearch, userInput),
        outputSchema: SCHEMAS.psychologyResearch,
      })

      const result = await this.env.AI_WORKER.runTask({
        taskType: 'research_psychology',
        prompt,
        outputFormat: 'json',
      })

      await saveStepResult(this.env, runId, 'research_psychology', result)
      return result.output
    })

    // ─────────────────────────────────────────────
    // STEP 3: SEO Keyword Research
    // ─────────────────────────────────────────────
    const keywords = await step.do('research_keywords', async () => {
      await updateStepStatus(this.env, runId, 'research_keywords', 'running')
      const result = await this.env.AI_WORKER.runTask({
        taskType: 'research_keywords',
        prompt: buildKeywordResearchTask(marketResearch, userInput, domainSlug),
        outputFormat: 'json',
      })
      await saveStepResult(this.env, runId, 'research_keywords', result)
      return result.output
    })

    // ─────────────────────────────────────────────
    // STEP 4: Content Generation
    // (domain-specific: text for digital, image prompts for POD, audio prompts for music)
    // ─────────────────────────────────────────────
    const generatedContent = await step.do('generate_content', async () => {
      await updateStepStatus(this.env, runId, 'generate_content', 'running')

      const taskType = getContentTaskType(domainSlug) // 'generate_long_form' | 'generate_short_copy' | etc
      const prompt = await buildPrompt({
        env: this.env,
        layers: ['persona', 'master', 'role:copywriter', `domain:${domainSlug}`, `category:${categorySlug}`],
        task: buildContentTask(marketResearch, psychResearch, keywords, userInput),
        winnerPatterns,
        outputSchema: SCHEMAS.generatedContent,
      })

      const result = await this.env.AI_WORKER.runTask({ taskType, prompt, outputFormat: 'json' })
      await saveStepResult(this.env, runId, 'generate_content', result)
      return result.output
    })

    // ─────────────────────────────────────────────
    // STEP 5: Asset Generation
    // (images for POD, PDF for digital, audio for music — runs in parallel)
    // ─────────────────────────────────────────────
    const assets = await step.do('generate_assets', async () => {
      await updateStepStatus(this.env, runId, 'generate_assets', 'running')

      const assetTasks = buildAssetTasks(domainSlug, generatedContent, userInput)

      // Run multiple asset generations in PARALLEL
      const results = await Promise.allSettled(
        assetTasks.map(task =>
          this.env.AI_WORKER.runTask({ taskType: task.type, prompt: task.prompt })
        )
      )

      const uploadedAssets = await Promise.all(
        results
          .filter(r => r.status === 'fulfilled')
          .map(async (r: any) => {
            // Upload to R2
            const key = `products/${productId}/assets/${crypto.randomUUID()}`
            await this.env.ASSETS.put(key, r.value.output)
            // Save to D1
            return saveAsset(this.env, productId, key)
          })
      )

      await saveStepResult(this.env, runId, 'generate_assets', { count: uploadedAssets.length })
      return uploadedAssets
    })

    // ─────────────────────────────────────────────
    // STEP 6: SEO Formatting
    // ─────────────────────────────────────────────
    const seoData = await step.do('generate_seo', async () => {
      await updateStepStatus(this.env, runId, 'generate_seo', 'running')

      const prompt = await buildPrompt({
        env: this.env,
        layers: ['persona', 'master', 'role:seo_strategist', `domain:${domainSlug}`, `category:${categorySlug}`],
        task: buildSEOTask(generatedContent, keywords, marketResearch),
        outputSchema: SCHEMAS.seoData,
      })

      const result = await this.env.AI_WORKER.runTask({
        taskType: 'generate_seo_tags',
        prompt,
        outputFormat: 'json',
      })

      await saveStepResult(this.env, runId, 'generate_seo', result)
      return result.output
    })

    // ─────────────────────────────────────────────
    // STEP 7: Title A/B/C Variants
    // ─────────────────────────────────────────────
    const titleVariants = await step.do('generate_title_variants', async () => {
      await updateStepStatus(this.env, runId, 'generate_title_variants', 'running')

      const prompt = buildTitleVariantsTask(
        generatedContent, keywords, marketResearch, psychResearch
      )

      // Generate 3 different title angles
      const [varA, varB, varC] = await Promise.all([
        this.env.AI_WORKER.runTask({ taskType: 'generate_short_copy', prompt: prompt.angleA }),
        this.env.AI_WORKER.runTask({ taskType: 'generate_short_copy', prompt: prompt.angleB }),
        this.env.AI_WORKER.runTask({ taskType: 'generate_short_copy', prompt: prompt.angleC }),
      ])

      const variants = { a: varA.output, b: varB.output, c: varC.output }
      await saveTitleVariants(this.env, productId, variants)
      return variants
    })

    // ─────────────────────────────────────────────
    // QUALITY PASS 1: Pedantic Editor
    // ─────────────────────────────────────────────
    const editedContent = await step.do('quality_editor', async () => {
      await updateStepStatus(this.env, runId, 'quality_editor', 'running')

      const prompt = await buildPrompt({
        env: this.env,
        layers: ['master', 'role:quality_editor'],
        task: buildEditorTask(generatedContent, seoData),
        outputSchema: SCHEMAS.editedContent,
      })

      const result = await this.env.AI_WORKER.runTask({
        taskType: 'quality_editor',
        prompt,
        outputFormat: 'json',
      })

      await saveStepResult(this.env, runId, 'quality_editor', result)
      return result.output
    })

    // ─────────────────────────────────────────────
    // QUALITY PASS 2: Buyer Simulation
    // ─────────────────────────────────────────────
    const buyerFeedback = await step.do('quality_buyer_sim', async () => {
      await updateStepStatus(this.env, runId, 'quality_buyer_sim', 'running')

      const prompt = await buildPrompt({
        env: this.env,
        layers: ['master', 'role:buyer_simulation'],
        task: buildBuyerSimTask(editedContent, psychResearch),
        outputSchema: SCHEMAS.buyerFeedback,
      })

      const result = await this.env.AI_WORKER.runTask({
        taskType: 'quality_buyer_sim',
        prompt,
        outputFormat: 'json',
      })

      // If buyer sim identifies unanswered questions, auto-patch the description
      const patchedContent = await applyBuyerFeedback(this.env, editedContent, result.output)
      await saveStepResult(this.env, runId, 'quality_buyer_sim', result)
      return patchedContent
    })

    // ─────────────────────────────────────────────
    // QUALITY PASS 3: Competitor Comparison
    // ─────────────────────────────────────────────
    const competitorAnalysis = await step.do('quality_competitor', async () => {
      await updateStepStatus(this.env, runId, 'quality_competitor', 'running')

      const prompt = await buildPrompt({
        env: this.env,
        layers: ['master', 'role:competitor_comparison'],
        task: buildCompetitorTask(buyerFeedback, marketResearch),
        outputSchema: SCHEMAS.competitorAnalysis,
      })

      const result = await this.env.AI_WORKER.runTask({
        taskType: 'quality_competitor',
        prompt,
        outputFormat: 'json',
      })

      await saveStepResult(this.env, runId, 'quality_competitor', result)
      return result.output
    })

    // ─────────────────────────────────────────────
    // HUMANIZER PASS
    // ─────────────────────────────────────────────
    const humanizedContent = await step.do('humanize', async () => {
      await updateStepStatus(this.env, runId, 'humanize', 'running')

      const result = await this.env.AI_WORKER.runTask({
        taskType: 'humanize',
        prompt: buildHumanizeTask(buyerFeedback),
        outputFormat: 'json',
      })

      await saveStepResult(this.env, runId, 'humanize', result)
      return result.output
    })

    // ─────────────────────────────────────────────
    // REVENUE ESTIMATOR
    // ─────────────────────────────────────────────
    const revenueEstimate = await step.do('revenue_estimate', async () => {
      await updateStepStatus(this.env, runId, 'revenue_estimate', 'running')

      const result = await this.env.AI_WORKER.runTask({
        taskType: 'revenue_estimate',
        prompt: buildRevenueTask(humanizedContent, seoData, marketResearch, competitorAnalysis),
        outputFormat: 'json',
      })

      await saveStepResult(this.env, runId, 'revenue_estimate', result)
      return result.output
    })

    // ─────────────────────────────────────────────
    // PLATFORM VARIATIONS
    // ─────────────────────────────────────────────
    await step.do('generate_platform_variants', async () => {
      await updateStepStatus(this.env, runId, 'generate_platform_variants', 'running')

      const platforms = JSON.parse(await this.env.CONFIG.get('config:platforms') || '[]')
      const selectedPlatforms = platforms.filter((p: any) =>
        userInput.selected_platform_ids?.includes(p.id)
      )

      // Generate variants for all selected platforms IN PARALLEL
      await Promise.all(
        selectedPlatforms.map(async (platform: any) => {
          const platformPrompt = await this.env.CONFIG.get(`prompts:platform:${platform.slug}`)
          const result = await this.env.AI_WORKER.runTask({
            taskType: 'platform_variation',
            prompt: buildPlatformVariationTask(humanizedContent, seoData, platform, platformPrompt),
            outputFormat: 'json',
          })
          await savePlatformVariant(this.env, productId, platform.id, result.output)
        })
      )
    })

    // ─────────────────────────────────────────────
    // SOCIAL MEDIA CONTENT
    // ─────────────────────────────────────────────
    await step.do('generate_social_content', async () => {
      if (!userInput.post_to_social) return null
      await updateStepStatus(this.env, runId, 'generate_social_content', 'running')

      const selectedChannels = userInput.selected_social_channel_ids || []

      await Promise.all(
        selectedChannels.map(async (channelId: string) => {
          const channelPrompt = await this.env.CONFIG.get(`prompts:social:${channelId}`)
          const result = await this.env.AI_WORKER.runTask({
            taskType: 'social_adaptation',
            prompt: buildSocialTask(humanizedContent, channelId, channelPrompt),
            outputFormat: 'json',
          })
          await saveSocialVariant(this.env, productId, channelId, result.output)
        })
      )
    })

    // ─────────────────────────────────────────────
    // LISTING HEALTH CHECK
    // ─────────────────────────────────────────────
    const healthCheck = await step.do('listing_health_check', async () => {
      await updateStepStatus(this.env, runId, 'listing_health_check', 'running')
      const results = await runHealthCheck(humanizedContent, seoData, userInput.selected_platform_ids)
      await saveStepResult(this.env, runId, 'listing_health_check', results)
      return results
    })

    // ─────────────────────────────────────────────
    // LAUNCH BOOST PACK
    // ─────────────────────────────────────────────
    const launchPack = await step.do('generate_launch_pack', async () => {
      await updateStepStatus(this.env, runId, 'generate_launch_pack', 'running')
      const pack = await generateLaunchBoostPack(this.env, humanizedContent, userInput)
      await saveStepResult(this.env, runId, 'generate_launch_pack', pack)
      return pack
    })

    // ─────────────────────────────────────────────
    // FINAL CEO REVIEW (AI pre-review before your eyes)
    // ─────────────────────────────────────────────
    const ceoReview = await step.do('quality_ceo', async () => {
      await updateStepStatus(this.env, runId, 'quality_ceo', 'running')

      const prompt = await buildPrompt({
        env: this.env,
        layers: ['persona', 'master', 'role:ceo_reviewer'],
        task: buildCEOReviewTask(humanizedContent, seoData, competitorAnalysis, revenueEstimate),
        outputSchema: SCHEMAS.ceoReview,
      })

      const result = await this.env.AI_WORKER.runTask({
        taskType: 'quality_ceo',
        prompt,
        outputFormat: 'json',
      })

      const review = JSON.parse(result.output)

      // Save review to D1
      await saveReview(this.env, productId, runId, review)

      // Auto-apply AI-suggested fixes for sections that scored below 8
      if (!review.approved && review.revised_sections) {
        await applyRevisions(this.env, productId, review.revised_sections)
      }

      await saveStepResult(this.env, runId, 'quality_ceo', review)
      return review
    })

    // ─────────────────────────────────────────────
    // FINALIZE — Mark as PENDING_REVIEW
    // ─────────────────────────────────────────────
    await step.do('finalize', async () => {
      await this.env.DB.prepare(
        'UPDATE products SET status = ?, ai_score = ?, updated_at = ? WHERE id = ?'
      ).bind('pending_review', ceoReview.overall_score, new Date().toISOString(), productId).run()

      await this.env.DB.prepare(
        'UPDATE workflow_runs SET status = ?, completed_at = ? WHERE id = ?'
      ).bind('completed', new Date().toISOString(), runId).run()

      // Invalidate product cache
      await this.env.CONFIG.delete(`product:${productId}`)
    })
  }
}
```

---

# PART 7 — FRONTEND (COMPLETE PAGE BY PAGE)

## Tech Setup
```
Framework:  Next.js 14 App Router
Styling:    Tailwind CSS + shadcn/ui components
State:      React useState + useEffect (no Redux needed for personal app)
API calls:  Native fetch with typed wrapper in lib/api.ts
Polling:    useEffect with setInterval for workflow progress (every 3 seconds)
```

## lib/api.ts — Typed API Client

```typescript
// apps/web/lib/api.ts

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://nexus-api.YOUR_SUBDOMAIN.workers.dev'

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }))
    throw new Error(error.message || `API error: ${res.status}`)
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
  updateCategory: (id: string, data: Partial<Category>) => apiFetch<Category>(`/api/categories/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteCategory: (id: string) => apiFetch<void>(`/api/categories/${id}`, { method: 'DELETE' }),

  // Workflow
  startWorkflow: (data: StartWorkflowInput) => apiFetch<{ workflow_id: string; product_id: string }>('/api/workflow/start', { method: 'POST', body: JSON.stringify(data) }),
  getWorkflowStatus: (id: string) => apiFetch<WorkflowStatus>(`/api/workflow/${id}/status`),

  // Review
  approveProduct: (productId: string) => apiFetch<void>(`/api/review/${productId}/approve`, { method: 'POST' }),
  rejectProduct: (productId: string, feedback: string) => apiFetch<void>(`/api/review/${productId}/reject`, { method: 'POST', body: JSON.stringify({ feedback }) }),

  // Products
  getProducts: (filters?: ProductFilters) => apiFetch<Product[]>(`/api/products?${new URLSearchParams(filters as any)}`),
  getProduct: (id: string) => apiFetch<ProductDetail>(`/api/products/${id}`),
  deleteProduct: (id: string) => apiFetch<void>(`/api/products/${id}`, { method: 'DELETE' }),

  // Trends
  getTrends: () => apiFetch<TrendAlert[]>('/api/trends'),
  dismissTrend: (id: string) => apiFetch<void>(`/api/trends/${id}/dismiss`, { method: 'POST' }),
  startTrendWorkflow: (id: string) => apiFetch<{ workflow_id: string }>(`/api/trends/${id}/start`, { method: 'POST' }),

  // Winners
  getWinnerPatterns: () => apiFetch<WinnerPattern[]>('/api/winners'),

  // AI Models
  getAIModels: () => apiFetch<AIModelStatus[]>('/api/ai-models'),
  updateAIModel: (id: string, data: Partial<AIModelStatus>) => apiFetch<AIModelStatus>(`/api/ai-models/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

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
}
```

---

## Page: Home / Domain Cards (app/page.tsx)

```typescript
// apps/web/app/page.tsx
'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import DomainCard from '@/components/domain/DomainCard'
import { Plus } from 'lucide-react'
import Link from 'next/link'
import type { Domain } from '@/lib/types'

export default function HomePage() {
  const [domains, setDomains] = useState<Domain[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getDomains()
      .then(setDomains)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <DomainGridSkeleton />

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">NEXUS</h1>
        <p className="text-gray-500 mt-1">Select a domain to start creating</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {domains.map(domain => (
          <Link key={domain.id} href={`/${domain.slug}`}>
            <DomainCard domain={domain} />
          </Link>
        ))}

        {/* Add New Domain */}
        <Link href="/manager/domains?action=new">
          <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-2xl p-6 flex flex-col items-center justify-center gap-2 h-40 hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950 transition-all cursor-pointer">
            <Plus className="w-8 h-8 text-gray-400" />
            <span className="text-sm text-gray-500 font-medium">Add Domain</span>
          </div>
        </Link>
      </div>
    </div>
  )
}
```

---

## Page: Product Setup Form (app/[domain]/[category]/page.tsx)

This is the most important page. Full spec:

```typescript
// apps/web/app/[domain]/[category]/page.tsx
'use client'
import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { api } from '@/lib/api'
import type { Platform, SocialChannel } from '@/lib/types'

interface FormState {
  language: string
  niche: string
  product_name: string
  description: string
  keywords: string
  selected_platform_ids: string[]
  post_to_social: boolean
  selected_social_channel_ids: string[]
  social_posting_mode: 'auto' | 'manual'
  // AI options
  let_ai_price: boolean
  let_ai_audience: boolean
  let_ai_style: boolean
}

export default function ProductSetupPage() {
  const params = useParams()
  const router = useRouter()
  const [platforms, setPlatforms] = useState<Platform[]>([])
  const [socialChannels, setSocialChannels] = useState<SocialChannel[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState<FormState>({
    language: 'en',
    niche: '',
    product_name: '',
    description: '',
    keywords: '',
    selected_platform_ids: [],
    post_to_social: false,
    selected_social_channel_ids: [],
    social_posting_mode: 'manual',
    let_ai_price: true,
    let_ai_audience: true,
    let_ai_style: true,
  })

  useEffect(() => {
    Promise.all([api.getPlatforms(), api.getSocialChannels()])
      .then(([p, s]) => { setPlatforms(p); setSocialChannels(s) })
  }, [])

  const togglePlatform = (id: string) => {
    setForm(f => ({
      ...f,
      selected_platform_ids: f.selected_platform_ids.includes(id)
        ? f.selected_platform_ids.filter(p => p !== id)
        : [...f.selected_platform_ids, id]
    }))
  }

  const toggleSocial = (id: string) => {
    setForm(f => ({
      ...f,
      selected_social_channel_ids: f.selected_social_channel_ids.includes(id)
        ? f.selected_social_channel_ids.filter(s => s !== id)
        : [...f.selected_social_channel_ids, id]
    }))
  }

  const handleStart = async () => {
    setSubmitting(true)
    try {
      const result = await api.startWorkflow({
        domain_slug: params.domain as string,
        category_slug: params.category as string,
        user_input: form,
      })
      router.push(`/workflow/${result.workflow_id}`)
    } catch (e) {
      console.error(e)
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-8">
      {/* Breadcrumb */}
      <nav className="text-sm text-gray-500 mb-6">
        <span>← {params.domain}</span> › <span>{params.category}</span>
      </nav>

      <h1 className="text-2xl font-bold mb-2">Product Setup</h1>
      <p className="text-gray-500 text-sm mb-8">
        All fields are optional. Leave empty and AI does everything.
        Fill any field to guide the AI in that direction.
      </p>

      <div className="space-y-6">

        {/* Language */}
        <div>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Language</label>
          <select
            value={form.language}
            onChange={e => setForm(f => ({ ...f, language: e.target.value }))}
            className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
          >
            <option value="en">English</option>
            <option value="fr">French</option>
            <option value="ar">Arabic</option>
            <option value="es">Spanish</option>
            <option value="de">German</option>
          </select>
        </div>

        {/* Optional Fields */}
        {[
          { key: 'niche', label: 'Niche', placeholder: 'e.g. "freelancers", "dog moms", "backend developers"' },
          { key: 'product_name', label: 'Product Name', placeholder: 'e.g. "Freelancer CRM" — or leave empty for AI' },
          { key: 'description', label: 'Brief Description', placeholder: 'What this product does — or leave empty for AI' },
          { key: 'keywords', label: 'Keywords', placeholder: 'e.g. "notion, freelance, crm" — or leave empty for AI' },
        ].map(({ key, label, placeholder }) => (
          <div key={key}>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {label} <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={(form as any)[key]}
              onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
              placeholder={placeholder}
              className="mt-1 w-full border rounded-lg px-3 py-2 text-sm placeholder:text-gray-400"
            />
          </div>
        ))}

        {/* Platform Selection */}
        <div>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-2">
            Post to Platforms
          </label>
          <div className="flex flex-wrap gap-2">
            {platforms.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => togglePlatform(p.id)}
                className={`px-4 py-2 rounded-full text-sm font-medium border transition-all ${
                  form.selected_platform_ids.includes(p.id)
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white dark:bg-gray-800 border-gray-300 text-gray-700 dark:text-gray-300'
                }`}
              >
                {p.name}
              </button>
            ))}
            <button
              type="button"
              onClick={() => router.push('/manager/platforms?action=new')}
              className="px-4 py-2 rounded-full text-sm border border-dashed border-gray-300 text-gray-400 hover:border-indigo-400"
            >
              + Add Platform
            </button>
          </div>
        </div>

        {/* Social Media */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Post to Social Media?
            </label>
            <div className="flex gap-3">
              {['yes', 'no'].map(v => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, post_to_social: v === 'yes' }))}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                    form.post_to_social === (v === 'yes')
                      ? 'bg-indigo-600 text-white'
                      : 'border border-gray-300 text-gray-600'
                  }`}
                >
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {form.post_to_social && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {socialChannels.map(ch => (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => toggleSocial(ch.id)}
                    className={`px-4 py-2 rounded-full text-sm font-medium border transition-all ${
                      form.selected_social_channel_ids.includes(ch.id)
                        ? 'bg-purple-600 text-white border-purple-600'
                        : 'bg-white dark:bg-gray-800 border-gray-300 text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    {ch.name}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => router.push('/manager/social?action=new')}
                  className="px-4 py-2 rounded-full text-sm border border-dashed border-gray-300 text-gray-400 hover:border-purple-400"
                >
                  + Add Channel
                </button>
              </div>

              {/* Posting Mode Override */}
              <div className="flex items-center gap-3 text-sm text-gray-600">
                <span>Posting mode:</span>
                {(['manual', 'auto'] as const).map(mode => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, social_posting_mode: mode }))}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                      form.social_posting_mode === mode
                        ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
                        : 'border border-gray-300 text-gray-500'
                    }`}
                  >
                    {mode.charAt(0).toUpperCase() + mode.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* AI Options */}
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">AI Decisions</p>
          <div className="space-y-2">
            {[
              { key: 'let_ai_price', label: 'Let AI suggest price' },
              { key: 'let_ai_audience', label: 'Let AI define target audience' },
              { key: 'let_ai_style', label: 'Let AI choose design style' },
            ].map(({ key, label }) => (
              <label key={key} className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={(form as any)[key]}
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.checked }))}
                  className="rounded"
                />
                <span className="text-sm text-gray-600 dark:text-gray-400">{label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-4">
          <button
            onClick={handleStart}
            disabled={submitting}
            className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-xl transition-all disabled:opacity-60"
          >
            {submitting ? 'Starting...' : 'Start Workflow →'}
          </button>
          <button className="px-6 py-3 border border-gray-300 rounded-xl text-gray-600 hover:bg-gray-50 transition-all text-sm font-medium">
            Save Draft
          </button>
        </div>
      </div>
    </div>
  )
}
```

---

## Page: Workflow Progress (app/workflow/[id]/page.tsx)

```typescript
// apps/web/app/workflow/[id]/page.tsx
'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import type { WorkflowStatus } from '@/lib/types'

const STEP_LABELS: Record<string, string> = {
  research_market:           '① Market Research',
  research_psychology:       '② Buyer Psychology',
  research_keywords:         '③ Keyword Research',
  generate_content:          '④ Content Generation',
  generate_assets:           '⑤ Asset Creation',
  generate_seo:              '⑥ SEO Optimization',
  generate_title_variants:   '⑦ Title A/B Variants',
  quality_editor:            '⑧ Pedantic Edit Pass',
  quality_buyer_sim:         '⑨ Buyer Simulation',
  quality_competitor:        '⑩ Competitor Analysis',
  humanize:                  '⑪ Humanizer Pass',
  revenue_estimate:          '⑫ Revenue Estimate',
  generate_platform_variants:'⑬ Platform Variations',
  generate_social_content:   '⑭ Social Content',
  listing_health_check:      '⑮ Health Check',
  generate_launch_pack:      '⑯ Launch Boost Pack',
  quality_ceo:               '⑰ CEO AI Pre-Review',
  finalize:                  '⑱ Finalizing',
}

export default function WorkflowPage() {
  const params = useParams()
  const router = useRouter()
  const [status, setStatus] = useState<WorkflowStatus | null>(null)

  useEffect(() => {
    const poll = async () => {
      const s = await api.getWorkflowStatus(params.id as string)
      setStatus(s)

      // If complete, redirect to review
      if (s.status === 'completed') {
        clearInterval(interval)
        router.push(`/review/${s.product_id}`)
      }
    }

    poll()
    const interval = setInterval(poll, 3000) // Poll every 3 seconds
    return () => clearInterval(interval)
  }, [params.id])

  if (!status) return <WorkflowSkeleton />

  const steps = Object.entries(STEP_LABELS)
  const currentStepIndex = steps.findIndex(([key]) => key === status.current_step)

  return (
    <div className="max-w-2xl mx-auto p-8">
      <h1 className="text-2xl font-bold mb-2">Workflow Running</h1>
      <p className="text-gray-500 text-sm mb-8">
        You can close this tab. The workflow continues in the background.
        You'll see the result when you return.
      </p>

      {/* Overall Progress Bar */}
      <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-2 mb-8">
        <div
          className="bg-indigo-600 h-2 rounded-full transition-all duration-1000"
          style={{ width: `${Math.round((currentStepIndex / steps.length) * 100)}%` }}
        />
      </div>

      {/* Step List */}
      <div className="space-y-2">
        {steps.map(([key, label], idx) => {
          const stepData = status.steps?.find(s => s.step_name === key)
          const isDone = stepData?.status === 'completed'
          const isRunning = stepData?.status === 'running'
          const isFailed = stepData?.status === 'failed'
          const isWaiting = !stepData || stepData.status === 'waiting'

          return (
            <div
              key={key}
              className={`flex items-center gap-3 p-3 rounded-lg transition-all ${
                isRunning ? 'bg-indigo-50 dark:bg-indigo-950 border border-indigo-200' : ''
              }`}
            >
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs flex-shrink-0 ${
                isDone ? 'bg-green-500 text-white' :
                isRunning ? 'bg-indigo-600 text-white animate-pulse' :
                isFailed ? 'bg-red-500 text-white' :
                'bg-gray-200 dark:bg-gray-700 text-gray-400'
              }`}>
                {isDone ? '✓' : isRunning ? '⟳' : isFailed ? '✕' : '○'}
              </div>

              <span className={`text-sm ${
                isDone ? 'text-gray-500 line-through' :
                isRunning ? 'font-medium text-indigo-700 dark:text-indigo-300' :
                'text-gray-400'
              }`}>
                {label}
              </span>

              {stepData?.ai_model_used && (
                <span className="ml-auto text-xs text-gray-400 font-mono">
                  {stepData.ai_model_used}
                </span>
              )}
            </div>
          )
        })}
      </div>

      {status.status === 'failed' && (
        <div className="mt-6 p-4 bg-red-50 dark:bg-red-950 rounded-xl border border-red-200 text-red-700 dark:text-red-300 text-sm">
          <strong>Workflow failed:</strong> {status.error}
        </div>
      )}
    </div>
  )
}
```

---

## Page: CEO Review Screen (app/review/[id]/page.tsx)

The most important page. Section-by-section scores. Inline editing. A/B variants. Full preview per platform.

```typescript
// Condensed spec — full implementation follows this structure:

// SECTIONS SHOWN:
// 1. Top bar: AI score badge + Approved/Needs Work indicator
// 2. Left column (main content):
//    a. Title section with A/B/C variant picker
//    b. Description with inline edit button
//    c. Tags list with inline edit
//    d. Price with revenue estimate
//    e. Platform variant tabs (click to see each platform's version)
//    f. Social content tabs (click to see each channel's content)
// 3. Right sidebar:
//    a. Section scores (each with color-coded bar + score/10)
//    b. Issues list with specific fixes
//    c. Competitor gap alert (if detected)
//    d. Listing health check results
//    e. Launch boost pack summary
// 4. Bottom bar:
//    a. APPROVE button (green, prominent)
//    b. REJECT button + feedback textarea (appears on click)
//    c. Send back to AI (submits rejection)

// CEO Review Screen shows:
// - Scores: title, description, seo, price, platform_fit, human_quality, competitive_position
// - Each score has: color bar (red < 6, yellow 6-7, green >= 8), score number, click to expand issues
// - Issues: exact problem + exact fix (from AI review)
// - Title variants: 3 radio buttons, selecting one updates the product
// - Inline edit: any section can be edited directly, saves on blur
// - Platform tabs: shows platform-specific version of listing
// - Social tabs: shows each channel's adapted content
// - Launch boost pack: 3 timed social posts for launch window
// - Health check: checklist of platform requirements (all must be green to publish)
```

---

# PART 8 — SPECIAL FEATURES IMPLEMENTATION

## Feature 1: Trend Radar (Daily Cron)

```typescript
// In nexus-api wrangler.toml:
// [triggers]
// crons = ["0 6 * * *"]  ← runs every day at 6am UTC

// apps/nexus-api/src/index.ts
export default {
  // ... normal fetch handler ...

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runTrendRadar(env))
  }
}

async function runTrendRadar(env: Env) {
  const domains = JSON.parse(await env.CONFIG.get('config:domains') || '[]')

  for (const domain of domains) {
    const searchQuery = buildTrendQuery(domain.slug)

    // Search for trends
    const trendData = await env.AI_WORKER.runTask({
      taskType: 'trend_analysis',
      prompt: buildTrendAnalysisPrompt(domain, searchQuery),
      outputFormat: 'json',
    })

    const trends = JSON.parse(trendData.output)

    // Score each trend 1-10
    for (const trend of trends) {
      if (trend.score >= 7) {  // Only alert on strong trends
        await env.DB.prepare(`
          INSERT INTO trend_alerts (id, domain_id, trend_keyword, trend_score, demand_window, source, suggested_niche, detected_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          crypto.randomUUID(),
          domain.id,
          trend.keyword,
          trend.score,
          trend.demand_window,
          trend.source,
          trend.suggested_niche,
          new Date().toISOString()
        ).run()
      }
    }
  }

  // Update KV with latest trends for fast frontend reads
  const latestTrends = await env.DB.prepare(
    "SELECT * FROM trend_alerts WHERE status = 'new' ORDER BY detected_at DESC LIMIT 20"
  ).all()

  await env.CONFIG.put('trends:latest', JSON.stringify(latestTrends.results), {
    expirationTtl: 90000 // ~25 hours (replaced by next daily run)
  })
}
```

## Feature 2: Winner Pattern Tracker

```typescript
// apps/nexus-api/src/services/winner-tracker.ts
// Called every time you approve a product

export async function trackWinnerPattern(
  env: Env,
  productId: string,
  domainId: string,
  categoryId: string
) {
  // Get the approved product's full data
  const product = await env.DB.prepare(
    'SELECT * FROM products WHERE id = ?'
  ).bind(productId).first()

  const review = await env.DB.prepare(
    "SELECT * FROM reviews WHERE product_id = ? AND decision = 'approved' ORDER BY reviewed_at DESC LIMIT 1"
  ).bind(productId).first()

  if (!product || !review) return

  const productData = JSON.parse(product.user_input as string || '{}')
  const sectionScores = JSON.parse(review.section_scores as string || '{}')

  // Extract patterns to track
  const patterns = [
    {
      pattern_type: 'price_range',
      pattern_value: JSON.stringify({ price: productData.price, score: sectionScores.price }),
    },
    {
      pattern_type: 'title_structure',
      pattern_value: JSON.stringify({ structure: extractTitleStructure(productData.title) }),
    },
    {
      pattern_type: 'description_length',
      pattern_value: JSON.stringify({ words: countWords(productData.description) }),
    },
  ]

  for (const pattern of patterns) {
    // Check if similar pattern exists
    const existing = await env.DB.prepare(`
      SELECT * FROM winner_patterns
      WHERE domain_id = ? AND category_id = ? AND pattern_type = ?
    `).bind(domainId, categoryId, pattern.pattern_type).first()

    if (existing) {
      // Increase confidence
      await env.DB.prepare(`
        UPDATE winner_patterns
        SET sample_count = sample_count + 1,
            confidence = MIN(confidence + 0.1, 1.0),
            updated_at = ?
        WHERE id = ?
      `).bind(new Date().toISOString(), existing.id).run()
    } else {
      // Create new pattern
      await env.DB.prepare(`
        INSERT INTO winner_patterns (id, domain_id, category_id, pattern_type, pattern_value, confidence, sample_count)
        VALUES (?, ?, ?, ?, ?, 0.1, 1)
      `).bind(
        crypto.randomUUID(), domainId, categoryId,
        pattern.pattern_type, pattern.pattern_value
      ).run()
    }
  }

  // Update KV cache
  const allPatterns = await env.DB.prepare(
    'SELECT * FROM winner_patterns WHERE domain_id = ? AND confidence >= 0.3 ORDER BY confidence DESC'
  ).bind(domainId).all()

  await env.CONFIG.put(`winners:${domainId}:${categoryId}`, JSON.stringify(allPatterns.results))
}
```

## Feature 3: Product Graveyard with Resurface

```typescript
// apps/nexus-api/src/services/graveyard.ts

// When you reject a product (not just the listing — reject the whole product):
export async function moveToGraveyard(env: Env, productId: string, reason: string) {
  const resurface_days = parseInt(
    (await env.DB.prepare("SELECT value FROM settings WHERE key = 'graveyard_resurface_days'").first())?.value as string || '30'
  )

  const resurface_at = new Date()
  resurface_at.setDate(resurface_at.getDate() + resurface_days)

  await env.DB.prepare(`
    UPDATE products
    SET status = 'graveyard',
        graveyard_at = ?,
        graveyard_reason = ?,
        resurface_at = ?,
        updated_at = ?
    WHERE id = ?
  `).bind(
    new Date().toISOString(),
    reason,
    resurface_at.toISOString(),
    new Date().toISOString(),
    productId
  ).run()
}

// Daily cron also checks for products ready to resurface:
async function checkGraveyard(env: Env) {
  const ready = await env.DB.prepare(`
    SELECT p.*, d.slug as domain_slug, c.slug as category_slug
    FROM products p
    JOIN domains d ON p.domain_id = d.id
    JOIN categories c ON p.category_id = c.id
    WHERE p.status = 'graveyard'
    AND p.resurface_at <= datetime('now')
  `).all()

  for (const product of ready.results) {
    // Check current trends against this product's niche
    const trendCheck = await env.AI_WORKER.runTask({
      taskType: 'trend_analysis',
      prompt: buildGraveyardTrendCheck(product),
      outputFormat: 'json',
    })

    const analysis = JSON.parse(trendCheck.output)

    if (analysis.is_now_viable) {
      // Surface as a trend alert
      await env.DB.prepare(`
        INSERT INTO trend_alerts (id, domain_id, trend_keyword, trend_score, demand_window, source, suggested_niche, detected_at)
        VALUES (?, ?, ?, ?, ?, 'graveyard_resurface', ?, ?)
      `).bind(
        crypto.randomUUID(),
        product.domain_id,
        product.niche || 'Resurface: ' + product.name,
        analysis.viability_score,
        analysis.demand_window,
        `Previously rejected: "${product.graveyard_reason}"`,
        new Date().toISOString()
      ).run()
    } else {
      // Extend resurface check by another 30 days
      const next = new Date()
      next.setDate(next.getDate() + 30)
      await env.DB.prepare(
        'UPDATE products SET resurface_at = ? WHERE id = ?'
      ).bind(next.toISOString(), product.id).run()
    }
  }
}
```

---

# PART 9 — LISTING HEALTH CHECK + LAUNCH BOOST

## Listing Health Check

```typescript
// apps/nexus-api/src/services/health-check.ts

interface HealthCheckResult {
  passed: boolean
  checks: Array<{
    name: string
    passed: boolean
    value: string
    requirement: string
    fix?: string
  }>
}

export async function runHealthCheck(
  env: Env,
  content: any,
  seoData: any,
  platformIds: string[]
): Promise<HealthCheckResult> {

  const platforms = await Promise.all(
    platformIds.map(id =>
      env.DB.prepare('SELECT * FROM platforms WHERE id = ?').bind(id).first()
    )
  )

  const checks = []

  for (const platform of platforms) {
    if (!platform) continue

    // Title length check
    const titleLen = content.title?.length || 0
    const maxTitle = platform.title_max_chars as number
    checks.push({
      name: `${platform.name}: Title length`,
      passed: titleLen <= maxTitle && titleLen > 0,
      value: `${titleLen} chars`,
      requirement: `1-${maxTitle} chars`,
      fix: titleLen > maxTitle ? `Shorten by ${titleLen - maxTitle} characters` : undefined,
    })

    // Tags check (for Etsy)
    if (platform.slug === 'etsy') {
      const tags = seoData.tags || []
      const allUnder20 = tags.every((t: string) => t.length <= 20)
      const hasEnoughTags = tags.length >= 10
      checks.push({
        name: 'Etsy: Tag count',
        passed: hasEnoughTags,
        value: `${tags.length} tags`,
        requirement: '10-13 tags',
        fix: !hasEnoughTags ? 'Add more specific keyword tags' : undefined,
      })
      checks.push({
        name: 'Etsy: Tag length (all ≤20 chars)',
        passed: allUnder20,
        value: allUnder20 ? 'All valid' : `${tags.filter((t: string) => t.length > 20).length} too long`,
        requirement: 'Each tag ≤ 20 characters',
        fix: !allUnder20 ? 'Shorten tags: ' + tags.filter((t: string) => t.length > 20).join(', ') : undefined,
      })
    }

    // Price check
    const price = content.price as number
    checks.push({
      name: `${platform.name}: Price format`,
      passed: price > 0 && (String(price).endsWith('.99') || String(price).endsWith('.97') || String(price).endsWith('.00')),
      value: `$${price}`,
      requirement: 'Ends in .99, .97, or .00',
      fix: price && !String(price).endsWith('.99') ? `Change to $${Math.floor(price)}.99` : undefined,
    })

    // Description minimum
    const descWords = content.description?.split(' ').length || 0
    checks.push({
      name: `${platform.name}: Description length`,
      passed: descWords >= 50,
      value: `${descWords} words`,
      requirement: 'Minimum 50 words',
      fix: descWords < 50 ? 'Description is too short — expand key benefits section' : undefined,
    })

    // Forbidden words check
    const forbidden = JSON.parse(platform.forbidden_words as string || '[]') as string[]
    const foundForbidden = forbidden.filter((w: string) =>
      content.description?.toLowerCase().includes(w.toLowerCase()) ||
      content.title?.toLowerCase().includes(w.toLowerCase())
    )
    checks.push({
      name: `${platform.name}: No forbidden words`,
      passed: foundForbidden.length === 0,
      value: foundForbidden.length === 0 ? 'Clean' : foundForbidden.join(', '),
      requirement: 'No platform-banned words',
      fix: foundForbidden.length > 0 ? `Remove or replace: ${foundForbidden.join(', ')}` : undefined,
    })
  }

  return {
    passed: checks.every(c => c.passed),
    checks,
  }
}
```

## Launch Boost Pack

```typescript
// apps/nexus-api/src/services/launch-boost.ts

export async function generateLaunchBoostPack(env: Env, content: any, userInput: any) {
  if (!userInput.post_to_social || !userInput.selected_social_channel_ids?.length) {
    return null
  }

  // The 48-hour boost window strategy:
  // Post 1: Hour 0 — Listing goes live (announcement)
  // Post 2: Hour 24 — Engagement reminder (social proof if any)
  // Post 3: Hour 47 — Final boost push (urgency/scarcity framing)

  const boostPosts = await env.AI_WORKER.runTask({
    taskType: 'social_adaptation',
    prompt: `
You are creating a 3-post launch sequence for a new product listing.
This exploits the platform's 48-hour algorithmic boost window.

Product: ${JSON.stringify(content)}
Selected channels: ${userInput.selected_social_channel_ids.join(', ')}

Create exactly 3 posts for each selected channel:

POST 1 (Hour 0 — Launch):
- Announce the product is live
- Focus on what problem it solves
- Include direct link CTA

POST 2 (Hour 24 — Social Proof):
- Reference early response (even speculative: "people are loving this already")
- Add a detail or feature that wasn't in Post 1
- Build curiosity

POST 3 (Hour 47 — Urgency):
- Create mild urgency (not fake scarcity — actual value urgency)
- This is the last push before the boost window closes
- Strongest CTA of the 3

Each post must be completely different from the others.
Each must be adapted to the platform's tone and character limits.

Output as JSON: { channel_id: { post_1: string, post_2: string, post_3: string } }
    `,
    outputFormat: 'json',
  })

  return JSON.parse(boostPosts.output)
}
```

---

# PART 10 — BACKEND API ROUTES (Complete)

## nexus-api/src/index.ts (Hono.js Router)

```typescript
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import workflowRoutes from './routes/workflow'
import productRoutes from './routes/products'
import reviewRoutes from './routes/review'
import domainRoutes from './routes/domains'
import platformRoutes from './routes/platforms'
import socialRoutes from './routes/social'
import promptRoutes from './routes/prompts'
import aiModelRoutes from './routes/ai-models'
import assetRoutes from './routes/assets'
import trendRoutes from './routes/trends'
import winnerRoutes from './routes/winners'
import graveyardRoutes from './routes/graveyard'
import historyRoutes from './routes/history'
import settingsRoutes from './routes/settings'

const app = new Hono<{ Bindings: Env }>()

app.use('*', cors({ origin: process.env.FRONTEND_URL || '*' }))

// All routes
app.route('/api/workflow', workflowRoutes)
app.route('/api/products', productRoutes)
app.route('/api/review', reviewRoutes)
app.route('/api/domains', domainRoutes)
app.route('/api/platforms', platformRoutes)
app.route('/api/social', socialRoutes)
app.route('/api/prompts', promptRoutes)
app.route('/api/ai-models', aiModelRoutes)
app.route('/api/assets', assetRoutes)
app.route('/api/trends', trendRoutes)
app.route('/api/winners', winnerRoutes)
app.route('/api/graveyard', graveyardRoutes)
app.route('/api/history', historyRoutes)
app.route('/api/settings', settingsRoutes)

// Health check
app.get('/health', c => c.json({ status: 'ok', timestamp: new Date().toISOString() }))

export default {
  fetch: app.fetch,

  // Cron trigger — runs daily at 6am UTC
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(Promise.all([
      runTrendRadar(env),
      checkGraveyard(env),
    ]))
  },
}

// Export Workflow class for CF Workflows binding
export { ProductWorkflow } from './services/workflow-engine'
```

## Key Route: workflow.ts

```typescript
// apps/nexus-api/src/routes/workflow.ts
import { Hono } from 'hono'
const router = new Hono<{ Bindings: Env }>()

// Start a new workflow
router.post('/start', async (c) => {
  const body = await c.req.json()
  const { domain_slug, category_slug, user_input } = body

  // Validate domain + category exist
  const domain = await c.env.DB.prepare(
    'SELECT * FROM domains WHERE slug = ? AND is_active = 1'
  ).bind(domain_slug).first()

  if (!domain) return c.json({ error: 'Domain not found' }, 404)

  const category = await c.env.DB.prepare(
    'SELECT * FROM categories WHERE slug = ? AND domain_id = ? AND is_active = 1'
  ).bind(category_slug, domain.id).first()

  if (!category) return c.json({ error: 'Category not found' }, 404)

  // Create product record
  const productId = crypto.randomUUID()
  await c.env.DB.prepare(`
    INSERT INTO products (id, domain_id, category_id, language, niche, name, user_input, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'running')
  `).bind(
    productId,
    domain.id,
    category.id,
    user_input.language || 'en',
    user_input.niche || null,
    user_input.product_name || null,
    JSON.stringify(user_input)
  ).run()

  // Create workflow run record
  const runId = crypto.randomUUID()
  await c.env.DB.prepare(`
    INSERT INTO workflow_runs (id, product_id, status, created_at)
    VALUES (?, ?, 'queued', ?)
  `).bind(runId, productId, new Date().toISOString()).run()

  // Start CF Workflow instance
  const instance = await c.env.PRODUCT_WORKFLOW.create({
    id: runId,
    params: { productId, domainSlug: domain_slug, categorySlug: category_slug, userInput: user_input, runId },
  })

  // Update run with CF workflow ID
  await c.env.DB.prepare(
    'UPDATE workflow_runs SET cf_workflow_id = ?, status = ? WHERE id = ?'
  ).bind(instance.id, 'running', runId).run()

  return c.json({ workflow_id: runId, product_id: productId })
})

// Get workflow status (polled every 3s by frontend)
router.get('/:id/status', async (c) => {
  const runId = c.req.param('id')

  const run = await c.env.DB.prepare(
    'SELECT * FROM workflow_runs WHERE id = ?'
  ).bind(runId).first()

  if (!run) return c.json({ error: 'Not found' }, 404)

  const steps = await c.env.DB.prepare(
    'SELECT * FROM workflow_steps WHERE run_id = ? ORDER BY step_order ASC'
  ).bind(runId).all()

  return c.json({
    ...run,
    steps: steps.results,
  })
})

export default router
```

