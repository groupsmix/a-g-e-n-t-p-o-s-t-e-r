# Phase 3 — Money Workflow

## Files to copy / create

| Patch file | Destination |
|---|---|
| `nexus/apps/nexus-api/src/routes/pipeline.ts` | **new file** |
| `nexus/apps/web/src/app/money-workflow/page.tsx` | **new file** (create the directory) |
| `nexus/apps/web/src/components/shell/Sidebar.money-workflow-addendum.txt` | Apply manually to Sidebar.tsx |
| `nexus/apps/nexus-api/src/routes/pipeline-index-addendum.txt` | Apply 2 lines to index.ts |

---

## Core workflow: Trend → Validate → Build → Quality Check → Publish → Market → Track → Improve

The Money Workflow page (`/money-workflow`) shows all 8 stages in one view, each
as a clickable card with a live count and health indicator.

| Stage | Data source | Health colors |
|---|---|---|
| Trend Radar | `trend_alerts` table | Green = 5+ new trends |
| Opportunity Score | `opportunities` table | Green = ideas in queue |
| Product Builder | `products` WHERE status=running | Green = building now |
| Quality Gate | `products` WHERE status=pending_review | Amber = has queue |
| Publish | `products` WHERE status=approved/published | Amber = ready but unpublished |
| Marketing | `products` with/without marketing_pack | Amber = missing packs |
| Revenue | `/api/revenue` (Gumroad) | Green = revenue > $0 |
| Learning Loop | `learning_patterns` table | Green = 10+ patterns |

---

## New API endpoint: GET /api/pipeline/summary

Runs all 8 stage counts in one parallel DB query. Fast (single Worker call).
Returns:
- `stages.*` — counts for every pipeline stage
- `meta.autopilot_enabled`, `meta.kill_switch_active`
- `spend_today_usd` — estimated AI cost today

## New API endpoint: POST /api/pipeline/seed-defaults

Seeds the recommended starting settings in one call. Called by the
"Apply starter settings" button on the Money Workflow page.

---

## Recommended settings (Phase 1 — safe for first night)

| Setting | Value | Why |
|---|---|---|
| `autopilot_enabled` | `true` | Let it run |
| `auto_approve` | `true` | Skip manual review for high scorers |
| `auto_publish` | `false` | Build without going live yet |
| `min_score` | `8` | Only high-quality products |
| `per_run` | `1` | One product per cron tick |
| `max_spend_usd` | `$2` | ~20 builds max/day at $0.10 each |
| `kill_switch_active` | `false` | On and running |

## Recommended settings (Phase 2 — after first wins)

| Setting | Value |
|---|---|
| `auto_publish` | `true` |
| `min_score` | `8.5` |
| `per_run` | `1–3` |
| `max_spend_usd` | `$5–$10` |

Apply Phase 1 defaults instantly from the Money Workflow page:
click **"Apply starter settings"** — it calls `POST /api/pipeline/seed-defaults`.

---

## What each stage already has in your codebase

Everything listed below is **already built** in your repo. The Money Workflow
page and pipeline API connect them into a single visible loop.

| Stage | Existing route | Existing page |
|---|---|---|
| Trend Radar | `/api/trends` | `/trends` |
| Opportunity Score | `/api/opportunities` | `/opportunities` |
| Product Builder | Autopilot + `/api/workflow` | `/autopilot` |
| Quality Gate | `/api/review` | `/review` |
| Publish | `/api/publish` | `/publish` |
| Marketing | `/api/marketing` | `/marketing` |
| Revenue | `/api/revenue` | `/revenue` |
| Learning Loop | `/api/learning` | `/learning` |
