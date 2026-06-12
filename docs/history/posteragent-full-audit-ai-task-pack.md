# posteragent full audit and AI execution task pack

Date: 2026-06-09
Repo audited: `https://github.com/groupsmix/a-g-e-n-t-p-o-s-t-e-r`
Local clone audited: `/workspace/repo-review-agentteams/a-g-e-n-t-p-o-s-t-e-r`
Goal: turn posteragent into a single-owner all-in-one personal team agent.

## Executive diagnosis

posteragent has a lot of real material, but it is split across competing architectures:

1. **Legacy `@repo/*` stack**: `apps/runner`, `apps/factory`, `packages/agents`, `packages/tools`, `packages/workflows`, `packages/core`, `packages/cms`, `packages/generators`, `packages/publishers`. This is Mastra/Supabase/Cosmic/Remotion/content-machine oriented.
2. **New `@posteragent/*` brain/orchestrator stack**: `packages/memory`, `packages/identity`, `packages/orchestrator`, `packages/proactivity`, `packages/agent-*`.
3. **Nested `@nexus/*` Cloudflare stack**: `apps/nexus/apps/web`, `apps/nexus/apps/nexus-api`, `apps/nexus/apps/nexus-ai`, plus `apps/nexus/packages/*`.
4. **Separate root `apps/dashboard` Brain Cockpit**: useful UI work, but it duplicates the NEXUS dashboard concept.

The repo is not empty or fake. Real pieces exist: D1 migrations, task API, brain layer, research agent, memory, proactivity, budget/revenue/publisher packages, NEXUS API routes, NEXUS web UI. The problem is **integration**. The dashboard, queue, orchestrator, runtime wiring and docs do not converge into one reliable product yet.

The right strategy is not “build 20 new agents.” The right strategy is:

> Make one canonical app, one canonical task table, one canonical orchestrator path, one approval system, one brain layer, then wire the existing agents into that spine.

## Critical findings

### Finding 1: Two dashboards exist and the product direction is split

Evidence:
- `apps/nexus/apps/web` is the canonical NEXUS dashboard according to `docs/ADR-001-canonical-dashboard.md`.
- `apps/dashboard` still exists as a Brain Cockpit with routes `/brain`, `/research`, `/builder`, `/content`, `/publisher`, `/analyse`, `/autonome`, `/revenue`, `/leads`, `/settings`.
- `docs/FIXES-2026-06-05.md` says removing `apps/dashboard` was part of a prior fix, but the app still exists.

Impact:
- Agents and future contributors will build in the wrong app.
- UI/API work duplicates.
- The user wants one personal all-in-one team agent. Two dashboards are the opposite of that.

Decision:
- Keep `apps/nexus/apps/web` as the single canonical dashboard.
- Move Brain Cockpit features into NEXUS web under `/brain` and maybe `/command-center`.
- Retire or archive `apps/dashboard` once migrated.

### Finding 2: Workspace/package structure is brittle

Evidence:
- Root `pnpm-workspace.yaml` only includes `apps/*` and `packages/*`.
- Nested `apps/nexus/pnpm-workspace.yaml` includes `apps/nexus/apps/*`, `apps/nexus/packages/*`, and relative `../../packages/*` references.
- Root `package.json` has `postinstall`: `cd apps/nexus && pnpm install --prefer-offline || true`.
- Root lockfile includes `apps/nexus` as a package, but nested packages are managed by the nested workspace.

Impact:
- Clean install can drift between root and nested lockfiles.
- CI can pass in one workspace while deployment fails in another.
- AI agents will modify the wrong package manager context.

Decision:
- Either flatten to one workspace root, or strongly formalize nested workspace boundaries.
- For a personal project, flattening is better.

### Finding 3: `/api/agents/run` currently uses a worker-local stub orchestrator

Evidence:
- `apps/nexus/apps/nexus-api/src/routes/agents.ts` imports `runAgentTask` from `../services/orchestrator`.
- `apps/nexus/apps/nexus-api/src/services/orchestrator.ts` initializes all handlers with `defaultStubHandler()`.
- `registerHandler()` is never called anywhere except its own definition.
- Therefore `/api/agents/run` is effectively stub-only.
- Separately, `apps/nexus/apps/nexus-api/src/services/orchestrator-bridge.ts` wires the real `@posteragent/orchestrator` package and is used by scheduled `tickOrchestrator()`.

Impact:
- The dashboard/command-palette path and scheduled path do different things.
- Manual agent runs can return fake success while the real orchestrator exists elsewhere.
- This is a major trust bug.

Decision:
- Delete or demote the worker-local orchestrator.
- Make `/api/agents/run` call the same `@posteragent/orchestrator` path used by `orchestrator-bridge.ts`.

### Finding 4: There are two task/queue systems with unclear product layering

Evidence:
- `automation_jobs` in `apps/nexus/migrations/020_agent_queue.sql` is a low-level retry/dead-letter queue.
- `agent_runs` in `apps/nexus/migrations/022_agent_runs_ledger.sql` is a run/cost ledger.
- `agent_tasks` in `apps/nexus/migrations/023_agent_tasks.sql` is a user-facing task feed.
- `/api/queue` exposes `automation_jobs`.
- `/api/tasks` exposes `agent_tasks`.

Impact:
- UI can show the wrong layer.
- Agents can enqueue different queue types.
- There is no clear “personal team agent task board” yet.

Decision:
- `agent_tasks` must be the user-facing control plane.
- `automation_jobs` should become internal only.
- `agent_runs` should be a ledger attached to `agent_tasks` with `task_id` or a join table.

### Finding 5: Control-plane tables are missing

Existing:
- `agent_tasks`
- `agent_runs`
- `memory_items`
- `journal_entries`
- `now_scratchpad`
- `persona_traits`
- `publish_jobs`
- revenue/budget/quota tables

Missing for Agent Teams style control plane:
- `task_events`
- `agent_messages`
- `approval_requests`
- `artifacts`
- `live_processes`
- optional `task_attachments`

Impact:
- No reliable timeline of what an agent did.
- No structured human approval flow.
- No artifacts/outputs attached to tasks.
- No process registry for running jobs/dev servers/renders.

Decision:
- Add a control-plane migration before adding more agents.

### Finding 6: Task statuses are too limited for a personal team agent

Current statuses:
- `queued`
- `running`
- `done`
- `failed`
- `cancelled`

Needed statuses:
- `inbox`
- `planned` or `queued`
- `running`
- `needs_me`
- `done`
- `failed`
- `cancelled`
- `archived`

Impact:
- No “Needs Me” lane.
- Approval/question/review work is awkward.
- External actions can only be blocked by ad-hoc code.

Decision:
- Add `needs_me` and approval records now.
- Either keep `queued` as internal planned status, or migrate to `planned` while preserving compatibility.

### Finding 7: Several “real” agents exist but are not fully wired into the main user path

Evidence:
- Real packages exist: `@posteragent/agent-research`, `agent-publisher`, `agent-analytics`, `agent-autonome`, `agent-budget`, `agent-revenue`, `agent-mindsdb`.
- `@posteragent/orchestrator/wire.ts` can override stubs when deps are provided.
- `orchestrator-bridge.ts` wires research, memory, budget, analytics, revenue, autonome.
- Publisher is deliberately left as a stub in the bridge.
- Image/video deps are not wired in the bridge.
- `/api/agents/run` does not use the bridge.

Impact:
- Existing real work is not surfaced reliably to the dashboard.
- Agent registry status claims can become inaccurate.

Decision:
- First wire Research, Write, Memory Consolidate, Budget Guard and Publisher Draft.
- External publish must remain approval-gated.

### Finding 8: API route coverage is good, but there is at least one duplicate mount

Evidence:
- 60 route files in `apps/nexus/apps/nexus-api/src/routes` are imported and mounted.
- `/api/revenue` is mounted twice in `apps/nexus/apps/nexus-api/src/index.ts`.

Impact:
- Usually harmless in Hono, but sloppy and confusing.

Decision:
- Remove the duplicate mount and add a route-mount test that detects duplicates.

### Finding 9: Docs are conflicting and will mislead agents

Evidence:
- `docs/AGENT_TASKS.md` is older money-machine/Supabase/Mastra oriented.
- `docs/POSTERAGENT_TASKS_V2.md` is closer to the current direction but still references phases that overlap with shipped code.
- `docs/FIXES-2026-06-05.md` says `apps/dashboard` was removed, but it exists.
- `docs/ADR-001-canonical-dashboard.md` says NEXUS web is canonical, but Brain Cockpit remains active.

Impact:
- AI agents will implement obsolete tasks.
- Tasks will be duplicated.

Decision:
- Add `docs/CURRENT_ARCHITECTURE.md` and mark older docs as historical.
- Make one current execution roadmap.

### Finding 10: The system lacks a hard “approval before external action” spine

Some protections exist:
- Money-machine routes require `MONEY_MACHINE_TOKEN`.
- Global access gate protects `/api`.
- CORS allow-list exists.
- Keys/credential vault has KEK support.

Still missing:
- Generic `approval_requests` table.
- Required approval for publish/send/spend/delete/deploy actions.
- UI lane for approvals.
- Tool-level policy enforcement.

Decision:
- Add a central approval gate before expanding publish/email/leads/autopilot.

## Target architecture

Use this as the north star:

```txt
apps/
  nexus/apps/web          # canonical single dashboard
  nexus/apps/nexus-api    # Cloudflare API/orchestrator/control plane
  nexus/apps/nexus-ai     # model/failover worker if kept

packages/
  types                   # shared contracts
  memory                  # memory store/retrieval
  identity                # SOUL/NOW/persona/journal
  orchestrator            # BaseAgent, registry, task runner
  proactivity             # suggestion scanner
  agent-research          # real research agent
  agent-publisher         # draft/schedule/publish adapter agent
  agent-budget            # cost guard
  agent-revenue           # revenue ingestion/reporting
  agent-analytics         # platform analytics
  agent-autonome          # autonomous planner loop
```

Control plane:

```txt
agent_tasks       # user-facing task board
agent_runs        # model/tool run ledger
agent_messages    # task conversations and agent notes
task_events       # flight recorder timeline
approval_requests # Needs Me lane
artifacts         # outputs/files/URLs/content attached to tasks
live_processes    # running jobs/services/renders/dev servers
memory_items      # durable memory
journal_entries   # per-run reflections
publish_jobs      # publishing queue
budget_*          # budget caps and usage
revenue_*         # revenue events and summaries
```

Dashboard lanes:

```txt
Inbox → Planned/Queued → Running → Needs Me → Done → Failed → Archived
```

Agent policy:

```txt
Agents can draft, research, prepare, analyze, and queue.
Agents cannot publish, send emails, spend money above cap, deploy, delete, or change production without approval.
```

## Copy-paste AI task packets

Each packet below is ready to send to a coding agent. Run them in order. Do not parallelize P0 tasks unless the agent understands the dependencies.

---

## P0-001 — Make the monorepo boot from a clean checkout

**Objective**
Make `posteragent` install, typecheck and test from a clean checkout with one documented command path. Eliminate package-manager ambiguity.

**Context**
The repo currently uses a root workspace plus a nested `apps/nexus` workspace. Root `postinstall` runs a nested install. This is fragile and blocks every other task.

**Files to inspect/change**
- `package.json`
- `pnpm-workspace.yaml`
- `pnpm-lock.yaml`
- `turbo.json`
- `apps/nexus/package.json`
- `apps/nexus/pnpm-workspace.yaml`
- `apps/nexus/turbo.json` if present
- all `tsconfig.json` files under `apps/*`, `packages/*`, `apps/nexus/**`
- `.github/workflows/ci.yml`
- `README.md`

**Required work**
1. Add a documented clean setup command:
   ```bash
   corepack enable
   corepack prepare pnpm@9.15.0 --activate
   pnpm install --frozen-lockfile
   pnpm typecheck
   pnpm test
   ```
2. Decide and implement one of these approaches:
   - Preferred: flatten to one root workspace by adding `apps/nexus/apps/*` and `apps/nexus/packages/*` to root `pnpm-workspace.yaml`, then remove the nested `postinstall` install trick.
   - Acceptable short-term: keep nested workspace, but add explicit scripts `nexus:install`, `nexus:typecheck`, `nexus:test`, `nexus:build` and make CI run both root and nested checks.
3. Remove `|| true` from install-critical scripts. Failing installs must fail CI.
4. Add `scripts/doctor.mjs` or `scripts/doctor.ts` that checks:
   - Node version >= 20
   - pnpm version >= 9
   - root install present
   - if nested workspace remains, nested install present
   - required env vars are either set or explicitly optional
5. Update README quick start.

**Acceptance criteria**
- `pnpm install --frozen-lockfile` succeeds on a fresh checkout.
- `pnpm typecheck` runs all intended packages or explicitly documents skipped packages.
- `pnpm test` runs all intended tests.
- CI runs the same commands.
- There is no silent `|| true` hiding failed installs.

**Do not**
- Add new features.
- Change business logic.
- Leave two undocumented install paths.

---

## P0-002 — Declare one canonical dashboard and migrate Brain Cockpit into it

**Objective**
Make NEXUS web the single user-facing dashboard and move the useful Brain Cockpit screens into it.

**Context**
`docs/ADR-001-canonical-dashboard.md` says `apps/nexus/apps/web` is canonical. `apps/dashboard` still exists and duplicates dashboard concepts. The product must be one personal command center.

**Files to inspect/change**
- `docs/ADR-001-canonical-dashboard.md`
- `docs/FIXES-2026-06-05.md`
- `apps/dashboard/**`
- `apps/nexus/apps/web/src/app/**`
- `apps/nexus/apps/web/src/components/shell/Sidebar.tsx`
- `apps/nexus/apps/web/src/lib/api.ts`
- `apps/dashboard/app/brain/**`
- `apps/dashboard/lib/brain/**`

**Required work**
1. Create NEXUS web pages if missing:
   - `/brain`
   - `/brain/memories`
   - `/brain/journal`
   - `/brain/persona`
   - `/brain/now`
   - `/tasks` or `/command-center`
2. Port useful components from `apps/dashboard/app/brain/components/*` into `apps/nexus/apps/web/src/components/brain/*`.
3. Use `apps/nexus/apps/nexus-api/src/routes/brain.ts` as the backend, not duplicate Next API routes.
4. Add Brain to NEXUS sidebar.
5. Replace `apps/dashboard` README/status with one of:
   - archived/deprecated, or
   - deleted after migration.
6. Update docs to say: “NEXUS web is the only dashboard. Brain Cockpit has been merged into NEXUS web.”

**Acceptance criteria**
- A user can open one dashboard and see tasks, brain, revenue, publisher, settings.
- No active docs tell agents to build new product UI in `apps/dashboard`.
- `apps/dashboard` is either deleted or clearly archived.
- All Brain UI data comes from `/api/brain/*` on `nexus-api`.

**Do not**
- Keep two active dashboards.
- Build new features in the old dashboard.

---

## P0-003 — Replace `/api/agents/run` stub path with the real orchestrator

**Objective**
Make manual agent runs and scheduled agent runs use the same real orchestrator path.

**Context**
`/api/agents/run` currently calls `apps/nexus/apps/nexus-api/src/services/orchestrator.ts`, whose `registerHandler()` is never used and whose handlers are all stubs. The scheduled path uses `orchestrator-bridge.ts` and `@posteragent/orchestrator`.

**Files to inspect/change**
- `apps/nexus/apps/nexus-api/src/routes/agents.ts`
- `apps/nexus/apps/nexus-api/src/services/orchestrator.ts`
- `apps/nexus/apps/nexus-api/src/services/orchestrator-bridge.ts`
- `packages/orchestrator/src/run.ts`
- `packages/orchestrator/src/wire.ts`
- `packages/orchestrator/src/registry.ts`
- tests under `apps/nexus/apps/nexus-api/src/**`

**Required work**
1. Create/export a function from `orchestrator-bridge.ts`:
   ```ts
   runSingleAgentTask(env, args): Promise<{ task, ranInline, reason? }>
   ```
   It must:
   - create a task if args use `{ create }` or top-level `{ type, payload }`
   - build the wired registry via `getWiredRegistry(env)`
   - build identity via `buildIdentityLayer(env)`
   - call `@posteragent/orchestrator` `runAgentTask`
   - return inflated task row
2. Change `routes/agents.ts` to use the bridge, not `services/orchestrator.ts`.
3. Delete `services/orchestrator.ts` or rename it to `orchestrator-stub.legacy.ts` with no production imports.
4. Add tests proving:
   - `/api/agents/run` with `research` uses real handler when secrets/deps are mocked.
   - `/api/agents/run` returns a visible stub marker only when a dependency is intentionally missing.
   - direct `/api/agents/run` and scheduled `tickOrchestrator()` share the same registry path.
5. Update `services/agent-registry.ts` so status is computed from actual wired deps where possible, not stale hard-coded claims.

**Acceptance criteria**
- `grep -R "from '../services/orchestrator'" apps/nexus/apps/nexus-api/src` returns no production route imports.
- `/api/agents/run` no longer always returns `No handler wired` stub echoes.
- One orchestrator path exists for manual, scheduled and money-machine runs.

**Do not**
- Keep two production orchestrators.
- Hide missing dependencies as successful work.

---

## P0-004 — Add control-plane schema: events, messages, approvals, artifacts, live processes

**Objective**
Add the missing Agent Teams style control-plane tables and shared types.

**Context**
`agent_tasks` exists, but there is no structured timeline, agent message bus, approval request system, artifact registry or live process registry.

**Files to inspect/change**
- `apps/nexus/migrations/023_agent_tasks.sql`
- new `apps/nexus/migrations/035_control_plane.sql`
- `packages/types/src/index.ts`
- `apps/nexus/apps/nexus-api/src/routes/tasks.ts`
- new routes if needed:
  - `routes/task-events.ts`
  - `routes/messages.ts`
  - `routes/approvals.ts`
  - `routes/artifacts.ts`
  - `routes/processes.ts`

**Required work**
1. Add migration `035_control_plane.sql` with:
   - `task_events`
   - `agent_messages`
   - `approval_requests`
   - `artifacts`
   - `live_processes`
2. Add `needs_me` and `archived` support to `agent_tasks.status`. If D1 cannot alter CHECK safely, create a follow-up migration that rebuilds table or enforce new status in API while preserving DB compatibility short-term.
3. Add indexes:
   - by `task_id`
   - by `created_at DESC`
   - approval status
   - artifact kind
   - process status
4. Add shared TypeScript interfaces to `packages/types/src/index.ts`.
5. Add API endpoints:
   - `GET /api/tasks/:id/events`
   - `GET /api/tasks/:id/messages`
   - `POST /api/tasks/:id/messages`
   - `GET /api/approvals`
   - `POST /api/approvals/:id/approve`
   - `POST /api/approvals/:id/reject`
   - `POST /api/approvals/:id/request-changes`
   - `GET /api/tasks/:id/artifacts`
   - `POST /api/tasks/:id/artifacts`
   - `GET /api/processes`
   - `POST /api/processes/register`
6. Update orchestrator/BaseAgent to write task events at start, tool call, artifact save, approval request, completion, failure.

**Suggested schema sketch**
```sql
CREATE TABLE IF NOT EXISTS task_events (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  task_id TEXT NOT NULL REFERENCES agent_tasks(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  actor TEXT NOT NULL DEFAULT 'system',
  message TEXT,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS agent_messages (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  task_id TEXT REFERENCES agent_tasks(id) ON DELETE CASCADE,
  thread_id TEXT,
  from_agent TEXT NOT NULL,
  to_agent TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('user_message','agent_note','system_event','approval_request','tool_result')),
  content TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS approval_requests (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  task_id TEXT NOT NULL REFERENCES agent_tasks(id) ON DELETE CASCADE,
  requested_by TEXT NOT NULL,
  action TEXT NOT NULL,
  summary TEXT NOT NULL,
  risk TEXT NOT NULL CHECK (risk IN ('low','medium','high')),
  preview TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','changes_requested','expired')),
  decision_note TEXT,
  decided_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  task_id TEXT REFERENCES agent_tasks(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  content_type TEXT,
  storage TEXT NOT NULL CHECK (storage IN ('inline','r2','url','d1')),
  ref TEXT,
  inline_content TEXT,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS live_processes (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  task_id TEXT REFERENCES agent_tasks(id) ON DELETE SET NULL,
  label TEXT NOT NULL,
  command TEXT,
  pid TEXT,
  url TEXT,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','stopped','failed')),
  owner_agent TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  stopped_at TEXT,
  metadata TEXT NOT NULL DEFAULT '{}'
);
```

**Acceptance criteria**
- Every agent task has a timeline.
- Approvals show as first-class records.
- Artifacts can be attached to tasks.
- The dashboard can render a task detail page without scraping JSON blobs.

**Do not**
- Store everything only in `agent_tasks.result`.
- Add UI before routes and types exist.

---

## P0-005 — Build the personal Command Center task board

**Objective**
Create the main UI for the personal one-user team agent.

**Files to inspect/change**
- `apps/nexus/apps/web/src/app/page.tsx`
- new `apps/nexus/apps/web/src/app/command-center/page.tsx`
- `apps/nexus/apps/web/src/app/queue/page.tsx`
- `apps/nexus/apps/web/src/app/publisher-queue/page.tsx`
- `apps/nexus/apps/web/src/lib/api.ts`
- `apps/nexus/apps/web/src/components/shell/Sidebar.tsx`
- new components under `apps/nexus/apps/web/src/components/tasks/*`
- `apps/nexus/apps/nexus-api/src/routes/tasks.ts`
- new approval/message/artifact routes from P0-004

**Required work**
1. Build a Kanban board with lanes:
   - Inbox
   - Queued/Planned
   - Running
   - Needs Me
   - Done
   - Failed
   - Archived
2. Add task detail drawer/page showing:
   - payload
   - result summary
   - events timeline
   - messages
   - approvals
   - artifacts
   - run/cost info
3. Add a command input:
   - text box: “What should your AI team do?”
   - maps to task type with existing intent parser or new simple router
   - creates `agent_tasks` via `/api/tasks`
   - optional “run now” button calls `/api/agents/run`
4. Add approval action cards in Needs Me.
5. Add top metrics:
   - tasks today
   - running tasks
   - pending approvals
   - AI spend today
   - revenue 24h
   - failed tasks
6. Add safe empty states.

**Acceptance criteria**
- User can create a task from dashboard.
- User can run a task.
- User can see real status updates.
- User can approve/reject an approval request.
- Failed task shows error and retry action.

**Do not**
- Make this a pretty static demo.
- Depend on `apps/dashboard`.

---

## P0-006 — Add approval policy before any external action

**Objective**
Prevent agents from publishing, sending, deleting, deploying or spending above budget without user approval.

**Files to inspect/change**
- `packages/orchestrator/src/base-agent.ts`
- `packages/orchestrator/src/run.ts`
- `packages/orchestrator/src/types.ts`
- `packages/orchestrator/src/wire.ts`
- `packages/agent-publisher/**`
- `packages/agent-budget/**`
- `apps/nexus/apps/nexus-api/src/routes/publish.ts`
- `apps/nexus/apps/nexus-api/src/routes/publisher-queue.ts`
- `apps/nexus/apps/nexus-api/src/routes/email.ts`
- `apps/nexus/apps/nexus-api/src/routes/money-machine.ts`
- approval migration/routes from P0-004

**Required work**
1. Add an `ApprovalPolicy` utility with actions:
   - `publish_content`
   - `send_email`
   - `spend_money`
   - `deploy_site`
   - `delete_data`
   - `external_api_mutation`
2. Any handler attempting those actions must either:
   - return `needsApproval`, or
   - create an `approval_requests` row and mark task `needs_me`.
3. Add budget threshold rules:
   - require approval when estimated task cost exceeds configured cap.
   - require approval when daily spend cap would be exceeded.
4. Add tests for each risky action.

**Acceptance criteria**
- Publish/email routes cannot execute final external action without approval id.
- Agents can still draft content without approval.
- Approval decisions are recorded.
- `needs_me` status is visible in UI.

**Do not**
- Block harmless local draft/research tasks.
- Rely only on frontend checks.

---

## P0-007 — Fix route mount hygiene and API/client contract tests

**Objective**
Prevent silent route drift between NEXUS web and NEXUS API.

**Files to inspect/change**
- `apps/nexus/apps/nexus-api/src/index.ts`
- `apps/nexus/apps/nexus-api/src/routes/**`
- `apps/nexus/apps/web/src/lib/api.ts`
- `apps/nexus/apps/web/src/lib/api-types.ts`
- tests under both apps

**Required work**
1. Remove duplicate `api.route('/revenue', revenueRoutes)`.
2. Add a test that parses `index.ts` and fails on duplicate route mounts.
3. Add a test that ensures every `routes/*.ts` file is imported and mounted, excluding `*.test.ts`.
4. Add a frontend API client contract test for high-value endpoints:
   - `/api/health`
   - `/api/tasks`
   - `/api/agents/registry`
   - `/api/agents/run`
   - `/api/brain/summary`
   - `/api/metrics/summary`
   - `/api/publisher-queue/summary`
   - `/api/revenue/summary`
   - `/api/budget/summary`
5. Add a generated route manifest if practical.

**Acceptance criteria**
- Duplicate route mounts fail tests.
- Missing route imports fail tests.
- Web API methods cannot point to non-existent backend routes silently.

---

## P1-008 — Wire Research Agent end-to-end from dashboard

**Objective**
Make “research X” run a real research task, produce a report artifact, cite sources, write journal, and add useful memories.

**Files to inspect/change**
- `packages/agent-research/**`
- `packages/orchestrator/src/wire.ts`
- `apps/nexus/apps/nexus-api/src/services/orchestrator-bridge.ts`
- `apps/nexus/apps/web/src/app/research/page.tsx`
- `apps/nexus/apps/web/src/components/tasks/**`
- `apps/nexus/apps/nexus-api/src/routes/agents.ts`
- `apps/nexus/apps/nexus-api/src/routes/tasks.ts`

**Required work**
1. Ensure `ANTHROPIC_API_KEY` and `TAVILY_API_KEY` or fallback search are read correctly.
2. Make a dashboard research command create and run an `agent_tasks` row of type `research`.
3. Save report as an artifact.
4. Save task events for plan, searches, synthesis, done.
5. Save journal entry and memory candidates.
6. Show report in task detail UI.
7. If keys are missing, show “dependency missing” not fake success.

**Acceptance criteria**
- User can run `research best niche for X` from dashboard.
- Task transitions queued → running → done/failed.
- Output report is visible as artifact.
- Missing keys produce actionable error.

---

## P1-009 — Make Writer Agent real and connected to memory

**Objective**
Turn `write` from a stub into a useful personal writing agent.

**Files to inspect/change**
- `packages/orchestrator/src/handlers/real/write.ts`
- `packages/orchestrator/src/wire.ts`
- `packages/identity/**`
- `packages/memory/**`
- `apps/nexus/apps/web/src/app/content/page.tsx`

**Required work**
1. Ensure real write handler is wired whenever LLM is present.
2. Supported formats:
   - tweet/post
   - thread
   - article
   - newsletter
   - landing page copy
   - product description
3. Inject SOUL, persona, NOW and relevant memories.
4. Save generated content as artifacts.
5. Require approval before publishing or scheduling.
6. Add tests with mock LLM.

**Acceptance criteria**
- `write` task returns structured pieces, not a stub.
- Output is attached as artifact.
- Style uses identity/persona inputs.
- No external publish occurs.

---

## P1-010 — Build the Publisher Draft Queue before auto-publishing

**Objective**
Make publishing useful but safe: draft, preview, approve, schedule. No blind auto-posting.

**Files to inspect/change**
- `packages/agent-publisher/**`
- `apps/nexus/migrations/025_publish_jobs.sql`
- `apps/nexus/apps/nexus-api/src/routes/publisher-queue.ts`
- `apps/nexus/apps/nexus-api/src/routes/publish.ts`
- `apps/nexus/apps/web/src/app/publisher-queue/page.tsx`
- `apps/nexus/apps/web/src/app/publish/page.tsx`

**Required work**
1. Define statuses:
   - draft
   - needs_approval
   - scheduled
   - published
   - failed
   - cancelled
2. Update `publish_jobs` if needed.
3. Make `publish` agent create draft jobs first.
4. Show previews by platform.
5. Approval promotes draft to scheduled/publishable.
6. Add manual export/copy buttons for platforms without API credentials.
7. Only after approval should adapter publish.

**Acceptance criteria**
- A publish task creates draft publish jobs.
- User can approve or reject each job.
- No adapter posts externally without approval.
- Manual export works with no platform API keys.

---

## P1-011 — Enforce budget guard in every agent run

**Objective**
Stop silent cost explosions.

**Files to inspect/change**
- `packages/agent-budget/**`
- `packages/orchestrator/src/base-agent.ts`
- `packages/orchestrator/src/run.ts`
- `packages/orchestrator/src/cost.ts`
- `apps/nexus/migrations/032_budget.sql`
- `apps/nexus/migrations/033_quota.sql`
- `apps/nexus/apps/nexus-api/src/routes/budget.ts`
- `apps/nexus/apps/web/src/app/budget/page.tsx`

**Required work**
1. Before running a task, estimate cost by task type/model.
2. Check daily cap, task cap, model cap.
3. If over cap, create approval request and mark task `needs_me`.
4. After run, record actual usage.
5. Add dashboard budget panel.
6. Add tests for cap exceeded, cap approved, cap under limit.

**Acceptance criteria**
- Expensive tasks require approval.
- Actual model cost is recorded.
- Dashboard shows spend by day, model, task type.

---

## P1-012 — Make proactivity create suggestions, not uncontrolled actions

**Objective**
Use the proactivity engine as a personal Chief of Staff, but keep it safe.

**Files to inspect/change**
- `packages/proactivity/**`
- `apps/nexus/apps/nexus-api/src/services/orchestrator-bridge.ts`
- `apps/nexus/apps/web/src/app/autonome/page.tsx`
- task/approval routes

**Required work**
1. Proactivity scans:
   - stale tasks
   - repeated failures
   - old NOW entries
   - pending publish drafts
   - revenue drops
   - budget spikes
   - unconsolidated journals
2. It creates tasks in `inbox` or `needs_me`, not direct risky actions.
3. It adds explanation as message/event.
4. It respects quiet hours and caps.

**Acceptance criteria**
- Proactivity suggestions appear in dashboard.
- User can approve/convert suggestion to queued task.
- No external action occurs directly from proactivity.

---

## P1-013 — Add artifact system to all real handlers

**Objective**
Stop hiding outputs in JSON blobs. Every useful output becomes an artifact.

**Files to inspect/change**
- artifact schema/routes from P0-004
- `packages/orchestrator/src/base-agent.ts`
- `packages/orchestrator/src/handlers/real/*`
- `packages/agent-research/**`
- `packages/agent-publisher/**`
- `apps/nexus/apps/web/src/components/tasks/*`

**Required work**
1. Add `ArtifactDraft` to handler outcome.
2. BaseAgent persists artifacts.
3. Task detail UI lists artifacts.
4. Supported artifact kinds:
   - research_report
   - markdown_doc
   - social_post
   - image
   - video
   - csv
   - json
   - link
   - code_patch
5. Add R2 support for large files.

**Acceptance criteria**
- Research, write, image, video, publish all save artifacts.
- Artifacts are visible and downloadable/copyable.

---

## P1-014 — Clean up legacy `@repo/*` stack or quarantine it

**Objective**
Stop old Mastra/Supabase/Cosmic code from confusing the new Cloudflare/NEXUS product.

**Files to inspect/change**
- `packages/agents/**`
- `packages/tools/**`
- `packages/workflows/**`
- `packages/core/**`
- `packages/cms/**`
- `packages/generators/**`
- `packages/publishers/**`
- `apps/runner/**`
- `apps/factory/**`
- docs referencing Supabase/Mastra/Cosmic

**Required work**
1. Classify each `@repo/*` package:
   - keep and adapt
   - migrate into `@posteragent/*`
   - archive/deprecate
2. Add `LEGACY.md` in archived packages if kept.
3. Remove legacy packages from default build if they are not part of current product.
4. Migrate useful pieces:
   - Remotion renderer into agent-video/generators path
   - Cosmic site factory if still desired
   - publisher adapters into `@posteragent/agent-publisher`
5. Update docs to say which stack is current.

**Acceptance criteria**
- New agents know not to build on obsolete Supabase paths.
- Root build/test only includes current packages or clearly includes legacy compatibility.
- No current docs tell agents to implement obsolete Phase 9 dashboard work.

---

## P1-015 — Add D1 migration smoke test and schema contract check

**Objective**
Prove migrations create the schema the TypeScript code expects.

**Files to inspect/change**
- `apps/nexus/migrations/*.sql`
- `apps/nexus/apps/nexus-api/src/types/database.ts`
- `packages/types/src/index.ts`
- new `scripts/check-d1-schema.ts`
- CI workflow

**Required work**
1. Apply all migrations to a local SQLite/D1 test DB.
2. Verify required tables exist.
3. Verify required columns exist for:
   - `agent_tasks`
   - `agent_runs`
   - `memory_items`
   - `journal_entries`
   - `publish_jobs`
   - `revenue_events` or equivalent
   - `budget` tables
   - new control-plane tables
4. Verify TypeScript status unions match CHECK constraints.
5. Fail CI on mismatch.

**Acceptance criteria**
- One command catches schema drift before deployment.
- Adding a new task status requires updating both TS and SQL.

---

## P2-016 — Build safe App Builder / Site Builder agents

**Objective**
Make build agents useful without risking the main repo.

**Files to inspect/change**
- `packages/orchestrator/src/handlers/build-app.ts`
- `packages/orchestrator/src/handlers/build-site.ts`
- new real handlers under `packages/orchestrator/src/handlers/real/`
- `apps/nexus/apps/web/src/app/builder/page.tsx`
- artifact/process schemas

**Required work**
1. Builder agents should create specs and file plans first.
2. Use isolated branch/worktree for code changes.
3. Register live processes when dev servers run.
4. Produce diff/patch artifact.
5. Require approval before applying or deploying.

**Acceptance criteria**
- Build task can produce a small app/site scaffold in isolated workspace.
- User sees patch/artifacts.
- No production deployment without approval.

---

## P2-017 — Leads and email agents with approval-first workflow

**Objective**
Make lead scraping and outreach useful, without reckless sending.

**Files to inspect/change**
- `packages/orchestrator/src/handlers/lead-scrape.ts`
- `packages/orchestrator/src/handlers/email-campaign.ts`
- `apps/nexus/migrations/027_leads.sql`
- `apps/nexus/migrations/028_email_campaigns.sql`
- `apps/nexus/apps/nexus-api/src/routes/leads.ts`
- `apps/nexus/apps/nexus-api/src/routes/email.ts`
- `apps/nexus/apps/web/src/app/leads/page.tsx`
- `apps/nexus/apps/web/src/app/email/page.tsx`

**Required work**
1. Lead scraper creates leads with source URL, reason, score, suggested outreach.
2. Email agent drafts sequence only.
3. Sending requires approval per campaign.
4. Add suppression/dedupe.
5. Track replies/status manually first.

**Acceptance criteria**
- Leads appear with source/proof.
- Emails are drafts until approved.
- No duplicate outreach.

---

## P2-018 — Update docs into one current execution source

**Objective**
Stop agents from following obsolete docs.

**Files to inspect/change**
- `README.md`
- `docs/AGENT_TASKS.md`
- `docs/POSTERAGENT_TASKS_V2.md`
- `docs/ADR-001-canonical-dashboard.md`
- `docs/FIXES-2026-06-05.md`
- `docs/PHASE-*.md`
- new `docs/CURRENT_ARCHITECTURE.md`
- new `docs/AI_AGENT_TASKS_CURRENT.md`

**Required work**
1. Add `docs/CURRENT_ARCHITECTURE.md` with:
   - canonical dashboard
   - canonical API
   - canonical task system
   - canonical orchestrator path
   - current package map
2. Add `docs/AI_AGENT_TASKS_CURRENT.md` containing this task pack, updated to repo state after each PR.
3. Mark old docs as historical at top.
4. README should point only to current docs.

**Acceptance criteria**
- New AI agent can read README and know where to work.
- Obsolete docs are clearly labeled.

---

## Recommended execution order

1. P0-001 monorepo boot
2. P0-003 orchestrator path unification
3. P0-004 control-plane schema
4. P0-006 approval policy
5. P0-005 command center UI
6. P0-002 dashboard consolidation
7. P0-007 route/client contract tests
8. P1-008 research end-to-end
9. P1-009 writer end-to-end
10. P1-011 budget guard
11. P1-013 artifacts everywhere
12. P1-010 publisher draft queue
13. P1-012 proactivity suggestions
14. P1-015 migration smoke tests
15. P1-014 legacy quarantine
16. P2 builder/leads/email/docs cleanup

## Definition of done for the whole project spine

The repo is ready for aggressive feature agents only when all of these are true:

- One install path works from clean checkout.
- One dashboard is canonical.
- One `/api/agents/run` path uses the real orchestrator.
- The task board shows real task state.
- Every task has events.
- Every useful output is an artifact.
- Approval requests exist and block risky actions.
- Research and writing work end-to-end.
- Budget guard blocks expensive tasks.
- Publisher starts as draft/approval/manual export, not blind auto-post.
- Docs point to one current architecture.

---

# Code-quality addendum from static audit

These findings are implementation-level blockers that should be merged into the P0/P1 execution queue.

## Additional hard findings

1. **Five `@repo/*` packages point exports at missing `dist/` files on cold checkout.**
   - `packages/cms`
   - `packages/config`
   - `packages/core`
   - `packages/generators`
   - `packages/workflows`
   - Impact: direct imports or direct package execution can fail before build.
   - Fix: either require full build before typecheck/test, or add a preflight that fails with a clear message.

2. **Fourteen default orchestrator handlers are stubs.**
   - `research`, `analyse`, `brand-monitor`, `financial-analysis`, `build-app`, `build-site`, `write`, `generate-video`, `generate-image`, `publish`, `lead-scrape`, `email-campaign`, `autonome-run`, `memory-consolidate`.
   - Real versions exist only for some handlers under `packages/orchestrator/src/handlers/real/`, and only when `wire.ts` is used correctly.
   - This reinforces P0-003: the production route must use the real wired orchestrator, not a shadow stub service.

3. **Seven root dashboard pages are placeholders.**
   - `/leads`, `/builder`, `/content`, `/analyse`, `/research`, `/autonome`, `/revenue` in `apps/dashboard` render module stubs.
   - Since `apps/dashboard` should be migrated/retired, do not waste feature work there unless it is being ported into NEXUS web.

4. **No package has an explicit `vitest.config.ts`.**
   - Affected high-value packages: `agent-analytics`, `agent-autonome`, `agent-budget`, `agent-mindsdb`, `agent-publisher`, `agent-research`, `agent-revenue`, `identity`, `memory`, `orchestrator`, `proactivity`.
   - Impact: test environment/resolution is implicit and can drift.

5. **Ten packages have no tests at all.**
   - `@repo/agents`, `@repo/cms`, `@repo/config`, `@repo/core`, `@repo/generators`, `@posteragent/logger`, `@repo/publishers`, `@repo/tools`, `@posteragent/types`, `@repo/workflows`.

6. **Turbo defines a `lint` task, but packages do not implement `lint`.**
   - Impact: `pnpm lint` can become effectively meaningless.

7. **`@posteragent/types` has no build script.**
   - It exposes source only. Add a build script and `exports` to `dist/` if it is used as a compiled package.

8. **Dashboard has dead dependencies.**
   - `apps/dashboard/package.json` declares `@posteragent/identity`, `@posteragent/memory`, `@posteragent/proactivity`, but only imports `@posteragent/types`.

9. **`apps/dashboard` live brain env vars are undocumented.**
   - `BRAIN_SOURCE`, `NEXUS_API_BASE_URL`, `NEXUS_API_BEARER` are used but not documented in app env example.

10. **A few `as any` casts remain in orchestrator core.**
    - `packages/orchestrator/src/base-agent.ts`
    - `packages/orchestrator/src/run.ts`
    - Fix after product spine is stable. Do not let this distract from P0 integration.

## Additional AI-ready implementation tasks

### QA-001 — Add cold-start build preflight for legacy `@repo/*` dist exports

**Objective**
Prevent confusing `Cannot find module ./dist/*` failures on fresh checkout.

**Files**
- `scripts/check-dist.mjs`
- `package.json`
- `turbo.json`
- `.github/workflows/ci.yml`

**Steps**
1. Create `scripts/check-dist.mjs` that verifies required built files exist:
   - `packages/cms/dist/index.js`
   - `packages/config/dist/index.js`
   - `packages/config/dist/env.js`
   - `packages/config/dist/health.js`
   - `packages/core/dist/index.js`
   - `packages/generators/dist/index.js`
   - `packages/workflows/dist/index.js`
2. Add root script:
   ```json
   "check-dist": "node scripts/check-dist.mjs"
   ```
3. Add Turbo task:
   ```json
   "check-dist": { "cache": false, "dependsOn": ["^build"] }
   ```
4. Add CI guard after build.

**Acceptance criteria**
- Fresh checkout gives a clear error if direct-run commands need a build first.
- CI fails clearly when legacy dist outputs are missing.

### QA-002 — Add explicit Vitest config to all active packages

**Objective**
Make test behavior deterministic.

**Files to create**
- `packages/agent-analytics/vitest.config.ts`
- `packages/agent-autonome/vitest.config.ts`
- `packages/agent-budget/vitest.config.ts`
- `packages/agent-mindsdb/vitest.config.ts`
- `packages/agent-publisher/vitest.config.ts`
- `packages/agent-research/vitest.config.ts`
- `packages/agent-revenue/vitest.config.ts`
- `packages/identity/vitest.config.ts`
- `packages/memory/vitest.config.ts`
- `packages/orchestrator/vitest.config.ts`
- `packages/proactivity/vitest.config.ts`

**Template**
```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    globals: false,
  },
})
```

**Acceptance criteria**
- Every package with a `test` script has an explicit config.
- `pnpm test --filter=@posteragent/*` still passes.

### QA-003 — Add build output and exports to `@posteragent/types`

**Objective**
Make `@posteragent/types` a reliable package for both source and compiled consumers.

**Files**
- `packages/types/package.json`
- `packages/types/tsconfig.json`

**Steps**
1. Add scripts:
   ```json
   "build": "tsc",
   "typecheck": "tsc --noEmit"
   ```
2. Add exports:
   ```json
   "exports": {
     ".": {
       "types": "./dist/index.d.ts",
       "default": "./dist/index.js"
     }
   }
   ```
3. Ensure `outDir` is `dist`.

**Acceptance criteria**
- `cd packages/types && pnpm build` creates `dist/index.js` and `dist/index.d.ts`.
- Consumers still typecheck.

### QA-004 — Add real lint scripts or remove fake lint pipeline

**Objective**
Make `pnpm lint` meaningful.

**Files**
- root `package.json`
- root `eslint.config.mjs`
- all package `package.json` files that should lint
- `turbo.json`

**Steps**
1. Add ESLint flat config for TypeScript.
2. Add package lint scripts:
   ```json
   "lint": "eslint src --ext .ts --max-warnings=0"
   ```
3. Make CI run `pnpm lint`.

**Acceptance criteria**
- `pnpm lint` actually executes package lint scripts.
- Lint fails on real TypeScript rule violations.

### QA-005 — Do not implement features in `apps/dashboard` unless migrating them

**Objective**
Stop wasting work on a dashboard that should be folded into NEXUS web.

**Files**
- `apps/dashboard/README.md` or new `apps/dashboard/DEPRECATED.md`
- `README.md`
- `docs/CURRENT_ARCHITECTURE.md`

**Steps**
1. Add a clear banner to `apps/dashboard` docs:
   ```txt
   Deprecated / migration source only. Canonical dashboard is apps/nexus/apps/web.
   ```
2. Move useful Brain Cockpit components to NEXUS web.
3. Remove dead dashboard dependencies if the app remains archived.

**Acceptance criteria**
- AI agents no longer build new product features in `apps/dashboard` by mistake.

### QA-006 — Wire or explicitly label each orchestrator stub

**Objective**
Stop fake success from stub handlers.

**Files**
- `packages/orchestrator/src/handlers/*.ts`
- `packages/orchestrator/src/handlers/real/*.ts`
- `packages/orchestrator/src/wire.ts`
- `packages/orchestrator/src/registry.ts`
- `apps/nexus/apps/nexus-api/src/services/orchestrator-bridge.ts`

**Steps**
1. For each handler type, classify:
   - real and wired
   - real but not wired
   - stub by design
   - not supported
2. Registry metadata must expose this status.
3. Stub handlers must return `status: failed` or `needs_me` with `stub: true`, not `done`, unless intentionally running demo mode.
4. Wire real handlers already available: `write`, `generate-image`, `generate-video`, `memory-consolidate`, and any implemented research path.

**Acceptance criteria**
- Dashboard cannot show stub work as completed real work.
- `/api/agents/registry` accurately reports implementation status.

---

# Architecture and product subagent addendum

The architecture and product audits confirmed the same core diagnosis: the codebase is strong, but split. There are too many live-looking paths that are not actually the canonical product path.

## Extra architecture findings to treat as blockers

1. **Double nested monorepo is the highest architecture risk.**
   - `apps/nexus` is a full Turborepo inside the root Turborepo.
   - It has its own `package.json`, `pnpm-workspace.yaml`, `turbo.json`, and lockfile.
   - It is stitched to root packages through relative workspace entries.
   - This must be flattened or strictly formalized before aggressive feature work.

2. **Three namespaces confuse ownership.**
   - `@repo/*`: old Node/Mastra/Cosmic/Remotion stack.
   - `@posteragent/*`: new brain/orchestrator/agent package stack.
   - `@nexus/*`: nested Cloudflare/NEXUS stack.
   - Decision: `@posteragent/*` is product domain packages. `@nexus/*` should be infra/UI-only or absorbed. `@repo/*` should be archived/migrated.

3. **Two database philosophies exist.**
   - D1 migrations under `apps/nexus/migrations` are the live/current system.
   - Old Supabase/Core concepts in `packages/core` are stale.
   - Decision: D1 is canonical. Delete/archive stale Supabase schema/docs unless explicitly needed.

4. **Fat controllers need extraction.**
   - `apps/nexus/apps/nexus-api/src/routes/agent.ts` is about 39 KB.
   - `routes/portfolio.ts` is about 29 KB.
   - `routes/products.ts` is about 25 KB.
   - These contain business logic that should move into services for testability.

5. **There are duplicate logger/types/orchestrator concepts.**
   - `@nexus/logger` vs `@posteragent/logger`.
   - `@nexus/types` vs `@posteragent/types`.
   - worker-local orchestrator vs `@posteragent/orchestrator`.
   - Decision: keep `@posteragent/*` as shared domain package layer. Keep `@nexus/*` only if nested workspace survives.

## Extra product findings to treat as blockers

1. **The product has enough backend to become real quickly.**
   - 70+ API routes exist.
   - 34 migrations exist.
   - Brain, budget, revenue, publisher, tasks, agents and autonome pieces exist.
   - Do not rebuild. Connect.

2. **The biggest missing product is the personal command center.**
   - User needs one screen: tasks, approvals, brain, costs, revenue, publish drafts, suggestions.
   - Current NEXUS web has many pages, but not a unified “AI team operating system” surface.

3. **Publishing, revenue and budget are scaffolded but not fully operational.**
   - Publishing adapters/queue exist, but OAuth/manual export/approval workflow must be first-class.
   - Revenue adapters exist, but webhooks/import paths need setup UI and health checks.
   - Budget guard exists, but it needs visible enforcement and live warnings.

4. **Proactivity is present but should start as suggestions.**
   - Do not make autonome fully self-acting yet.
   - It should create `Needs Me` cards first.

5. **Notifications are missing.**
   - Personal agent needs in-UI notifications first.
   - Slack/Discord/Telegram/email can come later.

## Additional architecture/product task packets

### ARCH-001 — Flatten or formalize the nested NEXUS monorepo

**Objective**
Remove the double-monorepo ambiguity so every agent and CI job knows the one correct install/build path.

**Files**
- root `package.json`
- root `pnpm-workspace.yaml`
- root `turbo.json`
- root `pnpm-lock.yaml`
- `apps/nexus/package.json`
- `apps/nexus/pnpm-workspace.yaml`
- `apps/nexus/turbo.json`
- `apps/nexus/pnpm-lock.yaml`
- all nested app/package package.json files

**Preferred plan**
1. Move `apps/nexus/apps/web` to `apps/web` or `apps/nexus-web`.
2. Move `apps/nexus/apps/nexus-api` to `apps/nexus-api`.
3. Move `apps/nexus/apps/nexus-ai` to `apps/nexus-ai`.
4. Move `apps/nexus/packages/logger`, `types`, `prompts` into root `packages/nexus-*` or merge into `@posteragent/logger/types`.
5. Delete nested workspace files after root workspace includes all packages.
6. Regenerate one root lockfile.
7. Update imports, tsconfig paths, turbo filters, wrangler paths, deploy scripts.

**Safer short-term plan**
If flattening is too much for one PR:
1. Keep nested workspace temporarily.
2. Add `docs/WORKSPACE_BOUNDARY.md` explaining exactly which commands run from root vs `apps/nexus`.
3. Add root scripts:
   - `nexus:install`
   - `nexus:typecheck`
   - `nexus:test`
   - `nexus:build`
   - `nexus:dev`
4. CI must run both root and nested workspace checks.
5. Remove the silent `postinstall || true` hack.

**Acceptance criteria**
- One command path from README works on a fresh checkout.
- CI proves both root and NEXUS packages compile.
- No hidden nested install happens silently.

### ARCH-002 — Retire or migrate the old `@repo/*` stack

**Objective**
Remove dead/stale architecture so future AI agents do not build on the wrong foundation.

**Files/directories**
- `packages/agents`
- `packages/workflows`
- `packages/generators`
- `packages/publishers`
- `packages/cms`
- `packages/tools`
- `packages/core`
- `packages/config`
- `apps/factory`
- `apps/runner`
- docs mentioning Mastra/Supabase/Cosmic as canonical

**Steps**
1. Create an inventory table for each package:
   - current imports
   - current scripts using it
   - useful code to migrate
   - dead code to delete
2. Migrate useful parts:
   - Remotion/video generation into `@posteragent/agent-video` or current generator package.
   - publisher adapters into `@posteragent/agent-publisher`.
   - content generation logic into writer/publisher agents.
3. Delete or archive the rest.
4. Remove dead deps/env vars.
5. Update README and current architecture docs.

**Acceptance criteria**
- Default build no longer includes dead packages unless intentionally archived.
- No current doc says Supabase/Mastra/Cosmic stack is the active system.
- Package graph is understandable in one page.

### ARCH-003 — Consolidate shared logger/types packages

**Objective**
Stop duplicate shared packages from drifting.

**Files**
- `packages/logger`
- `packages/types`
- `apps/nexus/packages/logger`
- `apps/nexus/packages/types`
- all imports from `@nexus/logger`, `@nexus/types`, `@posteragent/logger`, `@posteragent/types`

**Steps**
1. Decide canonical package names:
   - `@posteragent/logger`
   - `@posteragent/types`
2. Move any NEXUS-only types into `@posteragent/types` under namespaces/files.
3. Replace imports across NEXUS API/web/AI.
4. Delete nested duplicate packages or turn them into thin re-exports temporarily.
5. Add typecheck test to prevent reintroduction.

**Acceptance criteria**
- One logger package.
- One shared types package.
- No duplicate definitions for AgentTask, AgentRun, Env-like DTOs.

### ARCH-004 — Extract fat route controllers into services

**Objective**
Make the API testable and maintainable by removing inline business logic from large route files.

**Files**
- `apps/nexus/apps/nexus-api/src/routes/agent.ts`
- `apps/nexus/apps/nexus-api/src/routes/portfolio.ts`
- `apps/nexus/apps/nexus-api/src/routes/products.ts`
- new service files under `apps/nexus/apps/nexus-api/src/services/*`

**Steps**
1. For `routes/agent.ts`, extract:
   - product creation workflow
   - cleanup/delete logic
   - asset handling
   - manager/agent command logic
2. For `routes/portfolio.ts`, extract:
   - signal service
   - venture service
   - offer service
   - asset library service
   - allocation/scoreboard service
3. For `routes/products.ts`, extract:
   - product CRUD
   - deliverable generation
   - Gumroad publishing
   - detail serialization
4. Routes should only parse request, call service, return response.
5. Add unit tests for services.

**Acceptance criteria**
- Each route file is under ~300 lines or justified.
- Business logic has direct tests independent of Hono.
- No behavior regression.

### PROD-001 — Build the one-page Personal AI Team Command Center

**Objective**
Turn NEXUS from many feature pages into a personal operating dashboard.

**Files**
- `apps/nexus/apps/web/src/app/page.tsx`
- new `apps/nexus/apps/web/src/app/command-center/page.tsx`
- `apps/nexus/apps/web/src/components/shell/Sidebar.tsx`
- `apps/nexus/apps/web/src/lib/api.ts`
- backend endpoints from P0/P1 tasks

**Required modules**
1. **Today panel**
   - pending approvals
   - running tasks
   - failed tasks
   - budget used today
   - revenue today/week
2. **AI Team Board**
   - Inbox
   - Queued
   - Running
   - Needs Me
   - Done
   - Failed
3. **Command box**
   - natural language command
   - parsed task type preview
   - create task
   - create + run now
4. **Brain snapshot**
   - current NOW
   - recent memories
   - recent journal entries
5. **Publish queue snapshot**
   - drafts waiting approval
   - scheduled posts
6. **Autonome suggestions**
   - suggestions only, approval required

**Acceptance criteria**
- This becomes the default home page.
- User can control the AI team without opening 10 pages.
- Every card links to the detailed page.

### PROD-002 — Add setup/onboarding wizard

**Objective**
Make the personal app usable after clone/deploy without manually editing 30 env vars.

**Files**
- `apps/nexus/apps/web/src/app/settings/keys/page.tsx`
- `apps/nexus/apps/nexus-api/src/routes/keys.ts`
- `.env.example`
- README

**Wizard sections**
1. AI providers:
   - Anthropic
   - OpenAI
   - Cloudflare AI
2. Search/research provider:
   - Tavily/Firecrawl/other
3. Storage:
   - D1
   - KV
   - R2
4. Publishing:
   - manual export first
   - OAuth/API keys later
5. Revenue:
   - Gumroad webhook
   - Amazon CSV import
6. Safety:
   - daily budget cap
   - approval mode
   - allowed origins
   - money machine token

**Acceptance criteria**
- User sees what is configured/missing.
- Missing optional integrations do not break app.
- Missing required integrations produce clear messages.

### PROD-003 — Add notification center

**Objective**
Make the personal agent proactive without requiring the user to watch the dashboard constantly.

**Files**
- new migration for `notifications`
- new `routes/notifications.ts`
- NEXUS web notification bell/component
- proactivity/orchestrator hooks

**Notification types**
- task_failed
- approval_needed
- budget_cap_hit
- publish_ready
- revenue_event
- proactivity_suggestion
- integration_missing

**Acceptance criteria**
- Notifications appear in UI.
- User can mark read/dismiss.
- Proactivity and approvals create notifications.
- External Slack/Telegram can be later, not required for MVP.

### PROD-004 — Make revenue and budget visible on every risky action

**Objective**
Turn budget/revenue from hidden backend modules into product behavior.

**Files**
- `apps/nexus/apps/web/src/components/shell/*`
- `apps/nexus/apps/web/src/app/budget/page.tsx`
- `apps/nexus/apps/web/src/app/revenue/page.tsx`
- `apps/nexus/apps/nexus-api/src/routes/budget.ts`
- `apps/nexus/apps/nexus-api/src/routes/revenue.ts`

**Steps**
1. Add persistent budget indicator in header.
2. Add revenue summary card on command center.
3. Show cost estimate before running expensive task.
4. Show “requires approval” if over cap.
5. Show revenue events and import health.

**Acceptance criteria**
- User can tell if the AI team is spending money.
- User can see if projects are making money.
- Expensive tasks are never invisible.
