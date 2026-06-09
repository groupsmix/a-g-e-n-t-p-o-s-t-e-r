# ADR-001: NEXUS web is the canonical dashboard; `apps/dashboard` is the Brain Cockpit

- **Status:** Accepted (2026-06-09)
- **Deciders:** repo CEO + agent
- **Supersedes:** the implicit assumption that `apps/dashboard` would grow into the main money-machine UI

## Context

The repo ships two Next.js apps:

1. **`apps/nexus/apps/web`** — 48 pages, deployed to Cloudflare Pages, talks
   to a Cloudflare Workers API backed by D1/KV/R2. Has a sealed password
   gate (`ACCESS_PASSWORD` secret, T1), a working observability page (T2),
   single `/api/stats` endpoint (T3), reject-filter (T4), niche dedup (T5).
   This is the system the operator actually uses.

2. **`apps/dashboard`** — a scaffold targeting the brain layer
   (memory/identity/proactivity from `@posteragent/*`). Has a few real
   pages (brain, builder, analyse, autonome, publisher) but was marketed
   in its own UI as *"NEXUS — Money Machine"* with zero'd KPIs for
   Revenue / AI spend / New leads despite having no data wiring for any
   of them. Past bug reports kept landing on the gap between its
   "Mission Control" framing and the actual NEXUS dashboard.

These are different databases (D1 vs whatever the brain layer settles on)
and different deployment targets (Cloudflare Pages vs a not-yet-deployed
Next.js app). Treating them as interchangeable was the source of the
confusion.

## Decision

**Path A.** The NEXUS web UI is the canonical operator dashboard.
`apps/dashboard` is explicitly the **Brain Cockpit** — the brain-layer
inspector, not a competing money dashboard.

Concretely:

- `apps/dashboard` HTML `<title>`, sidebar brand, and home heading all
  identify it as "Brain Cockpit", not "NEXUS Money Machine".
- The Brain Cockpit home page no longer shows Revenue / AI spend KPIs
  it can't populate. It links out to NEXUS instead.
- The top-level README documents this split explicitly so future agents
  don't re-litigate.
- New money/ops features go into `apps/nexus/*` (API + web).
- New brain/memory/identity features go into `apps/dashboard` +
  `@posteragent/{memory,identity,proactivity}`.
- The legacy `@repo/*` cron stack (`apps/runner`, `apps/factory`) keeps
  shipping until its jobs are migrated into NEXUS workflows. Out of
  scope for this ADR.

## Consequences

**Good:**
- One canonical surface for the operator. Sidebar, deployment, auth,
  and database stop fragmenting.
- New work has an obvious home (the question stops being *which
  dashboard?* and becomes *which feature?*).
- Bug reports about "the dashboard" can be unambiguously routed.

**Costs:**
- The Brain Cockpit loses its aspirational framing as a unified
  control plane. That framing was load-bearing for nothing — no real
  features depended on it.
- A future operator who wants a single pane of glass will need a
  bridge between Brain Cockpit and NEXUS. Out of scope here; tracked
  as "embed NEXUS module summaries inside the cockpit" if it ever
  becomes worth the lift.

## Notes for future agents

If you find a "bug" that boils down to *"the dashboard shows empty
KPIs"*, first check **which** dashboard. The Brain Cockpit at
`apps/dashboard` is intentionally not the money dashboard. The money
dashboard is `apps/nexus/apps/web` and its empty-state usually means
`NEXT_PUBLIC_API_URL` isn't pointing at the deployed Worker — there's
already an `ApiMisconfigBanner` that surfaces this; honor it instead of
rebuilding it.
