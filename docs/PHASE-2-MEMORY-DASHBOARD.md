# TASK-203 — Memory Dashboard UI (Brain page)

Single dashboard page that renders the entire brain layer. This is
what the owner reads before doing anything, and what every agent
implicitly stands on through `BaseAgent`.

## Route

`/brain` in `apps/dashboard` (replaces the prior `ModuleStub` placeholder).

## What it shows

1. **Summary tiles** — memory counts (by type), journal volume last 7d,
   urgent signal count, NOW expiry.
2. **Proactivity signals** — ranked list of what the proactivity engine
   thinks needs attention, with suggested next actions and severity.
3. **Memory explorer** — filter by type (identity/preference/project/
   fact/event), free-text search, importance bar, source attribution.
4. **Journal timeline** — last 20 agent runs with outcome icons,
   learnings, follow-ups, consolidated badge.
5. **Persona panel** — SOUL.md rendered, plus the live NOW scratchpad
   line with expiry countdown.

## Data plane

Five thin Next.js route handlers under `app/api/brain/`:

| Route | Returns |
|---|---|
| `GET /api/brain/summary` | `BrainSummaryDTO` |
| `GET /api/brain/memories?type&q&limit` | `MemoryItemDTO[]` |
| `GET /api/brain/journal?since&limit` | `JournalEntryDTO[]` |
| `GET /api/brain/persona` | `PersonaDTO` |
| `GET /api/brain/now?scope` | `NowEntryDTO \| null` |
| `GET /api/brain/signals?limit` | `SignalDTO[]` |

All five delegate to a `BrainSource` interface chosen via
`BRAIN_SOURCE` env var:

- `BRAIN_SOURCE=demo` (default) — synthetic in-memory fixtures so the
  UI is shippable immediately and demo-able in CI.
- `BRAIN_SOURCE=nexus` — `nexusApiSource` that proxies to the
  nexus-api worker once TASK-300 routes land. Currently passes
  through to demo so the dashboard never breaks during the rollout.

Switching backends is one env var. No UI changes.

## Client architecture

- React Query (already wired in `app/providers.tsx`) handles
  fetching, caching, and auto-refresh.
- Five components under `app/brain/components/`:
  - `BrainSummary` (60s refetch)
  - `SignalsPanel` (30s refetch — the most live thing on the page)
  - `MemoryExplorer` (debounced search, type filter)
  - `JournalTimeline` (60s refetch)
  - `PersonaPanel` (NOW refetches at 60s)
- All components are `'use client'` and read straight from `/api/brain/*`.

## Tests

```
pnpm --filter @posteragent/dashboard test
```

Covers the data source:
- type / query filtering on `listMemories`
- empty-result behavior
- summary totals match per-type breakdown
- signals returned ranked and non-empty
- `chooseBrainSource` honours the `BRAIN_SOURCE` env var

UI components are intentionally untested here — they're declarative
shells over the source layer and would gain little from snapshot tests.
Real-data integration testing comes once nexus-api routes land.

## Wiring to real data (TASK-300 follow-up)

Replace the body of `nexusApiSource()` in `lib/brain/source.ts` with
HTTP calls into the nexus-api worker. One file change, no UI churn.

## What is NOT in this PR

- Mutation (set NOW from the UI, queue suggested action, mark journal
  consolidated). Read-only for now.
- WebSocket / SSE live updates. Polling is fine for the first cut.
- Embeddings visualization (Phase 5).
- Editing SOUL.md inline (deferred — file edits go through the
  identity package, not the UI).
