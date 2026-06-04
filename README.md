# posteragent

Personal AI content machine: NEXUS orchestration, site factory, Mastra agents, Remotion video, multi-platform publishing.

## Layout

| Path | Purpose |
|------|---------|
| `apps/nexus/` | Existing NEXUS monorepo (API, AI worker, web UI) |
| `apps/dashboard/` | Control panel (TASK 9.1) |
| `apps/factory/` | CosmicJS site generator (TASK 6.x) |
| `packages/*` | Shared agents, tools, workflows, publishers, generators, CMS, config |
| `ref/` | Cloned reference repos (do not import directly in production code) |
| `docs/AGENT_TASKS.md` | Full build plan — one task per agent session |

## Reference repos (`ref/`)

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
