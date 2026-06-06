# TASK-401 — Agentic RAG over Own Data

Extends `@posteragent/agent-research` with a parallel memory retrieval
lane backed by the user's own brain. Every research run can now cite
both web sources and the user's own memories, and a pure RAG mode
(memory-only, no SearchClient) is supported.

The point: each future research run gets cheaper as the brain grows.
Past research outcomes, journal entries, identity facts, and project
notes become first-class citation sources alongside the open web.

## Package

```
packages/agent-research/
  src/
    types.ts                  + MemoryClient, RetrievedMemory
                              + Finding.memories?, Citation.kind?
                              + ResearchConfig.memoriesPerQuery/...
    pipeline/
      memory-retriever.ts     NEW — parallel fan-out, bounded concurrency,
                              per-query timeout, m-prefixed ids
      memory-retriever.test.ts NEW — 7 unit tests
      researcher.ts           runs search + memory in parallel post-plan
      researcher.test.ts      + memory-only, hybrid, fail-tolerance tests
      synthesizer.ts          renders memory sub-block, cites across both
                              id pools, tags Citation.kind
      planner.ts              prompt is now lane-agnostic
    handler.ts                + memory? in ResearchHandlerDeps
                              + at-least-one-lane guard
                              + summary tags mode (web / memory-only / hybrid)
                              + brain citations NOT round-tripped to memory
    handler.test.ts           + memory-only and hybrid contract tests
    index.ts                  + MemoryClient, RetrievedMemory exports
```

## Pipeline

```
                ┌────────────────┐
   Query  ────→ │  Planner (LLM) │ → N sub-questions
                └────────────────┘
                         │
              ┌──────────┴──────────┐
              ▼                     ▼
     ┌────────────────┐    ┌──────────────────┐
     │ Searcher       │    │ Memory retriever │ ← TASK-401
     │ (parallel)     │    │ (parallel)       │
     │ web ↑ s001…    │    │ brain ↑ m001…    │
     └────────────────┘    └──────────────────┘
              │                     │
              └──────────┬──────────┘
                         ▼
                Findings[] per sub-question
                  (results[] + memories[])
                         │
                         ▼
                ┌────────────────────┐
                │ Synthesizer (LLM)  │ → Markdown narrative
                │  inline [^id] refs │   + Citation[] tagged
                │  across both pools │     kind: 'web' | 'memory'
                └────────────────────┘
                         │
                         ▼
                  ResearchReport
                  + timings.memoryMs
```

## Modes

All three modes share the same `research()` / `createResearchHandler()`
entry points. The mode is implicit in which clients are supplied:

| Mode | Deps | Use case |
|---|---|---|
| **Web-only** | `{ llm, search }` | Classic TASK-400 — open-world deep research |
| **Memory-only** | `{ llm, memory }` | Pure RAG over the brain — "what do I think about X?" |
| **Hybrid** | `{ llm, search, memory }` | Web + brain in parallel, mixed citations |

If neither `search` nor `memory` is provided, the handler factory and
`research()` both throw with a clear error. Callers must opt in to at
least one lane.

## The MemoryClient contract

```ts
export interface RetrievedMemory {
  id: string         // upstream id; re-stamped m001, m002... by the lane
  type: string       // 'fact' | 'event' | 'preference' | 'project' | 'identity'
  content: string
  source: string     // 'journal:2026-06-06', 'agent:research', 'user', ...
  tags?: string[]
  createdAt?: string
  score?: number     // RRF score from memory's internal fusion
}

export interface MemoryClient {
  readonly name: string
  retrieve(input: {
    query: string
    maxResults?: number
    types?: string[]
    signal?: AbortSignal
  }): Promise<RetrievedMemory[]>
}
```

The interface is provider-agnostic. The dashboard / Workers boot code
wraps `@posteragent/memory`'s `MemoryRetriever` (D1 + FTS5 + vector +
recency, RRF-fused internally) and exposes it via this contract.
Other backends (Vectorize, Pinecone, in-memory mock) plug in via the
same shape.

## Why no cross-lane RRF

The memory store already fuses three internal lanes (FTS / vector /
recency) with Reciprocal Rank Fusion (k=60) before returning ranked
results. The web lane's results are also already ranked by the
upstream provider. Forcing a second-level RRF across the two would:

- Conflate "what the world says" with "what the user knows" into a
  single rank list, losing the signal that distinguishes them.
- Discard the upstream lane scores, which are calibrated within their
  own domain.

Instead the synthesizer sees both lanes presented separately per
sub-question and produces inline citations from either pool. Citation
kind (`'web'` vs `'memory'`) is tagged so the dashboard can render
the two pools distinctly (footnotes vs. brain-callouts).

## Id stamping

| Lane | Prefix | Example |
|---|---|---|
| Web (`SearchClient`) | `s` | `s001`, `s002`, ... |
| Memory (`MemoryClient`) | `m` | `m001`, `m002`, ... |

Counters are per-lane and shared across parallel workers within that
lane. The synthesizer cites either prefix via the same `[^id]`
mechanism; the post-hoc citation extractor looks up refs in both id
pools and stamps the resulting `Citation.kind`.

## Why memory citations are NOT re-persisted

`createResearchHandler()` historically returned one `fact` memory per
citation so future agents could cite the same sources without
re-searching. With TASK-401, brain citations now flow through the
same `citations[]` array — but persisting them back into memory would
round-trip the original memory, creating duplicates on every research
run that touches the same brain hit.

The handler filters by `citation.kind` and only persists `web`
citations as memories. The summary line reports both counts:

```
Researched "DeFi 2026" (hybrid): 4 sub-questions,
12 web + 8 brain sources, 5/3 web/brain citations
```

## Failure modes

The memory lane mirrors the searcher's error semantics deliberately:

- **Per-query error** → empty `memories[]` for that sub-question,
  logged via `log.warn`. Other sub-questions unaffected.
- **Timeout** (`memoryTimeoutMs`, default 10s) → same as above.
- **Whole-lane failure** is impossible — the lane wraps every
  retrieve() in try/catch.

Hybrid mode preserves these properties on the web side too; the two
lanes never see each other's errors.

## Config

```ts
export interface ResearchConfig {
  // ... existing fields ...

  /** Max memory hits per sub-question. Default 4. */
  memoriesPerQuery: number
  /** Memory retrieval timeout in ms. Default 10s. */
  memoryTimeoutMs: number
  /** Max concurrent memory retrievals. Default 4. */
  memoryConcurrency: number
}
```

`DEFAULT_CONFIG` includes these so callers can construct configs from
`{ ...DEFAULT_CONFIG, maxSubQuestions: 6 }`.

## Timings

`ResearchReport.timings` gains a `memoryMs` field. Web-only runs
report `memoryMs: 0`. Memory-only runs report `searchMs: 0`. Hybrid
runs report both — and because the two lanes run in parallel after
the plan, the longer of the two dominates total retrieval wall-clock.

## Tests

| File | Coverage |
|---|---|
| `pipeline/memory-retriever.test.ts` | plan-order preservation, m-prefix ids, error swallow, timeout, maxResults wiring, concurrency bound, empty-client |
| `pipeline/researcher.test.ts` (extended) | memory-only mode, hybrid mode, at-least-one-lane guard, memory-lane error tolerance, mixed-citation kind tagging, memory sub-block rendering |
| `handler.test.ts` (extended) | at-least-one-lane guard, memory-only outcome shape, hybrid mode summary, brain-citations-not-re-persisted |

Total: 25 tests, all green under `bun test` (vitest 1.x has a known
worker-thread incompat with bun; CI runs them under Node).

## What's NOT in this PR

- **MemoryClient adapter** wrapping `@posteragent/memory.MemoryRetriever` —
  belongs in the boot code (dashboard / Workers), not the package.
  Will land in TASK-402 or alongside the first real agent task that
  needs it.
- **Dashboard rendering of brain citations** — the data is plumbed
  (`Citation.kind`, `Finding.memories`) but the React component
  that distinguishes web footnotes from brain-callouts is a
  separate UI ticket.
- **Memory-write-back from web research** is already done in the
  handler (one `fact` per web citation); no change there.
- **Cross-lane RRF fusion** — explicitly out of scope per the
  "Why no cross-lane RRF" section above.

## Out of TASK-401 — into TASK-402+

- Brand monitor agent (TASK-402) will reuse the same `MemoryClient`
  contract to ground sentiment analysis in prior user observations.
- Long-horizon agents (TASK-405+) will use memory-only mode for
  "what do I know about X?" pre-checks before web fanout.
