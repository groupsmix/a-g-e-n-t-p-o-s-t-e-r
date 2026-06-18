# Full Audit — groupsmix/a-g-e-n-t-p-o-s-t-e-r (posteragent)

Audited 2026-06-10. Cloned at commit `75ac200`. ~740 tracked files, 78k lines of TS/TSX,
4 apps + 21 root packages + a nested 3-app NEXUS workspace on Cloudflare Workers/Pages/D1/KV/R2.

---

## Verdict in one paragraph

This is a far healthier repo than the name suggests. The T1–T19 fix series (PRs #32–42), the in-repo
audit docs, ADR-001, the schema-drift CI check, and the centralized auth gate with tests show real
engineering discipline. The problems are not code quality. They are: **(1)** a public repo leaking your
live infrastructure and entire business playbook, **(2)** a fail-open auth design, **(3)** a structurally
unsound double pnpm workspace held together by a postinstall hack, and **(4)** two coexisting stacks
where the legacy one is "to be retired" with no deadline. Plus serious feature sprawl for a one-user tool.

---

## 1. FIX — critical, this week

### 1.1 Make the repo private (or genuinely scrub it)
The repo is public and contains:
- Your live API endpoint hardcoded in `apps/nexus/apps/web/package.json`:
  `https://nexus-api.simohamed.workers.dev`
- Your D1 `database_id` in `wrangler.toml`
- `NEXUS-ARCHITECTURE-V4-COMPLETE.md` (3,279 lines) + `docs/money-machine/` + `docs/AGENT_TASKS.md`:
  your full revenue strategy, niches, platform plans, agent prompts
- Your own `secret-scan.yml` comment admits: *"flipping visibility is a one-time owner action"* — it never happened.

No secrets are in tracked files (verified with pattern scan), but for a personal money machine there is
zero upside to being public. **One click in Settings → Danger Zone. Do it first.**

### 1.2 Make the access gate fail-closed
`access-gate.ts` says it explicitly: *"The gate is inactive only when NO password is configured."*
That means a fresh deploy without `ACCESS_PASSWORD` = every `/api` route wide open, on a URL printed
in a public repo. The env-secret path closes the boot window, but the no-password state is still open by design.

**Fix:** if no `access_hash` exists and no `ACCESS_PASSWORD` is set, return 403 on everything except
`/api/auth/*`. The dashboard bootstrap flow already exists; it just becomes mandatory.

### 1.3 Replace single-pass SHA-256 password hashing
`hashPassword()` = `SHA-256(STATIC_SALT + password)`. SHA-256 is a fast hash; if the KV hash ever leaks,
it is GPU-bruteforceable. You already raised min length to 16 (good), but the right fix is 10 lines:
PBKDF2 via `crypto.subtle.deriveBits` (≥100k iterations, per-hash random salt), constant-time compare.
Workers support it natively.

### 1.4 Upgrade Next.js 14.1.0
Both `apps/dashboard` and `apps/nexus/apps/web` pin `next: 14.1.0` (Jan 2024). The 14.1.x line is behind
multiple security fixes, including the middleware authorization-bypass class patched in 14.2.25 — and
`apps/nexus/apps/web` gates pages **in middleware** while `apps/dashboard` self-hosts via `next start`.
Your middleware gate is deliberately cosmetic (real auth = bearer token at the worker), so impact is low,
but you're 2+ years stale on a framework with an active CVE history. Go to latest 14.2.x minimum; 15 ideally.

### 1.5 Session tokens: bind and rotate
Sessions are KV keys `session:<token>` with value `'1'` and a 24h TTL. Fine for one user, but: no record
of creation IP/UA, no rotation on privilege change (password change should invalidate all sessions — verify
it does), and logout of "all sessions" requires a KV list-and-delete. Cheap to store `{createdAt, ip}` as
the value and add a "revoke all" that bumps a generation counter checked by the gate.

---

## 2. ORGANIZE — structural fixes

### 2.1 Kill the double workspace (the biggest landmine)
Current state:
- Root `pnpm-workspace.yaml` includes `apps/nexus/apps/*` and `apps/nexus/packages/*`
- `apps/nexus` is ALSO its own pnpm workspace with its own `pnpm-lock.yaml`, which re-mounts 13 outer
  packages via `../../packages/...` relative paths
- A root `postinstall` hack runs a second `pnpm install` inside `apps/nexus`
- The README documents the failure mode: *"if you ever see Cannot find module 'react'..."*
- `nexus/package.json` carries a `//workspaces` mirror comment for bun-based tooling

Two lockfiles resolving overlapping package sets will drift. CI even caches them separately
(`pnpm-lock.yaml` for 4 jobs, `apps/nexus/pnpm-lock.yaml` for 1). When they disagree you get
works-on-CI-fails-on-deploy bugs that cost days.

**Fix: one workspace, one lockfile.** Delete `apps/nexus/pnpm-workspace.yaml` + `apps/nexus/pnpm-lock.yaml`
+ the postinstall hack + the `//workspaces` mirror. Wrangler and next-on-pages don't care where the
workspace root is. Turbo already spans both. This is a one-day change that deletes an entire bug class.
(If something genuinely forces the nested workspace — document WHAT in the README, because right now
the stated reason is just history.)

### 2.2 Retire the legacy stack with a date, not a vibe
README: *"Until the legacy cron is formally retired… the @repo runners still ship."* That's 10 `@repo/*`
packages + `apps/factory` + `apps/runner` + 3 GitHub Actions cron workflows kept alive indefinitely.
NEXUS already has Worker crons (`*/5 * * * *`, `0 7 * * *`).

**Plan:** port the 3 jobs (daily-run, stats-pull, generate-site) into NEXUS scheduled handlers or
workflow-engine jobs → run both in parallel 1 week → delete `@repo/*`, `apps/factory`, `apps/runner`,
3 workflows, and the `check` CI job. That removes ~40% of the maintenance surface and makes the README's
"two stacks, on purpose" section unnecessary.

### 2.3 Deduplicate packages
- `@posteragent/logger` vs `@nexus/logger` — two loggers, same repo
- `@posteragent/types` vs `@nexus/types` — two type packages
After the workspace merge there is no excuse; pick one of each.

### 2.4 Clean the root
- `AI-FIX-PLAN-posteragent(1).md` — a browser-download duplicate name (`(1)`) committed to root. Move to `docs/history/` and rename.
- `NEXUS-ARCHITECTURE-V4-COMPLETE.md` (136KB) — move to `docs/architecture.md`.
- Root should be: README, package.json, lockfile, workspace/turbo/tsconfig, .env.example. Nothing else.

### 2.5 Reorganize `docs/`
18 loose files mixing live docs with completed history. Restructure:
```
docs/
  adr/          ADR-001-... (keep numbering, add new ones here)
  architecture.md
  runbooks/     deploy, rotate-password, add-platform
  history/      PHASE-*, AUDIT-*, FIXES-*, POSTERAGENT_TASKS_V2, AI-FIX-PLAN
```
Completed phase docs are history, not guidance. An agent (or you in 6 months) reading `docs/` should
see only what's currently true.

### 2.6 README drift
README documents a `ref/` directory with 6 reference repos. It doesn't exist in the repo and isn't in
`.gitignore`. Either add `ref/` to `.gitignore` and mark the section "(local only, not tracked)" or delete it.

---

## 3. IMPROVE

### 3.1 CI consistency
- Node versions: dashboard job uses **20**, the other four use **24**, `engines` says `>=20`. Pin ONE version
  (22 LTS or 24) across all jobs and engines.
- `lint` exists as a turbo task but there is **no ESLint config anywhere** in the repo (only `next lint`
  in the dashboard, also unconfigured). Add a flat-config ESLint at root (typescript-eslint +
  unused-imports) and a root `lint` CI step. With 78k lines and no linter, dead imports and footguns
  accumulate silently.
- Add a post-deploy smoke step to `deploy.yml`: curl the live `/api/health` (and one authed route with a
  CI token) after worker deploy; fail loudly. The schema-drift check is great pre-deploy; nothing verifies post-deploy.

### 3.2 Test the money paths
39 test files against 59 route files + 52 services. What's tested is well-chosen (auth, gates, publishers,
workflow engine). What's missing is integration coverage on the revenue loop: product create → quality gate
→ publish queue → platform adapter → stats ingest. One Miniflare/`workers-vitest` integration suite over
that loop is worth more than 20 more unit tests. Add coverage reporting (`vitest --coverage`) to CI so the
number is at least visible.

### 3.3 Generate the API client instead of hand-writing it
`lib/api.ts` is 812 lines with 34 admittedly-unused methods, mirrored by a 975-line hand-kept `api-types.ts`.
Your own audit decided to keep them as "an index of what the Worker can do." Better: you're on Hono —
export the router's type and use Hono RPC (`hc<AppType>`) or generate an OpenAPI spec + typed client.
Then the "index" is the source code itself, it can't drift, and 1,800 hand-maintained lines disappear.

### 3.4 File-size discipline
`failover.ts` 1,131 lines, `portfolio.ts` 947, `workflow-engine.ts` 874, `d1.ts` 829, `browser/page.tsx` 734,
`index.ts` 525 with 59 route mounts. Nothing is on fire, but set a soft 400-line rule and split the worst
offenders next time you touch them. For `index.ts`: a `routes/manifest.ts` that exports `[path, router]`
pairs makes mounting + the access-gate test table-driven.

### 3.5 Env validation
`.env.example` documents ~35 vars across both stacks with optionality expressed as comments. `check-env.ts`
exists (good) — extend it to a single zod schema per app, fail fast with a list of missing vars, and mark
which app needs which. The NEXT_PUBLIC_API_URL silent-localhost-fallback bug you fixed (BUG #3) is exactly
the class this kills permanently.

---

## 4. ADD

1. **Renovate (or Dependabot)** — Next 14.1.0 would never have rotted 2 years with automated PRs.
   Group minor/patch weekly, separate majors.
2. **Pre-commit hooks** (lefthook or husky): prettier check, `scripts/check-secrets.mjs`, typecheck on
   affected packages. You already have the secret scanner — run it before commit, not just in CI.
3. **CODEOWNERS + branch protection** requiring CI green (deploy already gates on CI, merges should too).
4. **Backups for D1**: a scheduled worker or Action that runs `wrangler d1 export` to R2 weekly. Right now
   the business state (products, queue, revenue, learning loop) lives in one D1 with no stated backup story.
5. **A real `/api/health`** consumed by both deploy smoke test and an uptime ping (UptimeRobot/CF health
   checks) so you find out about outages before the cron does.
6. **`docs/runbooks/`**: rotate password, redeploy from scratch, restore D1 backup, add a platform adapter.
   The repo is built to be operated by agents — runbooks are agent fuel.

---

## 5. REMOVE

| What | Why |
|---|---|
| `@repo/*` (10 pkgs) + `apps/factory` + `apps/runner` + 3 cron workflows | After migration (§2.2) — biggest single deletion available |
| `apps/nexus/pnpm-lock.yaml`, nested workspace file, postinstall hack | After workspace merge (§2.1) |
| `@nexus/logger`, `@nexus/types` | Duplicates (§2.3) |
| `AI-FIX-PLAN-posteragent(1).md` from root | Move to docs/history, fix the name |
| `.devin/` workflows | If Devin isn't actively driving this repo anymore, it's stale config |
| 34 unused client methods + hand-written `api-types.ts` | After Hono RPC migration (§3.3) |
| `apps/nexus/.github/` (nested workflows dir) | Workflows only run from repo root `.github/` — nested ones are dead |

---

## 6. The honest product opinion

This is a one-user system with **59 API route files and 42 dashboard pages**: freelance engine, leads
scanner, POD, blog, email lists, A/B tests, competitor tracker, browser agent, hyperbeam, MindsDB,
opportunity radar, CEO view, sleep mode… There is literally a `/graveyard` route, which tells me you
already know features die here.

If this were my project I would **freeze new surfaces** and pick the single loop that's closest to revenue
(by the repo's own shape: product → publish queue → platform → stats → learning loop), then prove it runs
30 days unattended with money in and costs visible. Every other surface either feeds that loop or goes to
the graveyard. Breadth is the enemy of an autopilot: every page is an operational liability that can wake
you up, and a 1-person + agents team can keep maybe 3 loops healthy, not 20.

---

## 7. Execution order (how I'd actually do it)

**Day 1 (safety):**
1. Repo → private
2. Fail-closed access gate + test
3. PBKDF2 password hashing (with migration: rehash on next successful login)

**Week 1 (hygiene):**
4. Next.js → 14.2.latest, both apps
5. Root cleanup + docs reorg + README ref/ fix
6. Pin Node version across CI; add ESLint + root lint job
7. Renovate + pre-commit hooks

**Week 2 (structure):**
8. Merge workspaces → one lockfile, delete postinstall hack
9. Dedupe logger/types
10. D1 backup job + post-deploy smoke test

**Weeks 3–4 (retirement):**
11. Port 3 legacy crons into NEXUS, parallel-run 1 week
12. Delete @repo/*, factory, runner, legacy workflows, legacy CI job
13. Hono RPC client; delete hand-written api.ts/api-types.ts

**Ongoing:** integration test on the money loop, 400-line file rule, surface freeze until the loop proves itself.

---

## What I deliberately did NOT flag

- The dual dashboard (Brain Cockpit vs NEXUS) — ADR-001 makes the split deliberate and documented. Fine.
- Turbo config, .gitignore, secret-scan script, schema-drift check — all genuinely good.
- The KV-backed rate limiting honesty about read-after-write skew — correct reasoning, correctly documented.
- Comment quality overall is excellent — comments explain *why*, with bug IDs. Keep doing exactly that.
