# Runbook: legacy cron retirement (audit §2.2, weeks 3–4)

The legacy `@repo/*` stack ships three GitHub Actions jobs. This runbook is
the retirement plan with dates, per audit §2.2 ("retire with a date, not a
vibe").

## Target dates

| Phase | Date |
|---|---|
| NEXUS ports live (this PR merged + secrets set) | by **2026-06-13** |
| Parallel-run window (legacy + NEXUS both running) | **2026-06-13 → 2026-06-20** |
| Legacy deletion PR (item 12: `@repo/*`, factory, runner, 3 workflows, legacy CI job) | **2026-06-22** |

If the parallel week surfaces a divergence, fix forward and restart the
window — do not delete until one clean week passes.

## How each job maps to NEXUS

### 1. stats-pull.yml (every 6h) → ported 1:1

The only legacy job NEXUS did not already cover: TikTok/IG engagement for
posts published by the **legacy** pipeline, written to Supabase
`published_posts`. (NEXUS's analytics collector, TASK-702, only covers
NEXUS `publish_jobs` in D1.)

- Port: `apps/nexus/apps/nexus-api/src/services/legacy-stats-pull.ts`
- Cron lane: `0 */6 * * *` in nexus-api's `wrangler.toml`
- Manual trigger: `POST /api/stats/legacy-pull` (behind the access gate)
- Parallel-run is safe: writes are absolute snapshots (idempotent), so the
  Actions cron and the Worker cron racing each other converge to the same
  values.

**Required secrets on nexus-api** (each via `wrangler secret put <NAME>`,
or the SECRETS store / dashboard keys page):

```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
TIKTOK_ACCESS_TOKEN        # optional — TikTok skipped if missing
INSTAGRAM_ACCESS_TOKEN     # optional — Instagram skipped if missing
```

Until the two Supabase secrets are set the lane logs
`Legacy stats pull skipped` and does nothing.

**Verification during the window:** trigger `POST /api/stats/legacy-pull`,
compare `checked` / `tiktokUpdated` / `instagramUpdated` against the
"Stats pull complete" line in the legacy Action's log for the same period.

### 2. daily-run.yml (06:00 UTC) → superseded, not ported

The legacy daily run is a Mastra workflow (trend research → fill queue →
generate posters/videos → publish → site content) that needs a full Node
runtime — it cannot and should not run on Workers. Its *function* is already
covered by the NEXUS 07:00 daily batch: trend radar ≈ trend research,
autopilot ≈ queue + generate + publish, marketing/learning sync ≈ the rest —
all against D1 with observability, quality gates and budget controls the
legacy pipeline lacks.

Retirement = simply deleting the workflow on 2026-06-22. The parallel-run
week for this job is the status quo (both pipelines already run daily).
Decision to make before deletion: whether any legacy Supabase content
(published_posts history) should be exported into D1 first — see item 12 PR.

### 3. generate-site.yml (manual only) → superseded, not ported

Manual workflow_dispatch wrapping `@repo/factory`'s CosmicJS site generator.
NEXUS's venture factories (`services/factory/*` — affiliate, content,
digital, ecommerce, freelance, POD) cover the "spin up a monetizable
property" job natively. No cron to parallel-run; it just gets deleted with
the rest on 2026-06-22.

## Rollback

The legacy workflows stay untouched during the window. If the NEXUS port
misbehaves, remove the `0 */6 * * *` entry from `wrangler.toml` crons and
redeploy nexus-api — the legacy Actions cron is still doing the job.
