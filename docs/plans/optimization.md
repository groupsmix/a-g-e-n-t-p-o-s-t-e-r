# NEXUS — Optimization Plan (cost · performance · architecture)

Grounded in the real repo, not the spec. Findings come from `wrangler.toml`,
`.github/workflows/ci.yml`, `services/action-executor.ts`, and the full file tree
(~70 route modules in `nexus-api` alone).

**Rule for this plan:** measure before you cut. The `budget.ts` route + a per-task cost
log give you the numbers; turn them on first so every change below is verifiable, not
vibes.

---

## Leverage table (do top-to-bottom)

| # | Optimization | Type | Impact | Effort |
|---|---|---|---|---|
| 1 | Smart Placement on the API worker | perf | High | 1 line |
| 2 | Bump `compatibility_date` (2024-09-23 → current) | perf | Med | 1 line + test |
| 3 | Turbo Remote Cache + dedupe types/logger build in CI | build | High | Low |
| 4 | Consolidate two browser systems (Browser Rendering vs Hyperbeam) | cost+perf | High | Low–Med |
| 5 | KV-cache the Home/stats/analytics read-model | perf+cost | High | Med |
| 6 | AI spend: response cache + tiered routing + measure | cost | High | Med |
| 7 | Move the 15-step run from `ctx.waitUntil()` → Cloudflare Workflows | reliability+perf | High | Med |
| 8 | Split mega-files / lazy-load cold routes | perf | Med | Med |
| 9 | ~70 route modules → the 6-nav model (incremental) | architecture | High | High |
| 10 | Three stacks → one (legacy retire + brain DB) | architecture | High | High |

---

## Tier 1 — cheap wins, do this week

### 1. Smart Placement (1 line)
Every route hits D1 (`env.DB.prepare(...)`). Without placement, the worker can run far
from the database and eat round-trips on multi-query routes (the Home read model,
analytics rollups, `portfolio.ts`). Add to `nexus-api/wrangler.toml`:

```toml
[placement]
mode = "smart"
```

Cloudflare then co-locates the worker with D1. Free, reversible, measurable latency drop
on DB-heavy endpoints.

### 2. Bump `compatibility_date`
Currently `2024-09-23` — ~21 months stale. You're missing runtime/perf and API
improvements. Bump to a current date, deploy to a **preview**, run the suite, then
promote. Low risk, keep `nodejs_compat`.

### 3. CI: Turbo Remote Cache + stop rebuilding shared packages
`ci.yml` runs **5 jobs** (`check`, `lint`, `brain`, `v2-agents`, `nexus`), each doing its
own `pnpm install --frozen-lockfile`, and **four of them rebuild `@posteragent/types` +
`@posteragent/logger` from scratch**. There's no remote cache, so nothing is shared
across jobs or runs.

- **Enable Turbo Remote Cache** (Vercel's free remote cache, or self-host the cache on
  R2 — you already have R2). Set `TURBO_TOKEN`/`TURBO_TEAM` (or `--remote-cache` for the
  self-hosted variant). Redundant builds become cache hits.
- **Build types/logger once** in the `check` job; have the others `needs: [check]` and
  pull the cached artifacts instead of rebuilding.
- **Drop the global `npm install -g wrangler@3`** in the `nexus` job — it's installed
  fresh every run and `wrangler@3` is two majors behind (wrangler@4 is current). Pin it
  as a devDep so the pnpm cache covers it.
- Add `--filter=...[origin/main]` (affected-only) so a docs change doesn't run every
  agent test suite.

This is the single biggest wall-clock win for your dev loop and makes the Dependabot
auto-merge from the PR plan land faster.

### 4. Pick a lane per browser job (you're running two systems)
`wrangler.toml` has a **`[browser]` Browser Rendering binding** *and* the repo has a
**`routes/hyperbeam.ts`** + `browser.ts` + `browser-actions.ts` + `browser-agent.ts`.
That's two paid browser systems and four route modules for one capability.

- **Headless** (scrape, screenshot, QA assertions, Discovery scanning, Job-agent
  research) → **Browser Rendering `BROWSER` binding**. Parallel-capable, pay-per-use,
  co-located. `action-executor.ts`'s `browse()` already takes this path.
- **Live "watch the agent"** (the rare case a human needs to see it) → **Hyperbeam**.
- Route everything non-interactive off Hyperbeam. That removes the free-tier
  **1-concurrent-session** bottleneck where Job/Discovery/QA agents collide, and cuts a
  paid dependency. Collapse the 4 browser route files into one `browser` service with
  two backends.

---

## Tier 2 — medium effort, high payoff

### 5. Materialize the read-model in KV
The spec's "Home pulls from the other five" is, in practice, live D1 aggregations on
every dashboard load (`stats.ts`, `analytics.ts`, `metrics.ts`, `money-machine.ts`,
`revenue.ts` — five overlapping modules). You already have a `kv-cache.ts` middleware and
one `CONFIG` KV namespace; it's underused.

- Compute a `home_snapshot` / stats rollup and cache it in KV with a short TTL **or**
  write-through invalidation on the events that change it (new sale, item stage change).
- Dashboard loads then hit KV (single-digit ms) instead of fanning out N D1 queries.
- Bonus: collapsing those five money/metrics routes into one analytics surface (Tier 3)
  makes this cache trivial to own.

### 6. Cut AI spend (failover.ts is 40 KB and on every request path)
You already have the smart part — a `DeepSeek → Groq → Workers AI` failover. Add:

- **Response cache**: key on `(model, sha256(prompt))` in KV for idempotent calls
  (niche scoring, research summaries, classification). The Discovery agent re-scanning
  similar trends becomes cache hits, not paid tokens.
- **Tiered routing by task**: extraction/classification/summarize → cheapest tier;
  reserve the premium model for final generation. Decide tier from task type, not vibes.
- **Provider prompt caching** where supported (e.g. DeepSeek context caching) for the
  big static system prompts.
- **Measure first**: log cost per `agent_run_id` via `budget.ts` so you can see which
  tier and which agent dominates spend before tuning.

### 7. Move the long run off `ctx.waitUntil()` onto Workflows
`wrangler.toml` is explicit: the 15-step workflow runs via `ctx.waitUntil()` inside the
fetch handler, "≤ 3 min for 15 AI calls," with a `SELF` service-binding hack to get a
fresh time budget. That's a **reliability cliff** — exceed the invocation budget and the
run dies mid-way with no per-step retry.

- Migrate to **Cloudflare Workflows** (the primitive your own architecture doc named):
  durable, each step retries independently, survives restarts. This is also what makes
  the approval-gate "halt and resume" flow clean.
- This retires the `SELF`-binding workaround and the `*/5` stuck-run janitor's main job.

### 8. Shrink the worker bundle (cold start)
Worker cold start scales with bundle size. You have `agent.ts` **42 KB**, `failover.ts`
**40 KB**, `portfolio.ts` **30 KB**, `products.ts` **25 KB**, `security-audit.ts`
**25 KB**, `keys.ts` **17 KB** — all potentially pulled into one bundle.

- Lazy-import rarely-hit heavy routes (`security-audit`, `repo-intelligence`,
  `doc-generator`) so they're not in the hot path.
- Split the mega-files by concern; let tree-shaking drop unused branches.
- The lucide `0 → 1` upgrade (PR #49) helps the **web** bundle if its tree-shaking
  improved — verify after merge.

---

## Tier 3 — structural (high impact, already partly in motion)

### 9. ~70 route modules → the 6-nav model, incrementally
The API has grown the exact sprawl the architecture doc was written to prevent. Visible
overlaps to merge:

- **Money/metrics (5 → 1):** `money-machine`, `revenue`, `metrics`, `stats`, `analytics`.
- **Browser (4 → 1):** `browser`, `browser-actions`, `browser-agent`, `hyperbeam`.
- **PipelineItem candidates (→ one table + `type`):** `notes`, `products`, `pod`, `blog`,
  `freelance`, plus `pipeline`. This is the doc's core "one table, not five" rule.

Don't big-bang it. One cluster at a time, behind the existing routes, with the read-model
cache (#5) as the first beneficiary. Fewer modules = smaller bundle, faster cold start,
less surface to maintain and secure.

### 10. Three stacks → one
Already decided (ADR-001) and dated (legacy retire 2026-06-22 — see the retirement
checklist). Finishing it removes a whole deploy target + dep tree, and folding the Brain
Cockpit onto the same D1 removes the second, still-undefined database. Net: one deploy,
one lockfile, one DB, less compute and cold-start surface overall.

---

## What NOT to touch (already good — don't "optimize" these)

- The `DeepSeek → Groq → Workers AI` failover ladder — keep it; just add caching/tiering.
- `concurrency: cancel-in-progress` in CI — correct, leave it.
- Migration discipline + schema-drift checks in CI — good guardrails, keep.
- The `SELF`-binding trick is clever, but it's a workaround for the missing Workflows
  binding (#7). Replace the cause, then retire the workaround.

---

## This-week shortlist (copy to your tracker)

1. `[placement] mode = "smart"` + bump `compatibility_date` → preview → promote.
2. Turn on Turbo Remote Cache; dedupe the types/logger build; drop global wrangler@3.
3. Route headless browsing to the `BROWSER` binding; keep Hyperbeam for watch-only.
4. Turn on per-`agent_run_id` cost logging (so Tier 2 is measurable).

Tier 2 and 3 are sprints, not afternoons — but 1–4 above are all low-risk and land real
latency, cost, and CI-time wins immediately.
