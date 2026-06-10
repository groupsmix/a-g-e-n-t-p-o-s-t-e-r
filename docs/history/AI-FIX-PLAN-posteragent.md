# POSTERAGENT / NEXUS - AI Fix & Upgrade Plan (End-to-End)

> **Audience:** an AI coding agent (Devin / Claude Code / Codex) working inside
> `github.com/groupsmix/a-g-e-n-t-p-o-s-t-e-r`.
> **Scope:** fix the AI layer, then upgrade it with patterns taken from 4 reference repos.
> **Date:** 2026-06-09. Verify anything time-sensitive (model names, API endpoints) against provider docs before hardcoding.

---

## 0. GROUND TRUTH (read before touching anything)

Architecture (do NOT change this):

| Surface | Stack | Location |
|---|---|---|
| Dashboard UI | Next.js 14 on Cloudflare Pages | `apps/nexus/apps/web` (`@nexus/web`) |
| API | CF Worker (Hono) + D1 + KV + R2 | `apps/nexus/apps/nexus-api` |
| **AI worker** | CF Worker + Workers AI + failover engine | `apps/nexus/apps/nexus-ai` |
| DB migrations | Cloudflare D1 | `apps/nexus/apps/nexus-api/migrations/` |
| Legacy cron stack | `@repo/*` + GitHub Actions | `apps/factory`, `apps/runner`, `packages/*` |

Hard rules:

1. **Two stacks coexist on purpose.** Do not delete `@repo/*`, `apps/factory`, `apps/runner`, or their GitHub Actions. See `README.md` and `docs/ADR-001-canonical-dashboard.md`.
2. **No Supabase, no Vercel, single user.** See `docs/FIXES-2026-06-05.md`.
3. `apps/nexus/` is its **own pnpm workspace**. Run `cd apps/nexus && pnpm install` if module resolution breaks.
4. **License warning:** `777genius/agent-teams-ai` is **AGPL-3.0**. Re-implement ideas from scratch; never copy code, prompts, or files from it. `ui-ux-pro-max-skill`, `odysseus`, `ai-engineering-hub` are MIT: code/data may be vendored WITH attribution + license file copies.
5. One task = one PR where possible. Keep `pnpm typecheck` and existing vitest suites green in every PR.

Verification commands (run from repo root unless noted):

```bash
pnpm install && pnpm build
cd apps/nexus && pnpm install
pnpm --filter @nexus/web typecheck
pnpm --filter nexus-api test        # vitest
pnpm --filter nexus-api typecheck
pnpm --filter nexus-ai typecheck    # add test script in T0.2 if missing
node apps/nexus/scripts/check-schema-drift.mjs
```

Key AI-layer files:

```
apps/nexus/apps/nexus-ai/src/registry.ts          # AI_REGISTRY: taskType -> ranked model chain
apps/nexus/apps/nexus-ai/src/failover.ts          # 809 lines: failover loop, provider callers, rate-limit KV cache, spend cap
apps/nexus/apps/nexus-ai/src/offline.ts           # deterministic template fallback (slop source!)
apps/nexus/apps/nexus-ai/src/content-quality.ts
apps/nexus/apps/nexus-ai/src/image.ts             # fal.ai flux + fallbacks
apps/nexus/apps/nexus-ai/src/index.ts             # Hono endpoints: /task /image /registry /spend /cap /providers /secrets
apps/nexus/apps/nexus-api/src/services/shared/call-ai.ts    # shared caller (service binding) - retry bug here
apps/nexus/apps/nexus-api/src/services/shared/json-parse.ts # safeJson repair
apps/nexus/apps/nexus-api/src/services/quality-gate.ts      # slop/placeholder detection
apps/nexus/apps/nexus-api/src/services/publish-gate.ts
apps/nexus/apps/nexus-api/src/services/workflow-engine.ts
apps/nexus/packages/prompts/src/*                 # master prompt, personas, roles, schemas
apps/nexus/migrations/022_agent_runs_ledger.sql   # existing run ledger
apps/nexus/migrations/024_brain_layer.sql
```

---

## PHASE 0 - BASELINE & SAFETY NET (P0, do first)

### T0.1 Reproduce green baseline
- Run all verification commands above. Record results in the PR description.
- If anything is already red on `main`, fix ONLY what is needed to get green; do not refactor.
- **Accept:** all typechecks pass, existing tests pass, build succeeds.

### T0.2 AI smoke test + test harness for nexus-ai
- Add `vitest` to `apps/nexus/apps/nexus-ai` (mirror config from `nexus-api`).
- Add `src/failover.test.ts` covering, with mocked `fetch`:
  - failover advances to next model on 500,
  - 429 writes `ai_status:<id>` to KV and is skipped while `reset_at` is in the future,
  - daily cap skips paid models but not free ones,
  - offline fallback fires only when every provider fails.
- Add `scripts/smoke-ai.mjs` (repo root or nexus root): calls deployed `/health`, `/registry`, and one cheap `/task` round-trip; prints model_used + latency. Used manually after deploys.
- **Accept:** `pnpm --filter nexus-ai test` green; smoke script exits 0 against a deployed worker.

---

## PHASE 1 - FIX THE AI CORE (P0, this is "fix my AI")

### T1.1 Registry truth pass: split search from LLMs, fix metadata
**Problem:** `AI_REGISTRY` mixes web-search providers (Tavily, Exa, SerpAPI, DataForSEO) with LLMs; DataForSEO is mislabeled `provider: 'serpapi'`; display names do not match `apiModelName` (e.g. "Qwen 3.5 Max" -> `Qwen/Qwen2.5-72B-Instruct`); `isFree` flags are wrong (DeepSeek API is paid-per-token, not free); model IDs are from 2024-2025 and may be deprecated.

Steps:
1. Create `src/search-registry.ts` with its own type (`SearchProviderEntry`) and move Tavily / Exa / SerpAPI / DataForSEO entries there. Keep ranked order.
2. In `failover.ts`, route `research_market`, `research_keywords`, `research_competitors` through a new `runSearchWithFailover()` that uses the search registry first, then falls back to the LLM chain (current behavior preserved, but typed and explicit).
3. Audit every remaining `AIRegistryEntry`:
   - `provider` must match the actual API caller used in `failover.ts`.
   - `name` must match `apiModelName` truthfully (no aspirational names).
   - `isFree` true ONLY for genuinely $0 paths (Workers AI, free-tier-forever endpoints). Paid-but-cheap = `isFree: false` with real `costPer1kIn/costPer1kOut` fields (add them).
   - For each provider, fetch the CURRENT model list from its docs / `GET /models` endpoint and replace deprecated IDs. Do not guess. Record the verified list + date in a comment block at the top of `registry.ts`.
4. Add per-entry `maxOutputTokens` and `supportsJsonMode: boolean`.
- **Accept:** typecheck green; `/registry` endpoint returns the new shape; unit test asserts no entry has `provider` mismatched with its caller; no search provider remains in `AI_REGISTRY`.

### T1.2 Honor real rate-limit signals (steal: agent-teams-ai "auto-resume after rate limit", reimplemented)
**Problem:** any 429 = hardcoded 1-hour sleep. Providers send `Retry-After` / `x-ratelimit-reset-*` headers; ignoring them wastes capacity or hammers too early.

Steps:
1. In each provider caller in `failover.ts`, on 429/5xx capture `Retry-After`, `x-ratelimit-reset-requests`, `x-ratelimit-reset-tokens`, Anthropic `anthropic-ratelimit-*` headers, Gemini `RetryInfo`.
2. Compute `reset_at` from headers when present; only fall back to a default (15 min, not 1 h) when absent. Clamp to [30s, 6h].
3. Key rate-limit status by **provider+key**, not only model id, when the limit is account-wide (`ai_status:provider:<provider>`); keep per-model for model-specific limits.
4. Store `reset_at` precisely; expose it in `/registry` (`cooldownUntil`) so the dashboard can show "model sleeping until 14:32".
5. Add `GET /wake-check`: returns providers whose cooldown has expired. Wire the existing nexus-api cron to call it and re-dispatch any queued jobs that were parked on rate limits (auto-resume).
- **Accept:** unit tests for header parsing (one per provider format); cooldown values visible in `/registry`; cron log line shows wake-check execution.

### T1.3 Fix `call-ai.ts` retry semantics
**Problem:** `callAI` retries the ENTIRE failover chain up to 3 times. The worker already does failover internally, so failures multiply: worst case = 3 full passes through every provider = stacked latency + repeated paid calls + duplicate spend.

Steps:
1. Default `retries: 1`. Retry ONLY on transport-level failures (service binding fetch threw / network) and 5xx from the worker itself, never on a clean `{error: 'All AI models failed'}` response (the chain already exhausted options; retrying is pure waste).
2. Make the deadline budget explicit: total budget = `timeoutMs` passed to the worker + fixed 10s grace, once. Remove per-attempt deadline stacking.
3. Return `models_tried` and `cost_usd` to callers; log them at call sites that swallow metadata (`callAISimple` keeps string API but logs internally).
4. Grep all call sites (`workflow-engine`, `deliverable`, `agent`, `manager`, `autopilot`, `schedules`, `marketing`) and remove any caller-side retry loops wrapping `callAI` (double-wrapping).
- **Accept:** unit test proves no re-entry on a 500 JSON error body; grep shows no nested retry loops; typecheck green.

### T1.4 JSON discipline end-to-end
**Problem:** `outputFormat: 'json'` is requested but not enforced; some providers support `response_format`, some don't; `safeJson` repairs downstream but callers get untyped blobs.

Steps:
1. In provider callers, when `outputFormat === 'json'` and `supportsJsonMode` (from T1.1), send the provider's native JSON mode (`response_format: {type:'json_object'}` for OpenAI-compatible, `output_config`/equivalent for Gemini per current docs, tool-use trick or prefill for Anthropic per current docs).
2. In `runWithFailover`, validate JSON output: parse with the same logic as `safeJson`. If unparseable, ONE repair attempt: re-ask the cheapest configured model "Return ONLY valid JSON equivalent of: <output>". If still bad -> treat as model failure -> next model in chain.
3. In `nexus-api`, add `callAIJson<T>(env, prompt, zodSchema, opts)` in `shared/call-ai.ts`: calls `callAI`, parses with `safeJson`, validates with zod (add zod to nexus-api deps if absent; check `packages/prompts/src/schemas.ts` first - schemas may already exist there). On schema failure: one re-prompt with the zod error message embedded, then typed failure.
4. Migrate the highest-risk call sites to `callAIJson`: `workflow-engine.ts`, `factory/*-factory.ts`, `lead-scanner.ts`, `product-scorer.ts`. Leave others for later.
- **Accept:** unit tests: valid JSON passes, fenced JSON passes, garbage triggers exactly one repair then typed error. Migrated call sites typecheck with inferred types.

### T1.5 Cage the offline generator (root cause of the T4 slop pain)
**Problem:** when every provider fails, `offline.ts` emits template output that flows into the pipeline looking like AI output; the owner kept finding `[INSERT NICHE]`-grade placeholders in the review queue (see `quality-gate.ts` comments).

Steps:
1. `FailoverResult` gains `source: 'model' | 'universal' | 'offline'`. Set it everywhere (`runWithFailover`, `tryUniversalProviders`, offline fallback). Propagate through `/task` response and `AIRunTaskResponse` type in `@nexus/types`.
2. In `callAI`, when `source === 'offline'`: log loudly. Add `allowOffline` option (default `false`). When false, treat offline as failure (throw typed `AIUnavailableError`). Only explicitly-opted callers (e.g. non-customer-facing internal summaries) pass `allowOffline: true`.
3. In `workflow-engine` and factories: on `AIUnavailableError`, park the job in a `waiting_ai` state instead of producing a product. The T1.2 wake-check cron resumes parked jobs.
4. Run `detectSlop` (from `quality-gate.ts`) on EVERY generation result inside the workflow engine, not only at review time. Slop -> regenerate once with the next model in chain -> still slop -> park + flag.
- **Accept:** integration test: with zero configured providers, creating a product parks the workflow in `waiting_ai` and review queue stays empty. No offline content reaches `products` without `source='offline'` recorded.

### T1.6 Error taxonomy + structured attempt logging
Steps:
1. Add `src/errors.ts` in nexus-ai: `RateLimitError`, `QuotaError`, `AuthError`, `TimeoutError`, `BadOutputError`, `AllModelsFailedError` (carries `attempts: AttemptLog[]`).
2. Each attempt logs `{model, provider, latencyMs, status, errorClass, tokensIn, tokensOut, costUsd}`. Return `attempts` inside `/task` error responses (and success responses as `models_tried` detail).
3. Replace `catch (error: any)` string-matching (`errorMsg.includes('rate_limit')`) with status-code-first classification per provider.
- **Accept:** unit tests per error class; `/task` failure body contains structured `attempts`.

### T1.7 Provider endpoint refresh
**Problem:** several callers target old or deprecated endpoints.

Steps (verify EACH against current official docs before changing; record doc URL + date in code comment):
1. Gemini: caller uses `https://generativelanguage.googleapis.com/v1/models/...:generateContent?key=` - migrate to current recommended endpoint/auth header and current model IDs.
2. HuggingFace: `api-inference.huggingface.co` was deprecated in favor of the Inference Providers router. Either migrate or DELETE the HF path if redundant (Workers AI already covers free inference). Prefer deletion: less surface.
3. fal.ai image queue (`queue.fal.run/fal-ai/flux-pro`): verify queue + polling contract and model slug are current in `image.ts`.
4. Workers AI model slugs in `registry.ts`/`failover.ts`/`image.ts`: list current slugs via `npx wrangler ai models` and replace removed ones.
5. Moonshot/Kimi, SiliconFlow, Fireworks, Groq, DeepSeek, Mistral, Perplexity: confirm base URLs + flagship model IDs current; SiliconFlow has distinct .cn vs international endpoints - make base URL configurable via KV `provider_base:<provider>` with sane default.
- **Accept:** smoke script (T0.2) succeeds against deployed worker for at least: one Workers AI model, one OpenAI-compatible provider with a configured key. Dead HF path removed or migrated.

### T1.8 Cost accounting accuracy
Steps:
1. Add `pricing.ts`: per-model `{inPer1k, outPer1k}` table (verified against provider pricing pages, dated comment). Compute `cost_usd` from real usage fields in each provider response instead of estimates where currently estimated.
2. Track free-model token usage too (counts toward Workers AI daily free allocation; expose in `/spend` as `free_tokens_today`).
3. `/spend` response gains per-provider breakdown for today (KV daily hash: `spend:<date>:<provider>`).
- **Accept:** unit test computes known cost from a fixture usage block; `/spend` shows breakdown.

---

## PHASE 2 - OBSERVABILITY & EVALS (P1) [steal: ai-engineering-hub eval/observability pattern, odysseus Compare]

### T2.1 AI call ledger in D1
1. New migration `035_ai_call_ledger.sql`: table `ai_calls(id, ts, task_type, model_used, source, models_tried_json, attempts_json, tokens_in, tokens_out, cost_usd, latency_ms, caller, workflow_id NULL, ok)`.
2. nexus-api logs every `callAI` result (success AND failure) fire-and-forget (`ctx.waitUntil`-style; Hono executionCtx) so latency is unaffected.
3. Retention: cron deletes rows older than 60 days.
- **Accept:** one row per call in local D1 test; failure rows carry attempts.

### T2.2 Wire the observability page
1. Extend `routes/observability.ts` with aggregates from `ai_calls`: success rate per model (7d), average fallback depth per task type, p50/p95 latency, spend per task type per day, offline-source count (should be 0 after T1.5).
2. Surface on `apps/nexus/apps/web/src/app/observability/page.tsx`: one table + one trend; reuse existing card components. No new design system.
- **Accept:** page renders live aggregates; typecheck green.

### T2.3 Golden-prompt eval harness (nightly)
1. `apps/nexus/apps/nexus-api/src/services/evals.ts` + `eval_prompts` seed table: 3-5 golden prompts per task type with rubric (JSON: criteria + weights).
2. Nightly cron: run each golden prompt through `/task`, judge output with a strong configured model (judge prompt in `packages/prompts`), store scores in `eval_runs` table (same migration as T2.1 or `036`).
3. Regression alert: if a task type's mean score drops >20% vs trailing 7-day mean, write a `signals` row (existing signals system) so it lands in the digest.
- **Accept:** manual trigger endpoint `/api/evals/run` works in dev; scores persisted; synthetic regression produces a signal.

### T2.4 Blind model compare (reimplement odysseus "Compare" idea, MIT but rewrite to fit CF)
1. Endpoint `/api/compare`: `{prompt, taskType, models: [id, id]}` -> runs both -> stores pair + outputs with hidden labels.
2. Minimal UI under `manager/ai`: show two anonymized outputs, owner clicks the better one; store preference in `model_prefs` table.
3. After N≥10 prefs for a pair, emit a suggestion signal: "swap rank of X and Y for taskType Z". Do NOT auto-change the registry; owner applies manually.
- **Accept:** full loop works locally; rankings never change without human action.

---

## PHASE 3 - QUALITY SYSTEM (P1) [steal: ui-ux-pro-max-skill data (MIT, vendor it), agent-teams peer-review pattern (reimplement)]

### T3.1 Vendor design intelligence into the site factory
1. `packages/design-intelligence/`: vendor the MIT-licensed CSV/JSON data from `nextlevelbuilder/ui-ux-pro-max-skill` (styles, color palettes, font pairings, UX guidelines, reasoning rules). Include their LICENSE file + attribution README. Strip Python; write a small TS lookup: `recommendDesignSystem(nicheOrProductType): DesignSystem` (match by keyword like their reasoning rules; BM25 not required - simple scored keyword match is fine for 161 rules).
2. Use it in `apps/factory/src/site-generator.ts` AND `apps/nexus` product-page generation: generated sites/listings get per-niche style, palette, font pairing, and the anti-pattern list injected into generation prompts ("AVOID: ...").
- **Accept:** generating two different niches yields two different palettes/fonts in output artifacts; attribution present.

### T3.2 Pre-delivery checklist in publish-gate
1. Port the CONCEPT of their pre-delivery checklist into `publish-gate.ts` as automated checks where feasible for generated HTML: no emoji-as-icon, text contrast >= 4.5:1 (compute from palette), focus states present in CSS, responsive meta + breakpoints present, `prefers-reduced-motion` respected, no raw placeholder tokens (reuse `detectSlop`).
2. Failures block publish with specific issue strings (existing QualityResult shape).
- **Accept:** unit tests with one failing fixture per check.

### T3.3 AI peer-review pass (agent-teams pattern, reimplemented from scratch)
1. New service `services/peer-review.ts`: after generation, a DIFFERENT provider (force `model_used`'s provider excluded via new `/task` option `excludeProviders: string[]`) reviews the artifact against a rubric (clarity, slop, factuality, niche-fit, CTA quality), returns scores + must-fix list (zod-validated via T1.4).
2. Workflow engine: score < threshold -> one regeneration with reviewer feedback appended; still failing -> park for human with both outputs shown.
3. Store review JSON on the product row (new nullable column, migration `037_peer_review.sql`).
- **Accept:** workflow trace shows generate -> review -> (regen) -> review; review JSON persisted; `excludeProviders` honored (unit test).

### T3.4 Expand anti-slop detection
1. Extend `quality-gate.ts` with an AI-tell list: banned phrases ("delve", "in today's fast-paced world", "unlock the power", "game-changer", etc. - keep the list in D1-seeded config, editable from dashboard prompts manager), em-dash overuse ratio, sentence-start repetition, all-caps ratio.
2. Run inside generation loop (T1.5 step 4 hook), not just review.
- **Accept:** fixtures with each tell get flagged; list editable via existing prompts/settings UI.

---

## PHASE 4 - RESEARCH ENGINE (P2) [steal: odysseus Deep Research flow shape, ai-engineering-hub corrective-RAG fallback]

### T4.1 Typed search service
1. nexus-ai `src/search.ts`: adapters for Tavily/Exa/SerpAPI/DataForSEO (moved in T1.1) returning a normalized `SearchResult[] {title, url, snippet, publishedAt?, source}`.
- **Accept:** unit tests with fixture responses per adapter.

### T4.2 Deep research workflow
1. New workflow in nexus-api (CF Workflows or existing workflow-engine pattern): `plan (cheap LLM: 3-6 sub-queries) -> search each (T4.1, 2 providers) -> dedupe URLs -> fetch+extract top N (use existing browser service if present, else fetch+readability) -> synthesize with citations (strong model, JSON: {findings[], sources[], confidence}) -> store as research report row + render in /research page`.
2. Wire `research_market` task type used by trends/opportunities to THIS workflow instead of single-shot prompts.
- **Accept:** one end-to-end run stores a cited report; every finding has >=1 source URL.

### T4.3 Corrective fallback
1. If `confidence < 0.6` or `sources < 3`: broaden queries (LLM rewrites), try the next search provider, one more pass. Hard cap 2 rounds. Log rounds to the ledger.
- **Accept:** forced low-confidence fixture triggers exactly one corrective round.

---

## PHASE 5 - MEMORY / BRAIN RAG (P2) [steal: odysseus hybrid retrieval idea; repo already has docs/PHASE-4-RAG-OVER-MEMORY.md - follow it where compatible]

### T5.1 Vector index over brain + winners
1. Add Cloudflare Vectorize binding to nexus-api wrangler.toml; embeddings via Workers AI embedding model (current slug via `wrangler ai models`).
2. Index: brain memories (migration 024 tables), winner patterns, rejection reasons. Backfill script + on-write indexing.
- **Accept:** `vectorize query` returns relevant memory for a test phrase.

### T5.2 Hybrid retrieval into prompts
1. `services/brain-retrieval.ts`: vector top-k + D1 LIKE/FTS keyword match, merge + dedupe, token-budgeted (max ~1200 tokens).
2. `packages/prompts/src/builder.ts`: optional `context` slot filled by retrieval for generation tasks ("What worked before in this niche: ...", "Past rejections to avoid: ...").
- **Accept:** generation prompt for a niche with history contains retrieved lines (snapshot test); budget never exceeded.

### T5.3 Close the learning loop
1. On approve/reject in review routes: write a structured memory ("niche X: titles with numbers approved 3x", "rejected: generic intro") and index it (T5.1). The existing `learning` service may partially do this - extend, don't duplicate.
- **Accept:** after a scripted approve+reject sequence, next generation prompt for same niche contains both lessons.

---

## PHASE 6 - ORCHESTRATION UX (P2) [steal: agent-teams-ai patterns, ALL reimplemented]

### T6.1 Task board + blockers + auto-resume
1. Extend `agent_tasks` (migration 023) with `status` enum incl. `waiting_ai`, `blocked_by` nullable FK. Workflow engine sets `waiting_ai` per T1.5; wake-check cron (T1.2) flips them back and re-dispatches.
2. `/autonome` or `/team` page: kanban-style column view of agent_tasks by status (reuse existing card components; no new deps).
- **Accept:** parked task visibly moves columns after provider cooldown expires (manual KV edit to simulate).

### T6.2 Autonomy levels
1. Setting `autonomy: 'full' | 'approve_publish' | 'approve_each_step'` in settings KV; workflow engine consults it at step boundaries; `approve_each_step` writes a pending-approval row and pauses (resume endpoint exists? if not: `/api/workflow/:id/approve-step`).
- **Accept:** each mode behaves as named in an integration test.

### T6.3 Per-task execution log view
1. Task detail view joins `ai_calls` ledger (T2.1) by workflow_id: timeline of model calls, fallbacks, costs, peer-review scores.
- **Accept:** page shows full trace for one completed product.

---

## PHASE 7 - HYGIENE (P2)

### T7.1 Docs refresh
- Update `NEXUS-ARCHITECTURE-V4-COMPLETE.md` AI sections + `README.md` to match post-Phase-1 reality (registry split, source flag, ledger). Add `docs/AI-LAYER.md` as the canonical AI doc.

### T7.2 CI
- Add nexus-ai vitest + typecheck to `.github/workflows/ci.yml` (mirror nexus-api job). Keep schema-drift check green (update baseline after migrations).

### T7.3 License hygiene
- `packages/design-intelligence/LICENSE-upstream` (MIT, ui-ux-pro-max-skill) + attribution in root README "Vendored assets" section. Confirm zero AGPL code anywhere (`grep -ri "agent-teams" --include=*.ts` returns nothing).

---

## WHAT WE'RE STEALING, FROM WHERE (summary)

| Source | License | Idea | Lands in |
|---|---|---|---|
| agent-teams-ai | AGPL (patterns ONLY, no code) | Auto-resume after rate-limit reset | T1.2, T6.1 |
| agent-teams-ai | AGPL (patterns ONLY) | Agents review each other's work | T3.3 |
| agent-teams-ai | AGPL (patterns ONLY) | Per-task execution logs + token/cost visibility | T2.1, T6.3 |
| agent-teams-ai | AGPL (patterns ONLY) | Kanban statuses, blockers, autonomy levels | T6.1, T6.2 |
| ui-ux-pro-max-skill | MIT (vendor data) | Design system per niche: styles/palettes/fonts/anti-patterns | T3.1 |
| ui-ux-pro-max-skill | MIT | Pre-delivery checklist as hard gate | T3.2 |
| odysseus | MIT (reimplement for CF) | Deep research: plan -> search -> read -> cited synthesis | T4.2 |
| odysseus | MIT | Hybrid (vector+keyword) memory retrieval | T5.1, T5.2 |
| odysseus | MIT | Blind model compare to rank models on YOUR tasks | T2.4 |
| ai-engineering-hub | MIT | Eval harness + observability for LLM calls | T2.1-T2.3 |
| ai-engineering-hub | MIT | Corrective RAG (low confidence -> broaden + retry) | T4.3 |

## EXECUTION ORDER & PR MAP

```
PR1: T0.1 + T0.2                      (baseline + tests)
PR2: T1.1 + T1.6                      (registry split + error taxonomy)
PR3: T1.2 + T1.3                      (rate limits + retry semantics)   <- biggest reliability win
PR4: T1.4 + T1.5                      (JSON discipline + cage offline)  <- kills the slop pipeline
PR5: T1.7 + T1.8                      (endpoint refresh + cost accuracy)
PR6: T2.1 + T2.2                      (ledger + observability)
PR7: T2.3 + T2.4                      (evals + compare)
PR8: T3.1 + T3.2                      (design intelligence + checklist gate)
PR9: T3.3 + T3.4                      (peer review + anti-slop)
PR10: T4.1-T4.3                       (research engine)
PR11: T5.1-T5.3                       (brain RAG + learning loop)
PR12: T6.1-T6.3                       (orchestration UX)
PR13: T7.1-T7.3                       (docs, CI, licenses)
```

Definition of done for the whole plan: a product can be generated end-to-end where (1) no offline/template text can silently reach review, (2) every AI call is logged with model, cost, latency, and fallback trail, (3) rate-limited providers resume automatically, (4) outputs are schema-validated JSON, (5) generated sites get niche-appropriate design systems, and (6) nightly evals catch regressions before you do.
