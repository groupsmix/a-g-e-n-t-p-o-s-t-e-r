# posteragent

Personal AI content machine: NEXUS orchestration, site factory, Mastra agents, Remotion video, multi-platform publishing.

## Two stacks, on purpose

This repo has two coexisting stacks. They share `packages/*` and run from
different entry points. Do **not** delete one assuming it's dead.

**Canonical UI is NEXUS.** `apps/dashboard` is the *Brain Cockpit* — memory,
identity, proactivity, agent journals — not the money/ops dashboard. See
[`docs/adr/ADR-001-canonical-dashboard.md`](docs/adr/ADR-001-canonical-dashboard.md).

| Stack | Package scope | Driven by | What it does |
|-------|---------------|-----------|--------------|
| Legacy / @repo | `@repo/*` packages, `apps/factory`, `apps/runner` | GitHub Actions cron | Daily content runs, site generation, stats pull |
| Brain Cockpit | `apps/dashboard`, `@posteragent/memory \| identity \| proactivity` | Next.js on port 3030 | Brain-layer UI: memory, identity, journals, agent status. No money/ops data. |
| NEXUS / @posteragent | `apps/nexus/*`, `@posteragent/agent-*` | Cloudflare Workers + Pages (D1 / KV / R2) | **Canonical dashboard.** Revenue, products, publish queue, autopilot, observability, freelance, learning loop. |

**The legacy stack has a retirement date: 2026-06-22** (after a one-week
parallel-run — see `docs/runbooks/legacy-cron-retirement.md`). Until then,
the `@repo` runners still ship. CI proves it:

```
.github/workflows/daily-run.yml      → @repo/runner
.github/workflows/generate-site.yml  → @repo/runner
.github/workflows/stats-pull.yml     → @repo/runner
.github/workflows/deploy.yml         → @posteragent/dashboard
```

## Layout

| Path | Purpose |
|------|---------|
| `apps/nexus/` | NEXUS monorepo — API + AI worker (Cloudflare Workers) + web UI (Cloudflare Pages). **Own pnpm workspace** — see install note below. |
| `apps/dashboard/` | Next.js 14 dashboard (port 3030) — `@posteragent/dashboard` |
| `apps/factory/` | CosmicJS site generator (TASK 6.x) — `@repo/factory` |
| `apps/runner/` | Cron entrypoints for legacy pipeline — `@repo/runner` |
| `packages/*` | Mixed: `@repo/*` (legacy) and `@posteragent/*` (NEXUS) |
| `ref/` | Cloned reference repos — local only, not tracked in git (do not import directly in production code) |
| `docs/AGENT_TASKS.md` | Full build plan — one task per agent session |

## One workspace, one lockfile

The repo is a single pnpm workspace rooted at the repo root — it spans
`apps/*`, `packages/*`, `apps/nexus/apps/*` and `apps/nexus/packages/*`.
The former nested workspace inside `apps/nexus/` (own lockfile + root
`postinstall` hack) was removed per audit §2.1. One `pnpm install` at the
root installs everything.

## Reference repos (`ref/`) — local only, not tracked

`ref/` is git-ignored. Clone these locally if you need them:

- `ref-mastra` — agent/workflow patterns
- `ref-openmontage` — Remotion compositions
- `ref-tiktokforge` — n8n + Remotion config
- `ref-postr` — social publisher adapters
- `ref-cosmic-blocks` — UI blocks for factory
- `ref-cosmic-boilerplate` — site template

## Quick start

```bash
cp .env.example .env
# fill in keys
pnpm install
pnpm build
```

## Tasks

Follow `docs/AGENT_TASKS.md` in order (Phase 0 → 10). Do not skip dependencies.
