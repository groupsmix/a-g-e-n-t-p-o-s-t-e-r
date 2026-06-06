# Phase 2 — Brain Layer

Status: ✅ TASK-200 + TASK-201 (this PR) · ⏳ TASK-202 + TASK-203 pending.

This phase puts a cognitive substrate under every agent. Memory of what
happened. An identity that's stable across runs. A scratchpad for
"what am I focused on right now." Owner-defined behavioural overrides.

It's the "is it me?" surface. Without this, every agent run starts cold.

---

## Architecture (what shipped)

```
┌──────────────────────────────────────────────────────────────┐
│  @posteragent/identity                                       │
│                                                              │
│   IdentityLayer(db)                                          │
│     ├─ soul    (SOUL.md loader, cached)                      │
│     ├─ journal (per-task reflections)                        │
│     ├─ now     (focus scratchpad with TTL)                   │
│     └─ persona (owner overrides per scope)                   │
│                                                              │
│   buildSystemPrompt({ agent, channel, memories, ... })       │
│     → "SOUL + NOW + persona + memories" concatenated         │
│                                                              │
└──────────────────────────────────────────────────────────────┘
                            │
                            │  reads memory snippets from
                            ▼
┌──────────────────────────────────────────────────────────────┐
│  @posteragent/memory                                         │
│                                                              │
│   MemoryStore(db, embedder)        — writes                  │
│   MemoryRetriever(db, embedder)    — reads with RRF          │
│                                                              │
│   EmbeddingProvider:                                         │
│     ├─ NullEmbeddingProvider       (lexical only)            │
│     ├─ OpenAIEmbeddingProvider     (text-embedding-3-small)  │
│     └─ WorkersAIEmbeddingProvider  (bge-small-en-v1.5)       │
│                                                              │
│   extractFromJournal / extractFromTaskResult                 │
│     → pure helpers that turn results into MemoryItems        │
│                                                              │
│   prune(db) → expired + duplicate cleanup                    │
│                                                              │
└──────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│  D1 (migration 024)                                          │
│                                                              │
│   memory_items + memory_items_fts (FTS5 virtual table)       │
│   journal_entries                                            │
│   now_scratchpad                                             │
│   persona_traits                                             │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## TASK-200 · Memory engine

### Schema choices

Lives in `apps/nexus/migrations/024_brain_layer.sql`.

- `memory_items.embedding` is **JSON text**, not a binary BLOB. D1 has no
  vector type; storing as JSON lets us read + score in JS while we wait
  for `@cloudflare/vectorize` to be wired in. The `MemoryStore` API is
  already vector-backend agnostic — when Vectorize lands, only
  `retrieve.ts`'s `vectorLane()` changes.
- `memory_items_fts` is an FTS5 virtual table mirroring `content` + `tags`.
  Triggers keep it in sync. Lexical search uses Porter unicode61 stemming.
- Staleness windows (`expires_at`) are filled in at write time by
  `expiryFor(type)` from `@posteragent/memory/types`. Per the V2 spec:
  identity = never, preference = 6mo, project = 3mo, fact = 2wk, event = 3d.

### Hybrid retrieval

`MemoryRetriever.retrieve(query, opts)` runs two lanes in parallel:

1. **FTS lane** — `MATCH` against `memory_items_fts`, ranked by SQLite's
   built-in rank function.
2. **Vector lane** — embed the query, load up to 1000 candidate rows that
   have embeddings, score cosine similarity, drop anything below 0.2.

Lanes fuse with **Reciprocal Rank Fusion** (k=60). When both lanes return
empty (no embedder + no token match), we fall back to a recency lane.

### Embedding providers

- `NullEmbeddingProvider` — default. Returns `null`. Retrieval falls back
  to FTS + recency. No external dependencies, safe for CI.
- `OpenAIEmbeddingProvider` — `text-embedding-3-small`, requests 384 dims
  via the `dimensions` param.
- `WorkersAIEmbeddingProvider` — `@cf/baai/bge-small-en-v1.5` via the
  `env.AI` binding. Native 384 dims. The preferred provider on
  Cloudflare.

All three implement `EmbeddingProvider.embed(text)` and **never throw**.
Errors degrade to "no vector," not to a broken retrieve.

### Consolidation

Two pure helpers (no DB writes — return `PutOptions[]` for the caller to
feed into `MemoryStore.putMany()`):

- `extractFromJournal(journal)` — turns a `journal_entries` row into one
  `event` (the summary), one `fact` per learning, one `project` per
  follow-up. Each gets `source = task:<id>` and outcome/agent tags.
- `extractFromTaskResult({taskId, agentId}, result)` — mines structured
  fields like `result.memories[]`, `result.facts[]`, `result.preferences[]`,
  `result.projects[]`. Agents that return these shapes get free memory
  persistence.

### Pruning

`prune(db)` runs two passes:

- `pruneExpired` — hard-delete rows past `expires_at`.
- `pruneDuplicates` — normalize content (lowercase + whitespace collapse),
  group by `(type, normalized)`, keep newest, delete the rest.

Idempotent. Designed for the hourly cron in TASK-202.

---

## TASK-201 · Identity / personality layer

### SOUL.md

Canonical copy at `packages/identity/data/SOUL.md`. Three loader
strategies:

- `FsSoulLoader(path)` — for Node-side use (CLI, tests, server).
- `KvSoulLoader(kv, key?)` — for Workers. Deploy step uploads the file
  to a KV namespace; Workers read at boot.
- `StaticSoulLoader(text)` — for tests and ephemeral configs.

Wrap any of them in `CachedSoulLoader` to memoise. There's also a
`DEFAULT_SOUL` constant as a last-resort fallback so agents stay
functional even when neither FS nor KV is available.

### `assembleSystemPrompt(parts)`

The one-stop call that produces the system message:

```
SOUL.md text

# Current focus
<NOW scratchpad>

# Persona traits
- trait 1
- trait 2

# Relevant context
- memory 1
- memory 2
```

Empty blocks are omitted. Order is stable.

### Journal

`journal_entries` is the raw narration log — every agent run ends with
one. The `Journal` class wraps insert, recent, unconsolidated, and
mark-consolidated operations. Used by:

- TASK-302 `BaseAgent.afterRun()` to record what just happened
- TASK-202 proactivity engine to find unfinished work
- TASK-203 Brain dashboard to show "what NEXUS did today"

### NOW scratchpad

`now_scratchpad` is single-row-per-scope, TTL-based. Defaults:

- `global` scope: 24h TTL
- Anything else (`agent:*`, `session:*`): 4h TTL

`NowScratchpad.get()` silently treats expired rows as absent, so
consumers don't have to check timestamps.

### Persona traits

`persona_traits` is owner-defined behavioural overrides. Scopes:

- `global` — applies everywhere
- `agent:<name>` — overrides for a specific agent
- `channel:<platform>` — for publisher work on that platform

`PersonaStore.resolve({ agent, channel })` returns the effective trait
list in prompt-insertion order (global → agent → channel), truncated to
`maxTraits` (default 12) so the system prompt stays bounded.

### `IdentityLayer` convenience wrapper

```ts
import { IdentityLayer } from '@posteragent/identity'

const id = new IdentityLayer(env.DB)

const systemPrompt = await id.buildSystemPrompt({
  agent: 'research',
  memories: relevantMemoryStrings,
})
```

That's it. Everything else is exposed as instance fields (`id.journal`,
`id.now`, `id.persona`, `id.soul`) if you want to bypass the wrapper.

---

## What's not in this PR

- **Routes on `nexus-api`** — `/memory/*`, `/journal/*`, `/now`, and
  `/persona/*` are the next PR. The packages are wired and ready; the
  Hono handlers are 30 minutes of trivial plumbing on top.
- **Vectorize integration** — D1 + JSON vectors is the launch path. A
  follow-up PR will add a `VectorizeIndex` binding and swap the vector
  lane.
- **Brain dashboard UI** (TASK-203) — separate PR. The data plane is
  ready; the React page is what's missing.
- **Proactivity engine** (TASK-202) — separate PR. Uses
  `Journal.unconsolidated()` + `MemoryStore.list()` to find unfinished
  work, then queues new `agent_tasks`.

---

## Testing

`pnpm --filter @posteragent/memory test` and
`pnpm --filter @posteragent/identity test` cover:

- Staleness window math (identity = null, preference = 6mo, event = 3d)
- Cosine similarity edge cases (orthogonal, zero, length mismatch)
- Journal → memory extraction (summary/learnings/follow-ups, empty drop)
- Structured result mining (memories/facts/preferences/projects)
- SOUL.md fallback (em-dash absence, "You are NEXUS" sentence)
- Cached loader (one call, refetch after invalidate)
- Prompt block ordering (soul → now → persona → memories)

Integration tests against a real D1 binding land alongside the routes PR.
