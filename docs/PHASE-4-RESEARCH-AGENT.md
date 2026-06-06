# TASK-400 — Deep Research Agent

The first real handler in the agent fleet. Pure pipeline over injected
LLM + search clients. Producers a citation-marked Markdown report and
returns it through the orchestrator's HandlerOutcome contract.

## Package

```
packages/agent-research/
  src/
    types.ts                LLMClient, SearchClient, ResearchReport, ...
    pipeline/
      planner.ts            query → N sub-questions (JSON-parsed LLM)
      searcher.ts           parallel fan-out, bounded concurrency, per-query timeout
      synthesizer.ts        findings → narrative + inline citations
      researcher.ts         orchestrates planner → search → synthesis
      researcher.test.ts    full-pipeline tests with fixture LLM + search
    adapters/
      llm-anthropic.ts      Anthropic Messages API client
      search-tavily.ts      Tavily research-grade search client
    handler.ts              orchestrator-facing AgentHandler shim
    handler.test.ts         handler contract tests
    index.ts                public barrel
```

## Pipeline

```
                ┌────────────────┐
   Query  ────→ │  Planner (LLM) │ → N sub-questions
                └────────────────┘
                         │
                         ▼
                ┌──────────────────────┐
                │ Searcher (parallel)  │ → Findings[]
                │  bounded concurrency │
                │  per-query timeout   │
                └──────────────────────┘
                         │
                         ▼
                ┌────────────────────┐
                │ Synthesizer (LLM)  │ → Markdown narrative
                │  inline [^id] refs │   + Citation[]
                └────────────────────┘
                         │
                         ▼
                  ResearchReport
                  (data, summary, memories,
                   nextActions, usage, timings)
```

## Provider-agnostic design

The pipeline depends only on two interfaces:

```ts
interface LLMClient {
  name: string
  complete(input: { messages, model?, maxTokens?, temperature?, signal? }): Promise<LLMCompletion>
}

interface SearchClient {
  name: string
  search(input: { query, maxResults?, signal? }): Promise<SearchResult[]>
}
```

Default adapters: **Anthropic Claude** (planner + synthesizer) and
**Tavily** (search). Both adapters use raw `fetch` so they run inside
Cloudflare Workers, Node, and Bun without runtime quirks. New
providers add one file each.

## Wiring (orchestrator boot code)

```ts
import { defaultRegistry, runAgentTask } from '@posteragent/orchestrator'
import { createResearchHandler } from '@posteragent/agent-research'
import {
  createAnthropicLLM,
  createTavilySearch,
} from '@posteragent/agent-research/adapters'

const registry = defaultRegistry()
registry.override(
  createResearchHandler({
    llm: createAnthropicLLM({ apiKey: env.ANTHROPIC_API_KEY }),
    search: createTavilySearch({ apiKey: env.TAVILY_API_KEY }),
    config: { maxSubQuestions: 5, resultsPerQuery: 8 },
  }),
)
```

Why this pattern: the orchestrator stays self-contained and exhaustive
(stub for every task type), and only the boot code knows about provider
deps. Tests can use mock LLM + search without pulling either real API.

## Citation guarantees

The synthesizer prompt forces inline `[^id]` markers tied to real
SearchResult ids. The handler runs a post-pass that drops any marker
pointing at an unknown id, so the citations list is provably grounded
in the findings the search step actually returned.

Each citation is mirrored into the journal as a `fact` memory:

```
type: 'fact'
content: 'Source: <title> — <url>'
tags: ['research', 'citation', '<query slice>']
```

Future agents querying the memory layer for the same topic find the
already-vetted sources instead of re-searching.

## Resilience

- **Planner fallback**: bad JSON from the LLM → use the original query
  as a single sub-question. Pipeline never dies on parse failure.
- **Per-query search isolation**: one failed sub-search returns an
  empty Finding; the synthesizer notes the gap. The whole run still
  completes.
- **Bounded concurrency**: defaults to 4 parallel searches — high
  enough for speed, low enough not to trip Tavily's per-second limits.
- **Per-stage timeouts**: planner 30s, search 20s/query, synth 90s.

## Tests

```
pnpm --filter @posteragent/agent-research test
```

Covers:
- planner JSON parsing (fenced, braced, raw) + garbage fallback + cap
- synthesizer citation extraction (only valid refs survive) + dedupe
- full pipeline end-to-end (mock LLM + search → ResearchReport shape)
- error isolation (one search throws → finding empty, run completes)
- handler shim (orchestrator contract, summary text, memory shape, payload validation)

## What is NOT in this PR

- Cron-driven research runs (Phase 10)
- Multi-pass refinement / planner re-prompting (Phase 5)
- Agentic RAG over own data (TASK-401)
- Tool-use loop within synthesis (Phase 6)
