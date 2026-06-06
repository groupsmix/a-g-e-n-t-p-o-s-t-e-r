# TASK-202 — Proactivity Engine

The brain layer's nervous system. Reads journal + NOW + agent_tasks,
emits ranked Signals, and optionally auto-queues follow-up tasks.

## Package

```
packages/proactivity/
  src/
    types.ts             Signal, Scanner, Thresholds, ProactivityDB, Report
    run.ts               runProactivity(opts) — entry point
    scanners/
      journal.ts         follow-up signals + consolidation backlog
      now.ts             NOW absent / expired / aged
      tasks.ts           stalled / failure-burst / idle
      index.ts           defaultScanners barrel
    index.ts             public surface
    run.test.ts          end-to-end fake-D1 tests
```

## Usage

```ts
import { runProactivity } from '@posteragent/proactivity'

// Hourly cron (Cloudflare scheduled handler):
const report = await runProactivity({
  db: env.DB,
  autoQueue: true,           // create agent_tasks rows from suggestions
  thresholds: {              // override defaults if needed
    taskStalledMs: 15 * 60_000,
    consolidationDueCount: 50,
  },
})

// report.signals — ranked observations (for dashboard / notifier)
// report.queued  — agent_tasks rows the engine created this run
```

The engine is schedule-agnostic. Cloudflare Cron, GitHub Actions hourly,
or a Node `setInterval` all work the same way — the package only needs
a D1-compatible binding.

## Signal model

```ts
type SignalKind =
  | 'follow-up'            // journal entry left an unresolved follow_up
  | 'now-stale'            // NOW scratchpad empty / expired / aged
  | 'task-stalled'         // a task has been running too long
  | 'task-failed-burst'    // N failures of the same type within a window
  | 'consolidation-due'    // many unconsolidated journal entries
  | 'idle'                 // no tasks created recently
```

Each Signal has a stable `key` (so re-runs dedupe), a `score` in 0..1
(so the runner can rank + truncate), and an optional `suggestion`
pointing at an `AgentTaskType` the runner can auto-queue.

## Scanner rules

1. **Scanners are pure readers.** They never write to the DB.
2. **Scanners never throw.** Errors get logged and the scanner returns
   an empty array. One broken scanner cannot kill the whole run.
3. **The runner is the only writer.** Auto-queue is opt-in via
   `autoQueue: true`. Even then, writes are idempotent — the runner
   refuses to queue another `memory-consolidate` while one is already
   `queued` or `running`.

## Default thresholds

| Threshold | Default | What it controls |
|---|---|---|
| `taskStalledMs` | 30 min | "task-stalled" trigger |
| `failureBurstCount` | 3 | "task-failed-burst" trigger |
| `failureBurstWindowMs` | 1 hour | Window for failure burst |
| `consolidationDueCount` | 25 | Unconsolidated journal entries |
| `idleWindowMs` | 6 hours | "idle" trigger |
| `followUpLookbackMs` | 24 hours | Journal scanner window |
| `maxSignals` | 25 | Returned-per-run cap |

All overridable per-call via `thresholds: Partial<Thresholds>`.

## Tests

```
pnpm --filter @posteragent/proactivity test
```

Covers:
- journal: follow-up extraction + severity by outcome + consolidation backlog
- now: absent / expired / aged / fresh-no-signal
- tasks: stalled / failure burst / idle present / idle absent
- runner: ranking, dedupe, truncation, auto-queue idempotency, payload trace

## What this unblocks

- **Dashboard "Now what?" panel.** `report.signals` is the source.
- **TASK-1102 rate-limit / quota guard.** Adds a scanner for budget burn.
- **Memory consolidation runs autonomously** once auto-queue is on.
- **Cost-per-handler observability.** Failure-burst signals catch
  expensive infinite-retry loops.

## What is NOT in this PR

- Cloudflare cron wiring (one liner: `scheduled(event, env, ctx) → runProactivity({ db: env.DB, autoQueue: true })`)
- Dashboard UI for the signals (TASK-203)
- Telegram / Slack notifier (Phase 10)
