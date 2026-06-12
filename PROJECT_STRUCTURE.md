# Project Structure

> Personal AI content machine + autonomous software engineering agent platform.
> Stack: Cloudflare Workers (Hono) · Next.js 14 · Cloudflare D1/KV/R2 · pnpm monorepo · Turborepo

## Top-Level Layout

```
a-g-e-n-t-p-o-s-t-e-r/
├── apps/
│   ├── nexus/              # ★ NEXUS canonical system (Cloudflare stack)
│   │   ├── apps/
│   │   │   ├── web/        # Next.js 14 dashboard → Cloudflare Pages
│   │   │   ├── nexus-api/  # Hono API → Cloudflare Worker
│   │   │   └── nexus-ai/   # AI router → Cloudflare Worker (multi-provider failover)
│   │   ├── migrations/     # D1 SQLite migrations (sequential, never rename)
│   │   └── packages/       # (nexus-internal shared code)
│   ├── dashboard/          # Brain Cockpit — memory/identity/proactivity (Next.js, port 3030)
│   ├── factory/            # CosmicJS site generator (@repo/factory)
│   └── runner/             # Legacy cron entrypoints (@repo/runner)
├── packages/
│   ├── types/              # @posteragent/types — canonical TS interfaces
│   ├── logger/             # @posteragent/logger — Pino structured logging
│   ├── identity/           # @posteragent/identity — SOUL, persona, traits
│   ├── memory/             # @posteragent/memory — long/short-term memory & journals
│   ├── orchestrator/       # @posteragent/orchestrator — task orchestration, base agent classes
│   ├── proactivity/        # @posteragent/proactivity — background condition evaluation
│   ├── agent-research/     # @posteragent/agent-research — market/niche analysis
│   ├── agent-publisher/    # @posteragent/agent-publisher — social platform posting
│   ├── agent-budget/       # @posteragent/agent-budget — cost estimation & enforcement
│   ├── agent-revenue/      # @posteragent/agent-revenue — income stream tracking
│   ├── agent-autonome/     # @posteragent/agent-autonome — autonomous task routing
│   ├── agent-analytics/    # @posteragent/agent-analytics — platform analytics collection
│   └── agent-mindsdb/      # @posteragent/agent-mindsdb — ML-powered unified insights
├── docs/
│   ├── adr/                # Architecture Decision Records
│   ├── history/            # Phase task docs & audit logs
│   ├── runbooks/           # Operational runbooks
│   ├── API_DOCUMENTATION.md
│   ├── ARCHITECTURE.md
│   ├── CURRENT_ARCHITECTURE.md
│   └── TESTING_GUIDE.md
├── .github/
│   └── workflows/
│       ├── ci.yml          # Full CI: typecheck, lint, test, build
│       ├── deploy.yml      # Worker + D1 deploy (gated on CI)
│       ├── daily-run.yml   # Legacy content cron
│       └── stats-pull.yml  # Legacy stats cron
├── scripts/                # Utility scripts
├── turbo.json              # Turborepo pipeline config
├── pnpm-workspace.yaml     # Workspace package discovery
└── tsconfig.base.json      # Shared strict TypeScript config
```

## NEXUS API Routes (`apps/nexus/apps/nexus-api/src/routes/`)

| Route file | Mount path | Responsibility |
|---|---|---|
| `auth.ts` | `/api/auth` | Dashboard password gate |
| `products.ts` | `/api/products` | Product CRUD |
| `workflow.ts` | `/api/workflow` | Product workflow engine |
| `agents.ts` | `/api/agents` | Agent registry + run endpoint |
| `tasks.ts` | `/api/tasks` | Task lifecycle (agent_tasks table) |
| `queue.ts` | `/api/queue` | automation_jobs queue |
| `multi-agent-coordinator.ts` | `/api/multi-agent` | ★ NEW: Planner→Code→Docs→Test→Review→Browser |
| `repo-intelligence.ts` | `/api/repo-intel` | ★ NEW: GitHub repo indexing + project maps |
| `code-ops.ts` | `/api/code-ops` | ★ NEW: File read/write/commit/PR via GitHub API |
| `doc-generator.ts` | `/api/doc-gen` | ★ NEW: AI documentation generation |
| `browser.ts` | `/api/browser` | Hyperbeam live browser sessions |
| `browser-agent.ts` | `/api/browser-agent` | Browser agent action execution |
| `autonome.ts` | `/api/autonome` | Autonomous operation mode |
| `autopilot.ts` | `/api/autopilot` | Scheduled autopilot runs |
| `observability.ts` | `/api/observability` | System health & metrics |
| `analytics.ts` | `/api/analytics` | Platform analytics |
| `revenue.ts` | `/api/revenue` | Revenue tracking |
| `budget.ts` | `/api/budget` | Budget enforcement |
| `insights.ts` | `/api/insights` | AI-powered insights |
| `memory.ts` | `/api/memory` | Brain layer — memory items |
| `settings.ts` | `/api/settings` | Key-value settings store |
| `keys.ts` | `/api/keys` | Encrypted credentials vault |

## Database Migrations (`apps/nexus/migrations/`)

Migrations are applied sequentially by filename. **Never rename or delete applied migrations.**

| # | Description |
|---|---|
| 001 | Core schema (domains, products, content) |
| 002–010 | AI registry, prompts, platforms, social, schedules, autopilot |
| 011–020 | Email, learning loop, digests, opportunity radar, agent queue |
| 021–030 | Portfolio, ledger, tasks, brain layer, publish jobs, analytics |
| 031–037 | Revenue, budget, quota, leads, AI call ledger, control plane |
| **038** | ★ Repo intelligence, multi-agent sessions, code ops, doc gen, safety audit |

## Critical Entry Points

| File | Purpose |
|---|---|
| `apps/nexus/apps/nexus-api/src/index.ts` | Worker entrypoint — all routes registered here |
| `apps/nexus/apps/nexus-api/src/env.ts` | All Cloudflare bindings (DB, KV, R2, AI, BROWSER) |
| `apps/nexus/apps/web/src/app/layout.tsx` | Next.js root layout with AuthGate + Sidebar |
| `apps/nexus/apps/web/src/components/shell/Sidebar.tsx` | Navigation — add new routes here |
| `packages/types/src/index.ts` | Canonical TypeScript interfaces |
| `packages/orchestrator/src/index.ts` | BaseAgent class — extend for new agents |
