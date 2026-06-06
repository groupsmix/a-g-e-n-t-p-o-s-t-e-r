# Phase 1 — Dashboard Shell (`apps/dashboard`)

> Status: 🟡 In progress — TASK-100, TASK-101 (schema only) landed.
> Module page-stubs are in place; the live SSE feed, command-palette intent
> routing, and settings vault are scoped for follow-up PRs.

The dashboard is the **cockpit** of the entire Money Machine. It tails what
agents are doing, lets you launch new work in one keystroke (`⌘K`), and
surfaces the KPIs that matter (today's spend, queued tasks, revenue,
new leads).

It is intentionally **separate** from `apps/nexus/apps/web` — that's the
public-facing Cloudflare Pages site; this is the internal operator console.

---

## Layout

```
apps/dashboard/
├── app/                        # Next.js 14 App Router
│   ├── layout.tsx              # Sidebar + TopBar + CommandPalette shell
│   ├── page.tsx                # Home / mission-control
│   ├── providers.tsx           # React Query provider
│   └── {brain,research,…}/page.tsx   # 10 module stubs
├── components/
│   ├── ui/                     # shadcn primitives (Button, Card, Badge)
│   ├── layout/                 # Sidebar, TopBar, CommandPalette
│   └── shared/                 # MetricCard, TaskCard, AgentStatus, ModuleStub
├── lib/
│   ├── api.ts                  # typed fetch wrapper around nexus-api
│   ├── modules.ts              # single source of truth for the 10 modules
│   ├── store.ts                # Zustand UI store (sidebar collapse, palette open)
│   └── utils.ts                # cn(), formatUsd(), timeAgo()
├── styles/globals.css          # dark-first theme tokens + custom utilities
├── next.config.js              # transpilePackages: @posteragent/types
├── tailwind.config.ts          # shadcn theme tokens + success/warning vars
├── tsconfig.json               # @/* path aliases
└── package.json                # @posteragent/dashboard, port 3030
```

## What ships in this PR

### TASK-100 — Shell + module stubs
- **Sidebar** with collapse toggle, brand, "Home" link, and the 10 modules
  iterating off `lib/modules.ts`.
- **TopBar** with `⌘K` trigger, a metric strip (placeholder until the
  KPI endpoint lands in TASK-104), and notifications icon.
- **CommandPalette** built on `cmdk` with verb-based intent parsing
  (`research X`, `build app Y`, `write thread …`, `analyse Z`,
  `publish W`, `scrape leads V`) plus jump-to-module navigation.
- **Home / mission-control** page with greeting, 5 KPI metric cards,
  live-activity placeholder, and an agent status sidebar.
- **10 module stubs** (Brain, Research, Builder, Content, Publisher,
  Analyse, Autonome, Revenue, Leads, Settings) — each renders a roadmap
  card listing the upcoming `TASK-XYZ` items for that module.
- **Theme:** dark-first (cool charcoal `224 14% 7%`) with emerald accent
  (`142 70% 45%`), full HSL var set, custom scrollbar, `.glow-primary`
  utility.

### TASK-101 — `agent_tasks` schema
A new D1 migration `apps/nexus/migrations/023_agent_tasks.sql` adds the
user-facing task abstraction the dashboard tails.

This sits **above** (not in place of) two existing tables:

| Table | Migration | Granularity | Purpose |
|---|---|---|---|
| `automation_jobs` | 020 | one row per queued work unit | retry / idempotency / DLQ |
| `agent_runs` | 022 | one row per LLM/tool call | cost accountability |
| **`agent_tasks`** | **023** | **one row per user-facing intent** | **dashboard tail** |

One `agent_tasks` row (e.g. `build-site`) typically fans out into many
`automation_jobs` and many `agent_runs`. The dashboard reads `agent_tasks`
and drills down via `parent_task_id` when the operator wants detail.

Type contract: `packages/types/src/index.ts → AgentTask`. CHECK constraints
on `type` and `status` are kept in sync with the TS literal unions.

Highlights:
- Cost rolled up: `estimated_cost_usd`, `actual_cost_usd`, `model_used`,
  `input_tokens`, `output_tokens` for at-a-glance KPI math without
  joining `agent_runs`.
- Self-referential `parent_task_id` for grouping (e.g. an `autopilot`
  parent task whose children are the actual workflow steps).
- `origin` enum (`dashboard | autopilot | schedule | webhook | api | cli`)
  so the activity feed can show *where* a task came from.
- 5 indexes covering the dashboard's read patterns (recent, by-status,
  by-type, by-agent, by-parent).
- `trg_agent_tasks_updated_at` trigger keeps `updated_at` fresh on any
  meaningful column change — SQLite has no `ON UPDATE` clause.

A seed file `seed_agent_tasks.sql` provides 6 demo rows covering all 5
statuses for local dev.

## What's coming in follow-up PRs

| Task | Branch | Description |
|---|---|---|
| TASK-101b | next | nexus-api endpoints: `GET /api/tasks`, `POST /api/tasks`, `GET /api/tasks/stream` (SSE) |
| TASK-102 | next | wire the live tail into `app/page.tsx` and add intent dispatch from the palette |
| TASK-103 | next | settings vault (encrypted KV) + `POST /api/settings` |
| TASK-104 | next | KPI top-bar metrics endpoint + auto-refresh |

## Local dev

```bash
# from repo root
pnpm install              # or: bun install
pnpm --filter @posteragent/dashboard dev
# → http://localhost:3030
```

Apply the schema to your local D1:

```bash
cd apps/nexus
wrangler d1 execute nexus --local --file=migrations/023_agent_tasks.sql
wrangler d1 execute nexus --local --file=migrations/seed_agent_tasks.sql
```

## Design choices worth flagging

1. **`done` vs `completed`** — the dashboard uses `done` (matching
   `AgentTaskStatus`). The cost ledger `agent_runs` uses `completed`.
   They're separate concepts; no joining required at the status level.
2. **JSON as TEXT** — D1 has no native JSON type. All JSON columns are
   `TEXT NOT NULL DEFAULT '{}'`; the API layer is responsible for
   `JSON.parse` / `JSON.stringify`.
3. **No real-time engine on the DB** — the SSE stream (coming in
   TASK-101b) will poll `agent_tasks` ordered by `updated_at DESC` on a
   short interval and push deltas. D1 doesn't expose change feeds.
4. **`@posteragent/dashboard` is a sibling of `apps/nexus/apps/web`**,
   not a replacement. The Pages app stays as the public surface. The
   dashboard runs on port 3030 to avoid collision.
