# Phase 3 — nexus-api Routes (TASK-300)

This is the route-level wiring of the orchestrator into the live worker.
The orchestrator library itself shipped in PR #12 as `@posteragent/orchestrator`;
this PR makes it reachable over HTTP from the dashboard and the command palette.

## What changed

### New endpoints on the nexus-api worker

```
POST  /api/agents/run             — run an agent task synchronously
GET   /api/agents/registry        — list all 14 agent types (with filters)
GET   /api/agents/registry/:type  — single descriptor

GET   /api/brain/summary          — top-of-page rollup for the dashboard
GET   /api/brain/memories         — list memory_items (filterable by type / query)
GET   /api/brain/journal          — list journal_entries (since-ISO / limit)
GET   /api/brain/persona          — SOUL.md + KV-backed overrides
GET   /api/brain/now              — active scratchpad row (per scope)
GET   /api/brain/signals          — proactivity signals
```

### Dashboard wire-up

`apps/dashboard/lib/brain/source.ts` `nexusApiSource()` is no longer a
passthrough to the demo source — it issues real HTTP against the
configured `NEXUS_API_BASE_URL`, attaches a bearer if `NEXUS_API_BEARER`
is set, and falls back to the demo source per-call on any failure so the
Brain page never goes blank in production.

Flip the switch with:

```
BRAIN_SOURCE=nexus
NEXUS_API_BASE_URL=https://nexus-api.<account>.workers.dev
NEXUS_API_BEARER=<owner session token>   # optional, only needed once the access gate is armed
```

## Architectural notes

### Why a worker-local registry instead of importing `@posteragent/orchestrator`?

The nested workspace at `apps/nexus/apps/nexus-api` is intentionally
isolated from the outer `@posteragent/*` packages — see the comment at
the top of `routes/tasks.ts` for the original rationale. The pattern is:

> "The worker uses its own type aliases to avoid runtime workspace
>  coupling at build time, but the shapes MUST stay in lock-step with
>  the TS unions."

So the worker carries its own copy of:

- `services/agent-registry.ts` — mirrors `@posteragent/orchestrator/registry`
- `services/orchestrator.ts`   — mirrors `@posteragent/orchestrator/run`
- `data/soul.ts`               — mirrors `@posteragent/identity/data/SOUL.md`

These are kept honest by:

1. A `CHECK` constraint in migration 023 (the 14-member type union).
2. Tests in both packages that compare the literal list lengths.
3. A SOUL.md no-em-dash assertion in the identity package.

When a new agent type is added to `@posteragent/types`, the compile-time
exhaustiveness check on the outer registry fires first; the worker copy
gets a new descriptor in the same PR.

### `/api/agents/run` body shapes

Three equivalent ways to invoke the same flow:

```jsonc
// Run an existing queued task by ID
{ "taskId": "abc123" }

// Create + run in one call (explicit)
{ "create": { "type": "research", "payload": { "question": "..." } } }

// Create + run (shorthand — payload optional)
{ "type": "memory-consolidate" }
```

Optional `"force": true` lets the caller re-run a task that's already
`running` or `done` (useful for the dashboard's "retry" button).

Response is always:

```jsonc
{
  "task": { /* inflated agent_tasks row with parsed payload + result */ },
  "ranInline": true,
  "reason": "..."   // only present when ranInline === false
}
```

A failed handler does NOT throw at the route level — it lands as
`{ status: "failed", error: "..." }` on the task row so the dashboard
can render the failure state inline.

### Cost accounting

Every successful run writes `actual_cost_usd`, `model_used`,
`input_tokens`, `output_tokens` back to `agent_tasks`. Stub handlers
write `0` and `"stub"` so the dashboard can clearly distinguish them
from real spend.

`estimated_cost_usd` is populated on insert from the registry's
`estimatedCostUsd` field, giving the dashboard a pre-flight budget
without needing a separate estimator pass.

### Signals: real D1, not demo

`/api/brain/signals` now runs the four scanners against live D1:

| Signal                | Source                                          |
|-----------------------|-------------------------------------------------|
| `follow-up`           | journal_entries.follow_ups (last 24h)            |
| `task-failed-burst`   | agent_tasks where status=failed in last 1h      |
| `task-stalled`        | agent_tasks where status=running > 30m          |
| `now-stale`           | now_scratchpad rows past expires_at + 1h        |
| `consolidation-due`   | journal_entries where consolidated=0, threshold 20 |
| `idle`                | emitted when none of the above fire             |

This mirrors the scanner taxonomy in `@posteragent/proactivity` so
the dashboard surface matches the engine's auto-queue logic.

## What's NOT in this PR (deliberate follow-ups)

- **SSE endpoints for brain reads.** The dashboard polls; if real-time
  becomes a need (e.g. memory consolidation finishes in the background),
  the existing `/api/tasks/stream` pattern transfers cleanly.
- **Mutation endpoints under `/api/brain/*`.** Writes still happen via
  the existing surfaces (tasks API for memories+journal, settings for
  persona+now). Centralising them under `/api/brain/*` is a P2 cleanup.
- **OpenAPI / type generation.** The dashboard's `nexusApiSource` parses
  responses by shape, not generated types. Worth doing if a third
  consumer arrives.
- **Per-handler auth scoping.** All routes today share the worker's
  global access gate. Per-agent ACLs land with TASK-700 (Settings v2).

## Testing

Pure-logic tests cover everything that doesn't need a live D1:

- `services/agent-registry.test.ts` — 14-type contract, status/tag filters
- `services/orchestrator.test.ts`   — body validation, stub handler, inflate
- `services/signals.test.ts`        — all four scanner branches with mock D1
- `lib/brain/source.test.ts`        — nexusApiSource HTTP behaviour + fallback

D1-touching paths (the actual `runAgentTask` end-to-end with claim +
persist) are covered by a `wrangler dev` smoke test that's run manually
during the next staging deploy.
