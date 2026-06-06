# Phase 0 — Foundation

Status: ✅ Complete (TASK-000 → TASK-004)

This phase delivers the structural backbone every later phase depends on:
workspace hygiene, shared types, structured logging, error recovery, and a
working `pnpm dev` precheck.

---

## TASK-001 · Workspace Resolution

**Problem.** The root `pnpm-workspace.yaml` was reaching into
`apps/nexus/apps/*` and `apps/nexus/packages/*`, hoisting nexus-internal
packages into the outer workspace and creating ambiguous resolution.

**Fix.**
- Root `pnpm-workspace.yaml` now only lists `apps/*` and `packages/*`.
- `apps/nexus/pnpm-workspace.yaml` was added so the inner monorepo manages
  its own `apps/*` and `packages/*` independently.
- Root `package.json` `workspaces` field aligned with the same shape.
- The inner `@nexus/*` packages remain resolvable via the `paths` aliases
  already present in `apps/nexus/tsconfig.json`.

No outer package imports `@nexus/*`, so this change is non-breaking.

---

## TASK-002 · `@posteragent/types`

A single source of truth for cross-package contracts. Lives at
`packages/types/src/index.ts`. Exports:

| Type / Interface       | Purpose                                       |
|------------------------|-----------------------------------------------|
| `AgentTask` + status   | Queued unit of work for any agent              |
| `AgentResult`          | Return shape for `BaseAgent.run()`             |
| `DashboardModule`      | Sidebar module registration                    |
| `DashboardMetrics`     | KPI bar contract                               |
| `MemoryItem`           | Brain layer record (embedding optional)        |
| `RevenueEvent`         | Unified monetisation event                     |
| `Lead`                 | Lead-finder hit                                |
| `ContentItem` + status | Cross-platform content lifecycle               |
| `PublishPayload/Result`| Publisher in/out                               |

Import from anywhere with:

```ts
import type { AgentTask, MemoryItem } from '@posteragent/types'
```

---

## TASK-003 · `@posteragent/logger`

Pino-based structured logger with:

- JSON in production, `pino-pretty` in development
- Per-module scoped loggers via `createLogger('research-agent')`
- `taskId` automatically threaded through async chains using
  `AsyncLocalStorage` and `runWithTaskId()`
- Agent-call helpers: `agentStart`, `agentToolCall`, `agentToolResult`,
  `agentDone`, `agentError`

```ts
import { createLogger, runWithTaskId } from '@posteragent/logger'

const log = createLogger('publisher:twitter')

await runWithTaskId('task_42', async () => {
  log.info('publishing thread', { items: 5 })
  // every nested log inside this scope auto-tags `taskId: "task_42"`
})
```

The existing `apps/nexus/packages/logger` (`@nexus/logger`) stays in place for
Cloudflare-Worker-side code where `node:async_hooks` isn't available. Node-side
packages should adopt `@posteragent/logger`.

---

## TASK-004 · `@posteragent/resilience`

Two primitives plus typed errors:

### `withRetry(fn, opts)`
- Exponential backoff (factor 2, default 500ms → 30s)
- Full jitter on by default
- Per-attempt `timeoutMs`
- Honours `NonRetryableError` and HTTP 4xx (except 408/429)
- `onRetry(err, attempt, delay)` hook
- Throws `RetryExhaustedError` when budget runs out

### `CircuitBreaker`
- States: `CLOSED → OPEN → HALF_OPEN → CLOSED`
- `failureThreshold`, `cooldownMs`, `halfOpenMaxCalls`
- Module-level `getBreaker(name)` registry for sharing instances
- `listBreakers()` for `/api/health` introspection

```ts
import { withRetry, getBreaker } from '@posteragent/resilience'

const cb = getBreaker('cosmic-write', { failureThreshold: 3, cooldownMs: 10_000 })

const result = await cb.exec(() =>
  withRetry(() => cosmic.objects.insertOne(payload), {
    maxAttempts: 4,
    label: 'cosmic.insertOne',
    timeoutMs: 8_000,
  }),
)
```

Tests under `packages/resilience/src/*.test.ts` cover both modules with
`vitest` + fake timers.

---

## TASK-000 · Health Check + Pre-flight `pnpm dev`

Two new pieces:

1. **`packages/config/src/health.ts`** — `runHealthChecks()` pings Anthropic,
   OpenAI, Cosmic, Replicate, ElevenLabs, and fal.ai in parallel with
   per-call timeouts. Returns a structured `HealthReport`. Used by the
   future `/api/health` endpoint.

2. **`scripts/check-env.ts`** — runnable with `pnpm check-env`. Validates
   env via the existing zod schema, then pings every required service.
   Exits 1 on failure so `turbo dev` halts before booting a half-wired
   stack. Supports `--env-only` to skip network pings.

`turbo.json` now declares `dev` as `dependsOn: ["check-env"]` so the
precheck runs automatically on `pnpm dev`.

---

## Verification

```bash
pnpm install
pnpm check-env --env-only      # passes with full .env
pnpm typecheck                  # all packages
pnpm test --filter @posteragent/resilience  # retry + breaker suites
```

---

## What unblocks next

- **Phase 1 — Brain Layer** can now consume `MemoryItem` from
  `@posteragent/types` and use `withRetry` for embedding-API calls.
- **Phase 2 — Agent Spine** can extend `AgentTask`/`AgentResult` and
  wrap each task in `runWithTaskId(...)` for free log correlation.
- Every external-service call from now on should go through `withRetry`
  + named breakers.
