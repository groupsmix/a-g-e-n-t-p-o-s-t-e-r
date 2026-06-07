# POSTERAGENT — MASTER TASK BREAKDOWN V2

> **Authoritative tracker** for the V2 plan. Supersedes `docs/AGENT_TASKS.md`
> for new work. Each task has a stable ID (`TASK-xxx`) referenced by PRs.

### Role: Owner / Deep Senior Researcher
### Goal: Transform `a-g-e-n-t-p-o-s-t-e-r` into a single-owner ALL-IN-ONE Money Machine Dashboard
### Research Sources: patchy631/ai-engineering-hub · vellum-ai/vellum-assistant · groupsmix/a-g-e-n-t-p-o-s-t-e-r

---

## CURRENT STATE AUDIT (as of this commit)

```
Stack        : TypeScript 99% · Turborepo · pnpm workspaces · Mastra agents · Remotion
Apps         : nexus/ (NEXUS API+worker+UI) · dashboard/ (in flight, PR #6) · factory/ (CosmicJS)
Packages     : agents · tools · workflows · publishers · generators · CMS · config
               + types · logger · resilience (added in PR #5)
APIs wired   : Anthropic · OpenAI · ElevenLabs · Replicate · FAL.ai
Social wired : TikTok · Instagram · YouTube · Twitter/X · Pinterest · LinkedIn
Infra        : Vercel · Cloudflare Pages · Supabase · D1 · Redis · Mastra storage
Commerce     : Amazon Associates · Gumroad
Architecture : NEXUS-ARCHITECTURE-V4-COMPLETE.md (vision doc)
CI           : Node 24 · pnpm 9.15.0 · GitHub Actions (ci, deploy, daily-run, generate-site, stats-pull)
```

---

## TASK LEGEND

| Symbol | Meaning |
|--------|---------|
| `🔴 P0` | Critical — blocks everything |
| `🟠 P1` | High priority — major feature |
| `🟡 P2` | Medium priority — important improvement |
| `🟢 P3` | Enhancement / nice-to-have |
| `🔵 REF` | Pattern to steal from reference repo |
| `⚡ BUG` | Known or likely bug to fix |
| `✅ DEP` | Task dependency (must complete first) |

---

## PHASE 0 — FOUNDATION & BUG FIXES

### TASK-000 `🔴 P0` — Validate Monorepo Boots End-to-End
- `packages/config/src/env.ts` zod schema
- `scripts/check-env.ts` pre-dev validation
- Root `health.ts` pinging configured services

### TASK-001 `🔴 P0` ⚡ BUG — Fix Package Workspace Resolution
Flatten nested `apps/nexus/**` workspaces; root no longer hoists nexus internals.

### TASK-002 `🔴 P0` — Shared Package Contracts
`packages/types` — `AgentTask`, `AgentResult`, `DashboardModule`, `MemoryItem`.

### TASK-003 `🟠 P1` — Logger & Observability Setup
`packages/logger` with pino + structured `{ ts, level, module, taskId, ... }`.

### TASK-004 `🟠 P1` — Error Recovery & Retry Layer
`packages/resilience/withRetry` — exponential backoff, circuit breaker.

---

## PHASE 1 — DASHBOARD SHELL (apps/dashboard)

### TASK-100 `🔴 P0` — Initialize Dashboard App (Next.js 14 App Router)
shadcn/ui + dark-first + Sidebar + TopBar + CommandPalette + module stubs.

### TASK-101 `🔴 P0` — Real-Time Task Feed (Home Page)
D1 `agent_tasks` schema + SSE stream from `nexus-api` → dashboard.

### TASK-101b `🔴 P0` — Tasks API on nexus-api
`/api/tasks` (list/create/get) + intent dispatch endpoint.

### TASK-102 `🟠 P1` — Command Palette (cmd+K)
`cmdk` UI + intent parser → AgentTaskType.

### TASK-103 `🟠 P1` — Settings Page (API Key Manager)
Encrypted vault (AES-256-GCM) + per-integration ping/test.
**REF** 🔵: vellum-assistant `credential-executor`.

### TASK-104 `🟡 P2` — Dashboard Metrics Bar
Always-visible KPIs: tasks today, AI spend, active agents, revenue, leads.

---

## PHASE 2 — BRAIN LAYER (Memory + Personality + Proactivity)

### TASK-200 `🔴 P0` — Memory Engine Package
`packages/memory` — hybrid retrieval, staleness windows, pgvector.
**REF** 🔵: vellum-assistant `packages/memory/`.

### TASK-201 `🔴 P0` — Agent Identity / Personality Layer
`packages/identity` — `SOUL.md` + journal + NOW scratchpad.
**REF** 🔵: vellum-assistant `SOUL.md`.

### TASK-202 `🟠 P1` — Proactivity Engine (Scheduled Self-Check)
Hourly cron → review tasks + memory → queue/notify.

### TASK-203 `🟡 P2` — Memory Dashboard UI (Brain Page)
Memory explorer, identity panel, journal viewer, NOW scratchpad.

---

## PHASE 3 — NEXUS API & AGENT ORCHESTRATOR

### TASK-300 `🔴 P0` — NEXUS API Server (Hono)
SSE task stream + BullMQ queues + Mastra execution.

### TASK-301 `🔴 P0` — Mastra Agent Registry
`packages/agents/registry` — typed map of all `AgentTaskType` → agent class.

### TASK-302 `🟠 P1` — Base Agent with Memory Injection
`BaseAgent` injects soul + memory + NOW into every system prompt.

---

## PHASE 4 — RESEARCH MODULE

### TASK-400 `🔴 P0` — Deep Research Agent
Planner → Search × N → Synthesis → Citation → Memory pipeline.

### TASK-401 `🟠 P1` — Agentic RAG over Own Data
Ingest CMS + tasks + memory + uploads; corrective RAG with web fallback.

### TASK-402 `🟠 P1` — Brand Monitor Agent
Reddit/X/YT/News/HN mention monitor with sentiment.

### TASK-403 `🟠 P1` — YouTube Trend Analyser
Trending video extraction → content-gap briefs → queue ContentAgent.

### TASK-404 `🟡 P2` — Financial Analysis Agent
Stocks/crypto, P&L, forecasting, affiliate earnings, AI-spend tracking.

### TASK-405 `🟡 P2` — Context Engineering Pipeline
Every agent call passes through retrieve → compress → inject → track.

---

## PHASE 5 — BUILDER MODULE

### TASK-500 `🔴 P0` — App Builder Agent
Spec → Scaffold → Code → Test → Deploy (Vercel).

### TASK-501 `🔴 P0` — Site Factory Agent (CosmicJS)
Bucket creation + 10 seed articles + Next.js deploy + weekly content cron.

### TASK-502 `🟠 P1` — Product Generator (Digital Products)
ebooks · prompt packs · template packs · mini-courses → Gumroad.

### TASK-503 `🟡 P2` — Documentation Writer Agent
Auto-generate README/API/Architecture/CONTRIBUTING for any repo.

---

## PHASE 6 — CONTENT & MEDIA FACTORY

### TASK-600 `🔴 P0` — Content Planner Agent
Weekly calendar from trends + monitor + research.

### TASK-601 `🔴 P0` — Writer Agent (Multi-Format)
Blog · X thread · LinkedIn · IG · TikTok · YT · newsletter · product · cold email.

### TASK-602 `🟠 P1` — Video Factory (Remotion)
TextCarousel · DataViz · ProductShowcase · NewsReel · QuoteCards.

### TASK-603 `🟠 P1` — AI Podcast Generator
Topic → research → script → two-voice ElevenLabs → mix → Spotify/RSS.

### TASK-604 `🟡 P2` — Image Generation Agent
FAL → Replicate → Ideogram with per-brand style profile.

---

## PHASE 7 — PUBLISHER MODULE

### TASK-700 `🔴 P0` — Multi-Platform Publisher Agent
Per-platform adapters (X, IG, TikTok, YT, LinkedIn, Pinterest, Gumroad).

### TASK-701 `🟠 P1` — Publisher Dashboard UI
Calendar grid + queue manager + engagement metrics + failure retry.

### TASK-702 `🟡 P2` — Platform Analytics Aggregator
Daily cron pulls analytics → Supabase → trend analysis.

---

## PHASE 8 — LEADS & MARKETING MODULE

### TASK-800 `🟠 P1` — Lead Scraper Agent
Reddit/X/LinkedIn/YT comments/PH → scored leads → CRM-lite pipeline.

### TASK-801 `🟠 P1` — Email Campaign Agent
Cold sequences + newsletter + personalization + Resend/Postmark + opens/clicks.

### TASK-802 `🟡 P2` — Affiliate & Amazon Automation
Price-drop / new-release monitor → auto review posts with affiliate links.

---

## PHASE 9 — AUTONOMOUS OPERATIONS

### TASK-900 `🔴 P0` — Autonome Mode (Self-Running Dashboard)
Hourly: check goals → review progress → identify gaps → queue ≤5 tasks → notify.

### TASK-901 `🟠 P1` — Revenue Tracker
Gumroad webhook + Amazon CSV + affiliate polling + AdSense → attribution.

### TASK-902 `🟡 P2` — Cost Management & Budget Guard
Per-task estimation, daily limits, breakdown, cheaper-model suggestion.

---

## PHASE 10 — MCP SERVERS & ADVANCED INTEGRATIONS

### TASK-1000 `🟠 P1` — Graphiti MCP (Persistent Memory Graph)
Entities + relations + temporal facts via Zep Graphiti.

### TASK-1001 `🟠 P1` — Firecrawl MCP (Web Intelligence)
crawl_site · extract_structured · monitor_url · search_and_scrape.

### TASK-1002 `🟡 P2` — Voice Interface
Whisper → intent → Claude → ElevenLabs → playback.

### TASK-1003 `🟡 P2` — MindsDB MCP (Unified Data)
SQL-like queries across revenue, posts, leads.

---

## PHASE 11 — QUALITY, TESTING & HARDENING

### TASK-1100 `🟠 P1` — Agent Evaluation Framework
`packages/evals` — per-agent test cases, automated scoring, regression on CI.

### TASK-1101 `🟠 P1` — GitHub Actions CI Pipeline
ci.yml (typecheck/lint/test) + deploy.yml (nexus-api fly.io + dashboard CF Pages).

### TASK-1102 `🟡 P2` — Rate Limit & API Quota Manager
`packages/quota` — per-API usage tracking, pre-flight checks, retry-next-day.

---

## APPENDIX A — STEAL LIST (exact patterns to implement)

| Pattern | Source | Task |
|---------|--------|------|
| Hybrid memory retrieval (dense+sparse+RRF) | vellum-assistant/packages/memory | TASK-200 |
| Memory staleness windows per type | vellum-assistant/packages/memory | TASK-200 |
| SOUL.md identity injection | vellum-assistant/SOUL.md | TASK-201 |
| Per-session journal reflections | vellum-assistant/packages/memory | TASK-201 |
| Hourly proactivity self-check | vellum-assistant/proactivity engine | TASK-202 |
| Credential sandbox (never reach model) | vellum-assistant/credential-executor | TASK-103 |
| Skill manifest system (SKILL.md+TOOLS.json) | vellum-assistant/skills/ | TASK-301 |
| Multi-agent deep researcher | ai-hub/Multi-Agent-deep-researcher | TASK-400 |
| Corrective RAG with web fallback | ai-hub/corrective-rag | TASK-401 |
| Brand monitoring system | ai-hub/brand-monitoring | TASK-402 |
| YouTube trend analysis | ai-hub/Youtube-trend-analysis | TASK-403 |
| Financial analysis agent | ai-hub/financial-analyst-deepseek | TASK-404 |
| Context engineering pipeline | ai-hub/context-engineering-workflow | TASK-405 |
| Content planner flow (CrewAI→Mastra) | ai-hub/content_planner_flow | TASK-600 |
| AI podcast generation pipeline | ai-hub/ai-podcast-generation | TASK-603 |
| Documentation writer flow | ai-hub/documentation-writer-flow | TASK-503 |
| Graphiti persistent memory graph | ai-hub/graphiti-mcp | TASK-1000 |
| Firecrawl agentic web extraction | ai-hub/mcp-agentic-rag-firecrawl | TASK-1001 |
| Voice agent pipeline | ai-hub/mcp-voice-agent | TASK-1002 |
| MindsDB unified data MCP | ai-hub/mindsdb-mcp | TASK-1003 |
| Eval and observability (Opik) | ai-hub/eval-and-observability | TASK-1100 |
| Amazon product analysis | ai-hub/amazon-product-analysis-server | TASK-802 |

---

## APPENDIX B — EXECUTION ORDER (Critical Path)

```
WEEK 1: Foundation                  TASK-000 → 001 → 002 → 003 → 004     [PR #5, in review]
WEEK 2: Dashboard Shell             TASK-100 → 101 → 101b                [PRs #6, #7, in review]
                                    TASK-102 → 103
WEEK 3: Brain Layer                 TASK-200 → 201 → 202
WEEK 4: NEXUS API + Agent Base      TASK-300 → 301 → 302
WEEK 5-6: Research Module           TASK-400 → 401 → 402
WEEK 7-8: Content + Publisher       TASK-600 → 601 → 700 → 701
WEEK 9: Builder                     TASK-500 → 501
WEEK 10: Autonome + Revenue         TASK-900 → 901
WEEK 11-12: Leads + MCP servers     TASK-800 → 801 → 1000 → 1001
ONGOING: Phase 11 hardening (evals, CI, hardening)
```

---

## APPENDIX C — TECH DECISIONS

| Decision | Choice | Why |
|----------|--------|-----|
| Dashboard framework | Next.js 14 App Router | SSR + RSC + ISR, already in stack |
| Agent framework | Mastra | Already wired, TypeScript-native |
| Task queue | BullMQ + Redis | Already have Redis, proven for agent queues |
| Database | Supabase + pgvector / Cloudflare D1 | Supabase = memory + RAG; D1 = nexus task store |
| Embeddings | local ONNX first, OpenAI fallback | vellum pattern — no cost for local |
| Video render | Remotion | Already planned in architecture |
| TTS | ElevenLabs | Already wired |
| Image gen | FAL.ai primary | Already wired, fastest |
| Deployment | Cloudflare Pages (dashboard + nexus/web) + Workers (nexus-api) | Edge-native, cheap |
| MCP client | `@modelcontextprotocol/sdk` | Official SDK |
| State management | Zustand + React Query | Lightweight, SSE-compatible |
| HTTP server | Hono | Edge-compatible, fast, TypeScript |
| Node runtime (CI) | Node 24 | actions/setup-node forced to Node 24 from Sep 2026 |
| pnpm | 9.15.0 (pinned via packageManager) | Reproducible installs |

---

## APPENDIX D — TASK STATUS TRACKER

```
Legend: [ ] = TODO  [~] = In Progress  [P] = In PR / under review  [x] = Done  [!] = Blocked

PHASE 0 — FOUNDATION
[x] TASK-000  Validate monorepo boots                          (PR #5 — merged)
[x] TASK-001  Fix workspace resolution                         (PR #5 — merged)
[x] TASK-002  Shared type contracts                            (PR #5 — merged)
[x] TASK-003  Logger & observability                           (PR #5 — merged)
[x] TASK-004  Error recovery & retry layer                     (PR #5 — merged)

PHASE 1 — DASHBOARD SHELL
[x] TASK-100  Initialize dashboard app                         (PR #6, landed via phase-1 stack)
[x] TASK-101  Real-time task feed (D1 schema)                  (PR #6, landed via phase-1 stack)
[x] TASK-101b Tasks API on nexus-api                           (PR #7, landed via phase-1 stack)
[x] TASK-102  Command palette                                  (PR #9, landed via phase-1 stack)
[x] TASK-103  Settings / API key manager                       (PR #10, landed via phase-1 stack)
[x] TASK-104  Dashboard metrics bar                              (this branch — /api/metrics/summary + live TopBar)

PHASE 2 — BRAIN LAYER
[x] TASK-200  Memory engine package                            (this PR — D1 + FTS5 + Vectorize-ready)
[x] TASK-201  Identity / personality layer                     (this PR — SOUL.md + journal + NOW)
[x] TASK-202  Proactivity engine                               (@posteragent/proactivity — scanners + runner + auto-queue)
[x] TASK-203  Memory dashboard UI                               (apps/dashboard /brain — summary tiles, signals, memory explorer, journal timeline, persona+NOW; pluggable BrainSource)

PHASE 3 — NEXUS API
[x] TASK-300  NEXUS API server (Hono)                          (nexus-api routes wired: /api/agents/{registry,run} + /api/brain/{summary,memories,journal,persona,now,signals} — dashboard nexusApiSource flipped to real HTTP)
[x] TASK-301  Agent registry                                   (@posteragent/orchestrator — typed AgentTaskType → handler map; mirrored in nexus-api/services/agent-registry.ts)
[x] TASK-302  BaseAgent with memory + identity injection       (@posteragent/orchestrator — BaseAgent + runAgentTask)

PHASE 4 — RESEARCH
[x] TASK-400  Deep research agent                              (@posteragent/agent-research — planner/searcher/synthesizer + Anthropic+Tavily adapters; orchestrator wires via registry.override)
[x] TASK-401  Agentic RAG over own data                       (@posteragent/agent-research — MemoryClient lane runs parallel with web; web-only, memory-only, hybrid modes; brain citations tagged kind="memory" and not re-persisted)
[x] TASK-402  Brand monitor agent                              (@posteragent/agent-brand-monitor — Reddit+HN+News+YouTube sources, Anthropic batch sentiment classifier, heuristic fallback, negative-spike/viral/competitor alerts, cron-ready)
[x] TASK-403  YouTube trend analyser                           (@posteragent/agent-trend-finder — fetch → title/hook/thumb/velocity extract → keyword cluster (LLM relabel) → gap-find (few-results / low-coverage / outdated) → LLM brief generation → ContentBrief[] queue-ready for Writer)
[x] TASK-404  Financial analysis agent                         (@posteragent/agent-finance — CoinGecko + Finnhub price sources, Gumroad + Amazon Associates revenue sources, D1 cost ledger, P&L roll-up, 4-week MA+linear forecast, MTD budget guard, price-move/revenue-dip/budget alerts)
[x] TASK-405  Context engineering pipeline                     (@posteragent/context-engine — retrieve → assemble → compress (LLM summariser or truncate) → emit ContextBundle+UsageReport; wired into BaseAgent so every agent call gets memories+past-tasks+signals; observability via recordUsage)

PHASE 5 — BUILDER
[x] TASK-500  App builder agent                                  (this branch — agent-app-builder, spec→deploy)
[x] TASK-501  Site factory agent (CosmicJS)                      (this branch — agent-site-factory)
[x] TASK-502  Product generator                                  (this branch — agent-product-gen)
[x] TASK-503  Documentation writer agent                         (this branch — agent-docs-writer)

PHASE 6 — CONTENT
[x] TASK-600  Content planner agent                              (this branch — agent-content-planner)
[x] TASK-601  Writer agent (multi-format)                        (this branch — agent-writer, 9 formats)
[x] TASK-602  Video factory agent (Remotion)                     (this branch — agent-video-factory)
[x] TASK-603  AI podcast generator                               (this branch — agent-podcast)
[x] TASK-604  Image generation agent                             (this branch — agent-image-gen)

PHASE 7 — PUBLISHER
[ ] TASK-700  Multi-platform publisher agent
[ ] TASK-701  Publisher dashboard UI
[ ] TASK-702  Platform analytics aggregator

PHASE 8 — LEADS
[ ] TASK-800  Lead scraper agent
[ ] TASK-801  Email campaign agent
[ ] TASK-802  Affiliate & Amazon automation

PHASE 9 — AUTONOME
[ ] TASK-900  Autonome mode (self-running)
[ ] TASK-901  Revenue tracker
[ ] TASK-902  Cost management & budget guard

PHASE 10 — MCP SERVERS
[ ] TASK-1000 Graphiti MCP (memory graph)
[ ] TASK-1001 Firecrawl MCP (web intelligence)
[ ] TASK-1002 Voice interface
[ ] TASK-1003 MindsDB MCP (unified data)

PHASE 11 — QUALITY
[ ] TASK-1100 Agent evaluation framework
[~] TASK-1101 GitHub Actions CI pipeline                       (Node 24 bump shipped this PR; deploy.yml hardening pending)
[ ] TASK-1102 Rate limit & quota manager
```

---

*Generated by deep research pass — June 2026*
*Sources: groupsmix/a-g-e-n-t-p-o-s-t-e-r · patchy631/ai-engineering-hub · vellum-ai/vellum-assistant*
