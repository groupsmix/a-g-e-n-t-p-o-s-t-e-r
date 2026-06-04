# NEXUS MONEY MACHINE — CURRENT STATE AUDIT

> Generated: 2026-06-03  
> Task: NXM-001 — Repo Baseline Audit  
> Purpose: Produce a definitive map of every existing route, service, migration, and type

---

## ROUTE FILES (nexus/apps/nexus-api/src/routes/)

| File | Description |
|------|-------------|
| `ab-testing.ts` | A/B testing management endpoints |
| `agent.ts` | AI agent configuration and execution routes |
| `ai-models.ts` | AI model registry and selection endpoints |
| `assets.ts` | Asset management (images, files, generated content) |
| `auth.test.ts` | Authentication route tests |
| `auth.ts` | User authentication and session management |
| `autopilot.ts` | Autopilot mode and automated operations |
| `blog.ts` | Blog content management and publishing |
| `browser-actions.ts` | Browser automation actions |
| `browser.ts` | Browser rendering service integration |
| `competitors.ts` | Competitor tracking and analysis |
| `digest.ts` | Digest generation and delivery |
| `domains.ts` | Domain management (business verticals) |
| `email.ts` | Email delivery and campaign management |
| `freelance.ts` | Freelance job orchestration and task management |
| `graveyard.ts` | Killed product analysis and resurfacing |
| `gumroad.ts` | Gumroad platform integration |
| `history.ts` | Operation history and audit logs |
| `hyperbeam.ts` | Hyperbeam browser integration |
| `keys.ts` | API key and credential management |
| `learning.ts` | Learning loop and pattern extraction |
| `manager.ts` | Manager-level operations and oversight |
| `marketing.ts` | Marketing campaign management |
| `observability.ts` | System observability and metrics |
| `opportunities.ts` | Opportunity radar and trend management |
| `pipeline.ts` | Pipeline management and orchestration |
| `platforms.ts` | Platform configuration and management |
| `pod.ts` | Print-on-Demand (POD) product management |
| `products.ts` | Product CRUD, deliverable generation, and formatting |
| `prompts.ts` | Prompt template management |
| `publish.ts` | Publishing operations across platforms |
| `queue.ts` | Job queue management and monitoring |
| `revenue.ts` | Revenue tracking and reporting |
| `review.ts` | Quality review and approval workflows |
| `schedules.ts` | Scheduled task management |
| `scoring.ts` | Product and opportunity scoring |
| `settings.ts` | System settings and configuration |
| `social.ts` | Social media channel management |
| `team.ts` | Team and user management |
| `trends.ts` | Trend detection and analysis |
| `winners.ts` | Winner pattern analysis and cloning |
| `workflow.ts` | Workflow execution and status monitoring |

---

## SERVICE FILES (nexus/apps/nexus-api/src/services/)

| File | Description |
|------|-------------|
| `action-executor.ts` | Action execution engine |
| `agents.ts` | AI agent orchestration and management |
| `browser-actions.ts` | Browser automation action implementations |
| `browser.ts` | Browser rendering service client |
| `deletion.ts` | Safe deletion operations and cleanup |
| `deliverable.ts` | Deliverable generation (PDF, etc.) |
| `digest.ts` | Digest generation and formatting |
| `freelance/agents.test.ts` | Tests for freelance agents |
| `freelance/agents.ts` | Freelance-specific AI agents |
| `freelance/digital-product-types.ts` | Digital product type definitions |
| `freelance/events.ts` | Freelance job event logging |
| `freelance/orchestrator.ts` | Freelance workflow orchestration |
| `freelance/pod-types.ts` | POD product type definitions |
| `freelance/portfolio.ts` | Freelance portfolio management |
| `freelance/red-flags.test.ts` | Red flag detection tests |
| `freelance/red-flags.ts` | Freelance job red flag detection |
| `freelance/types.ts` | Freelance type definitions |
| `golden-path.test.ts` | Golden path integration tests |
| `gumroad-publisher.ts` | Gumroad publishing integration |
| `gumroad.ts` | Gumroad API client |
| `job-queue.ts` | Job queue implementation (D1-backed) |
| `learning.ts` | Learning loop and pattern extraction |
| `multi-platform.ts` | Multi-platform publishing coordination |
| `pdf.ts` | PDF generation utilities |
| `pod.ts` | Print-on-Demand service integration |
| `product-scorer.ts` | Product scoring algorithm |
| `publish-gate.test.ts` | Publish gate decision tests |
| `publish-gate.ts` | Quality-based publish decision logic |
| `publishers.test.ts` | Platform publisher tests |
| `publishers.ts` | Platform publisher implementations |
| `quality-gate.ts` | Quality gate validation |
| `recipes.ts` | Deliverable format recipes |
| `shared/call-ai.ts` | Shared AI calling utilities |
| `shared/index.ts` | Shared utilities exports |
| `shared/json-parse.test.ts` | JSON parsing tests |
| `shared/json-parse.ts` | Safe JSON parsing utilities |
| `shared/settings.ts` | Settings management utilities |
| `sweep.ts` | Cleanup and maintenance operations |
| `workflow-engine.test.ts` | Workflow engine tests |
| `workflow-engine.ts` | 15-step AI product creation pipeline |
| `zip.ts` | ZIP file generation utilities |

---

## MIGRATION FILES (nexus/migrations/)

| File | Description |
|------|-------------|
| `001_core_schema.sql` | Core schema: domains, categories, platforms, products, workflows, assets, variants |
| `002_ai_registry.sql` | AI model registry and configuration |
| `003_prompt_templates.sql` | Prompt template storage |
| `004_platform_configs.sql` | Platform configuration data |
| `005_social_channels.sql` | Social channel definitions |
| `006_product_content.sql` | Product content storage |
| `007_product_image.sql` | Product image management |
| `008_schedules.sql` | Scheduled task infrastructure |
| `009_autopilot.sql` | Autopilot mode support |
| `010_marketing.sql` | Marketing campaign tables |
| `011_email_delivery.sql` | Email delivery tracking |
| `011a_product_deliverable.sql` | Product deliverable storage |
| `012_product_brief.sql` | Product brief documentation |
| `013_indexes.sql` | Database performance indexes |
| `014_digests.sql` | Digest storage and tracking |
| `014a_learning_loop.sql` | Learning loop infrastructure |
| `015_pod_products.sql` | POD product support |
| `016_platform_listings.sql` | Platform listing management |
| `017_domain_cleanup.sql` | Domain cleanup utilities |
| `018a_freelance_engine.sql` | Freelance workflow engine |
| `018b_gumroad_columns.sql` | Gumroad-specific columns |
| `018c_user_preferences.sql` | User preference storage |
| `018d_competitor_tracker.sql` | Competitor tracking tables |
| `018e_email_lists.sql` | Email list management |
| `018f_blog_posts.sql` | Blog post storage |
| `018g_ab_tests.sql` | A/B testing infrastructure |
| `019_opportunity_radar.sql` | Opportunity radar and scoring |
| `020_agent_queue.sql` | Agent queue system and 8-category scoring |
| `seed_demo.sql` | Demo data seeding |

**Latest migration:** `020_agent_queue.sql`

---

## CURRENT DATABASE SCHEMA

### opportunities Table (from 019_opportunity_radar.sql)

```sql
CREATE TABLE IF NOT EXISTS opportunities (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  trend_name TEXT NOT NULL,
  target_buyer TEXT NOT NULL,
  product_idea TEXT NOT NULL,
  why_it_sells TEXT NOT NULL,
  evidence TEXT DEFAULT '[]',        -- JSON array of { source, url, snippet }
  competition_level TEXT DEFAULT 'medium' CHECK (competition_level IN ('low','medium','high','saturated')),
  urgency TEXT DEFAULT 'medium' CHECK (urgency IN ('low','medium','high','urgent')),
  risk_level TEXT DEFAULT 'low' CHECK (risk_level IN ('low','medium','high')),
  suggested_format TEXT NOT NULL CHECK (suggested_format IN ('freelance','digital_product','pod','content')),
  difficulty TEXT DEFAULT 'medium' CHECK (difficulty IN ('easy','medium','hard')),
  confidence_score INTEGER DEFAULT 0 CHECK (confidence_score BETWEEN 0 AND 100),

  -- Scoring breakdown (0-100 total)
  score_demand INTEGER DEFAULT 0 CHECK (score_demand BETWEEN 0 AND 20),
  score_competition_gap INTEGER DEFAULT 0 CHECK (score_competition_gap BETWEEN 0 AND 15),
  score_buyer_urgency INTEGER DEFAULT 0 CHECK (score_buyer_urgency BETWEEN 0 AND 15),
  score_ease INTEGER DEFAULT 0 CHECK (score_ease BETWEEN 0 AND 15),
  score_monetization INTEGER DEFAULT 0 CHECK (score_monetization BETWEEN 0 AND 15),
  score_timing INTEGER DEFAULT 0 CHECK (score_timing BETWEEN 0 AND 10),
  score_safety INTEGER DEFAULT 0 CHECK (score_safety BETWEEN 0 AND 10),
  total_score INTEGER GENERATED ALWAYS AS (
    score_demand + score_competition_gap + score_buyer_urgency +
    score_ease + score_monetization + score_timing + score_safety
  ) STORED,

  -- Niche and category
  niche TEXT,
  category TEXT,
  source_signals TEXT DEFAULT '[]',  -- JSON array of signal sources

  -- Status
  status TEXT DEFAULT 'new' CHECK (status IN ('new','watchlist','approved','in_progress','completed','dismissed')),
  is_guess INTEGER DEFAULT 0,        -- 1 = AI speculation, 0 = backed by evidence

  -- Linked job/product (BROKEN - 1-to-1 relationship)
  linked_job_id TEXT,
  linked_product_id TEXT,

  -- Metadata
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT                     -- trend expiry date
);
```

**Current Model Issue:** `linked_product_id` creates a 1-to-1 relationship between opportunities and products, which is broken. The target model should support: `opportunity → many ventures → many offers → attributed events`.

### products Table (from 001_core_schema.sql)

```sql
CREATE TABLE IF NOT EXISTS products (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  domain_id       TEXT NOT NULL REFERENCES domains(id),
  category_id     TEXT NOT NULL REFERENCES categories(id),
  name            TEXT,
  niche           TEXT,
  language        TEXT DEFAULT 'en',
  user_input      TEXT,
  status          TEXT DEFAULT 'draft',
  ai_score        REAL,
  revenue_estimate TEXT,
  winner_patterns  TEXT,
  graveyard_at    TEXT,
  graveyard_reason TEXT,
  resurface_at    TEXT,
  created_at      TEXT DEFAULT (datetime('now')),
  updated_at      TEXT DEFAULT (datetime('now'))
);
```

---

## BUILD STATUS

**TypeScript Build:** Could not verify - dependencies not installed (node_modules missing)  
**Lint Status:** Could not verify - dependencies not installed (node_modules missing)

To run checks after installing dependencies:
```bash
cd nexus
pnpm install
pnpm typecheck
pnpm lint
```

---

## ARCHITECTURE NOTES

1. **Current Architecture:** Single product per opportunity model (broken)
2. **Target Architecture:** Portfolio model where one opportunity spawns multiple ventures across different verticals
3. **Key Missing Tables:** `signals`, `ventures`, `offers`, `tracked_links`, `economic_events`, `asset_library`, `allocator_actions`
4. **Migration Path:** Need to add new tables without breaking existing `opportunities` and `products` tables

---

Ready for NXM-002.