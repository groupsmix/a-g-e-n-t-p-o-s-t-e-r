# Phase 1b — Tasks API + live wiring

> Status: 🟢 Shipped.
> Builds on **Phase 1 (#6)**. Wires the dashboard's live activity feed and
> command palette to a real backend via new `/api/tasks` endpoints on
> the nexus-api worker.

## What ships

### TASK-101b — `/api/tasks` on nexus-api

New file: `apps/nexus/apps/nexus-api/src/routes/tasks.ts`. Reads / writes
against the `agent_tasks` D1 table introduced in migration 023.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/tasks` | List with `?status=&type=&limit=&since=` |
| `POST` | `/api/tasks` | Create a queued task |
| `GET` | `/api/tasks/:id` | Fetch one |
| `PATCH` | `/api/tasks/:id` | Update status / result / error / cost |
| `GET` | `/api/tasks/stream` | SSE tail of recent changes |

**Type contract:** mirrors `packages/types/src/index.ts → AgentTask`.
Type / status / origin enums in `tasks.ts` are kept in lock-step with
the TS unions and the `CHECK` constraints on the D1 table.

**SSE design:**
- Polls `agent_tasks WHERE updated_at > cursor ORDER BY updated_at ASC`
  every `intervalMs` (default 2 s, clamped 500 ms–30 s).
- Cursor starts from `Last-Event-ID` header (set automatically by the
  browser on reconnect) or, on first connect, "60 s ago".
- Emits 5 event types: `open`, `task`, `ping` (15 s heartbeat),
  `close`, `error`.
- Each `task` event sets `id: <updated_at>` so reconnects resume
  exactly where they left off.
- Self-terminates after 90 s and signals `close: { reason: 'budget' }`
  to fit inside CF Workers' 100 s I/O limit. The client transparently
  reconnects.

**Smart status transitions:** the `PATCH` handler is aware of the
state machine — `queued → running` stamps `started_at`; `running →
done|failed|cancelled` stamps `finished_at` and materialises
`duration_ms = (finished_at - started_at) * 86400000`. The dashboard
doesn't have to know about any of this.

**Mounting:** `index.ts` imports `tasksRoutes` and mounts at
`/api/tasks`. The existing `/health` endpoint is duplicated as
`/api/health` to match the dashboard's convention.

### TASK-102a — live wiring in `apps/dashboard`

**`lib/api.ts` (rewritten):**
- Wire types `AgentTaskRow`, `CreateTaskInput`, `PatchTaskInput`
  modelling the worker's response shape.
- `rowToTask(row)` adapter converts snake_case wire rows into the
  canonical `AgentTask` interface from `@posteragent/types`.
- Typed methods: `api.health() / listTasks() / getTask() / createTask() /
  patchTask() / subscribeTasks()`.
- `subscribeTasks` takes a `handlers` object (`onTask`, `onOpen`,
  `onPing`, `onClose`, `onError`) so callers don't have to write the
  event-listener dance themselves.

**`components/shared/LiveActivityFeed.tsx` (new):**
A Client Component that:
1. Hydrates from `api.listTasks({ limit: 30 })` via React Query.
2. Subscribes to `api.subscribeTasks` for deltas.
3. Upserts incoming tasks by `id`, keeps the list sorted by
   `createdAt DESC`, caps in-memory at 100.
4. Renders a connection indicator pill — `connecting · live · paused ·
   error` — with an animated emerald dot when live.
5. Handles loading / error / empty / populated states distinctly.

Dropped into `app/page.tsx` replacing the static placeholder.

**`components/layout/CommandPalette.tsx` (wired):**
- Intent parser now returns `{ label, route, type, payload }` typed
  against `AgentTaskType`, with structured payloads (e.g. `{ topic }`
  for research, `{ idea }` for build-site).
- New `runIntent(i)` calls `api.createTask` and routes on success.
- Inline "queueing…" state + error message inside the palette.

## Validation

- `tsc --noEmit` on `apps/dashboard` — **exit 0**
- `tsc --noEmit` on `apps/nexus/apps/nexus-api` — **0 errors in
  production files** (8 pre-existing errors in `*.test.ts` files about
  missing `vitest`, which are sandbox-only and unrelated)

## What's coming next

| Task | Description |
|---|---|
| **TASK-103** | Settings vault — encrypted KV-backed `GET/POST /api/settings`, dashboard `/settings` form |
| **TASK-104** | KPI top-bar metrics endpoint + auto-refresh |
| **TASK-105** | Agent dispatch — `agent_tasks` POST → automation_jobs enqueue → worker queue runner |
