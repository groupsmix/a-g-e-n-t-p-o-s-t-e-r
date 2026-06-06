# Phase 3 — Orchestrator (TASK-300 / 301 / 302)

Pure-library Phase 3 deliverable. Ships `@posteragent/orchestrator`, the glue
between the brain layer (`@posteragent/memory` + `@posteragent/identity`)
and the runtime that actually executes agent tasks.

## What landed

### `packages/orchestrator/`

```
src/
  types.ts          — AgentHandler, AgentContext, HandlerOutcome,
                       OrchestratorDB, AgentLogger, DispatchOptions
  base-agent.ts     — BaseAgent (memory retrieval + identity prompt
                       assembly + journal write + cost ledger)
  registry.ts       — AgentRegistry + defaultRegistry()
  run.ts            — runAgentTask(taskId, deps) — full dispatch loop
  cost.ts           — Token → USD pricing table + estimateCostUsd()
  handlers/
    _stub.ts        — defineStub() helper used by all 14 placeholders
    <14 files>      — one stub per AgentTaskType in @posteragent/types
    index.ts        — barrel
  index.ts          — public surface
  *.test.ts         — registry, base-agent, cost smoke tests
```

### CI

Brain CI job now also typechecks and tests `@posteragent/orchestrator`.

## Public surface

```ts
import {
  BaseAgent,
  AgentRegistry,
  defaultRegistry,
  runAgentTask,
  estimateCostUsd,
  MODEL_PRICING,
} from '@posteragent/orchestrator'

import type {
  AgentHandler,
  AgentContext,
  HandlerOutcome,
  OrchestratorDB,
} from '@posteragent/orchestrator'
```

## How it fits

```
   queued task in D1.agent_tasks
              │
              ▼
   runAgentTask(id, { db, registry, embedder?, identity? })
              │
   ┌──────────┴────────────────────────────────────────┐
   │ 1. Load task row, claim status queued → running    │
   │ 2. Resolve handler = registry.get(task.type)       │
   │ 3. new BaseAgent(handler, deps)                    │
   │ 4. BaseAgent:                                      │
   │      • MemoryRetriever.retrieve(query, k=8)        │
   │      • IdentityLayer.buildSystemPrompt(memories)   │
   │      • handler.run(ctx)                            │
   │      • Journal.append(outcome)                     │
   │      • estimateCostUsd(usage)                      │
   │ 5. Persist final status / result / cost / duration │
   └────────────────────────────────────────────────────┘
              │
              ▼
        AgentResult
```

Every step in BaseAgent that touches the brain layer is wrapped so the
handler never sees a brain-layer error. Retrieval failure = no memories
injected. Prompt assembly failure = soul-only fallback. Journal write
failure = logged warning, AgentResult is still returned untouched.

## What's NOT in this PR

These are TASK-300's runtime concerns and the right place is the nested
`apps/nexus/apps/nexus-api` worker (or a flattened replacement once
TASK-001 is actually done):

- `/api/agents/run` route — POST `{ taskId }` → `runAgentTask(...)`
- `/api/agents/registry` route — GET → `registry.describe()`
- Wiring `defaultRegistry()` + a configured `EmbeddingProvider` into the
  Cloudflare worker startup
- Worker queue consumer that pulls from `agent_tasks` and calls
  `runAgentTask`

Those land in a follow-up PR scoped to the nexus-api worker — the
nested workspace structure makes it noisy to mix with the orchestrator
library work.

## Why stubs for every handler

Each of the 14 `AgentTaskType`s gets a registered handler today, even
the ones whose real implementations land in later phases. Three reasons:

1. **Routing skeleton works end-to-end now.** The command palette,
   dashboard, and worker can dispatch any task type and get a
   deterministic "stub" response instead of a 404.
2. **Compile-time exhaustiveness.** Adding a new type to
   `AgentTaskType` in `@posteragent/types` forces the maintainer to
   register a handler (or explicitly mark it pending) in
   `defaultRegistry()`. Type-driven todo list.
3. **Proactivity engine has something to surface.** TASK-202 will read
   `nextActions` from journal entries; every stub emits
   `Implement <name> in Phase X`, so the proactivity loop has a
   real target list to nudge against.

## Cost ledger

`packages/orchestrator/src/cost.ts` hard-codes the June 2026 pricing
snapshot for Anthropic, OpenAI, and Workers AI. Per the V2 spec, this
table is the single source of truth for cost math — the dashboard,
budget guard (TASK-902), and AI-spend metrics all read from it.

Unknown models default to `UNKNOWN_MODEL_PRICE = $50 in / $100 out per 1M
tokens` so silent usage of unpriced models shows up as a budget spike
rather than zero cost.

## Tests

```bash
pnpm --filter @posteragent/orchestrator test
```

Coverage:
- Registry: register / override / has / get / describe / duplicate detection / exhaustive type union
- BaseAgent: success path, handler throw → failed, systemPromptOverride, timeout signal propagation, getters
- Cost: zero tokens, known model math, unknown fallback, preflight parity, rounding
