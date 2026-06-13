# Changelog

All notable changes to this project will be documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

### Added
- **Repository Intelligence** (`/api/repo-intel`) — connect GitHub repositories, index full file trees, detect frameworks/stack, build project maps via GitHub REST API
- **Code Operations** (`/api/code-ops`) — read, create, update, delete files; create branches; create pull requests — all via GitHub API with safety audit logging
- **Documentation Generator** (`/api/doc-gen`) — AI-powered generation of README, ARCHITECTURE, API_DOCUMENTATION, TESTING_GUIDE, CHANGELOG, PROJECT_STRUCTURE; one-click commit to repo
- **Multi-Agent Coordinator** (`/api/multi-agent`) — orchestrates Planner → Code → Documentation → Testing → Review → Browser agent pipeline; sessions stored in D1; step-by-step or full auto-run
- **DB migration 038** — `repo_projects`, `agent_sessions`, `session_steps`, `code_operations`, `doc_generations`, `safety_audit_log` tables
- **Safety audit log** — every destructive operation (file write, delete, branch create, PR) is logged to `safety_audit_log` with action type, target, and timestamp
- **Repo Intelligence page** (`/repo-intel`) — track repos, trigger analysis, view project maps and file tree with framework badges
- **Code Agent page** (`/code-agent`) — file browser, in-browser editor with GitHub commit, branch/PR management
- **Multi-Agent page** (`/multi-agent`) — create sessions, run agents step-by-step or auto-run full pipeline, view per-agent outputs
- **PROJECT_STRUCTURE.md** — complete directory map with route table and migration index
- **Sidebar navigation** — Repo Intelligence, Code Agent, Multi-Agent items in Engine section

---

## [0.37.0] — 2026-06-12

### Added
- `037_control_plane.sql` — control plane table for system configuration
- Control plane routes (`/api/control-plane`) for runtime feature management

## [0.36.0] — 2026-06

### Added
- AI call ledger (`036_ai_call_ledger.sql`) — track every LLM API call with cost and token counts

## [0.35.0] — 2026-06

### Added
- Leads enrichment (`035_leads_enrichment.sql`) — additional fields for lead qualification
- Lead status tracking (`034_leads_status.sql`)

## [0.33.0] — 2026-06

### Added
- Budget enforcement (`032_budget.sql`, `/api/budget`) — daily spend caps with agent-level tracking
- Quota management (`033_quota.sql`) — per-resource usage limits

## [0.31.0] — 2026-06

### Added
- Revenue tracking (`031_revenue.sql`, `/api/revenue`) — income stream management with RevenueEvent contracts
- Autonome mode (`030_autonome.sql`, `/api/autonome`) — autonomous task execution loop with tick orchestrator

## [0.29.0] — 2026-06

### Added
- Affiliate snapshots (`029_affiliate_snapshots.sql`)
- Email campaign system (`028_email_campaigns.sql`, `/api/email`)
- Leads system (`027_leads.sql`, `/api/leads`) — lead capture, scoring, status pipeline

## [0.26.0] — 2026-06

### Added
- Platform analytics (`026_platform_analytics.sql`, `/api/analytics`) — per-post engagement collection across all platforms
- Publish jobs table (`025_publish_jobs.sql`, `/api/publisher-queue`)

## [0.24.0] — 2026-05

### Added
- Brain layer (`024_brain_layer.sql`, `/api/brain`) — memory items, identity, agent journals
- Agent task system (`023_agent_tasks.sql`, `/api/tasks`) — full lifecycle with status SSE tail
- Agent runs ledger (`022_agent_runs_ledger.sql`) — cost, duration, token tracking per run
- Portfolio spine (`021_portfolio_spine.sql`, `/api/portfolio`)

## [0.20.0] — 2026-05

### Added
- Agent queue (`020_agent_queue.sql`) — automation_jobs with priority + retry
- Opportunity radar (`019_opportunity_radar.sql`, `/api/opportunities`)

## [0.18.0] — 2026-05

### Added
- Freelance engine (`018a_freelance_engine.sql`, `/api/freelance`)
- Gumroad integration columns (`018b_gumroad_columns.sql`, `/api/gumroad`)
- User preferences (`018c_user_preferences.sql`)
- Competitor tracker (`018d_competitor_tracker.sql`, `/api/competitors`)
- Email list management (`018e_email_lists.sql`)
- Blog engine (`018f_blog_posts.sql`, `/api/blog`)
- A/B testing (`018g_ab_tests.sql`, `/api/ab-testing`)

## [0.14.0] — 2026-04

### Added
- Learning loop (`014a_learning_loop.sql`, `/api/learning`) — pattern extraction from winning content
- Digest system (`014_digests.sql`, `/api/digest`) — daily AI digest with schedule support

## [0.10.0] — 2026-04

### Added
- Marketing engine (`010_marketing.sql`, `/api/marketing`)
- Autopilot (`009_autopilot.sql`, `/api/autopilot`) — scheduled content runs

## [0.1.0] — 2026-03

### Added
- Initial monorepo scaffold (Turborepo, pnpm workspaces)
- NEXUS core schema (`001_core_schema.sql`) — domains, products, content items, publish queue
- AI model registry (`002_ai_registry.sql`) — multi-provider failover config
- Cloudflare Workers API (Hono) with access gate middleware
- Next.js 14 dashboard with Cloudflare Pages deploy
- CI pipeline (typecheck, lint, vitest, build, deploy)
