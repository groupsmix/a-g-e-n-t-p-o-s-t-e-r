# NEXUS — Legacy `@repo` Cron Retirement Checklist

**Scheduled date in README:** 2026-06-22.
**Governing principle:** **retire on a green checklist, not on a calendar date.** If the
boxes below aren't all checked by the 22nd, *extend the parallel run* — do not drop
coverage. Silently losing daily content + stats is worse than a few extra days of
double-running.

---

## What's being retired

Three GitHub Actions cron jobs driving `@repo/runner`:

| Workflow | Job | NEXUS replacement must exist + be proven |
|---|---|---|
| `.github/workflows/daily-run.yml` | Daily content runs | NEXUS workflow that produces the same `PipelineItem`s on schedule |
| `.github/workflows/generate-site.yml` | Site generation (CosmicJS, `apps/factory`) | NEXUS-driven site build, or explicit decision to keep factory |
| `.github/workflows/stats-pull.yml` | Stats pull | NEXUS `/api/stats` ingestion on schedule |

> Note: `deploy.yml` → `@posteragent/dashboard` is **not** part of this retirement.

---

## Phase 1 — Prove the replacements exist (per job)

For **each** of the three jobs, confirm the NEXUS equivalent:

- [ ] **daily-run** — A NEXUS workflow/cron is deployed and on a schedule. It writes the
      same content `PipelineItem`s the legacy runner did. Compare one real day's output:
      same count, same types, same destinations.
- [ ] **generate-site** — Either NEXUS regenerates the site, **or** you've explicitly
      decided `apps/factory` stays as-is (then it's out of scope and the README should
      say so). Don't retire the cron until one of those is true.
- [ ] **stats-pull** — NEXUS pulls the same stats into the same store `/api/stats` reads
      from. Numbers on a chosen day match the legacy pull within tolerance.

## Phase 2 — Parallel-run reconciliation (the one-week window)

- [ ] Both stacks run in parallel for the full window (README says one week).
- [ ] For ≥3 consecutive days, legacy output and NEXUS output **match** (content items,
      site state, stats). Log the diffs; investigate any mismatch before cutover.
- [ ] Confirm NEXUS handles the failure cases the legacy job did (empty source, API
      down, partial data) — credential-missing must surface as explicit failure, never
      faked success (keep that discipline).
- [ ] No duplicate side effects from running both (e.g. double-posting). If both can
      publish, gate one off during overlap.

## Phase 3 — Cutover

- [ ] Disable the three legacy workflows (comment the `schedule:` triggers or set
      `if: false` — keep the files for rollback, don't delete yet).
- [ ] Announce-to-self in Ops → Logs: legacy disabled at <timestamp>, NEXUS sole owner.
- [ ] Watch NEXUS run **unassisted** for 48–72h. Confirm content + stats still land.

## Phase 4 — Rollback plan (have it ready before Phase 3)

- [ ] Re-enabling = revert the `schedule:` change on the three workflows (1 commit).
- [ ] Document the exact commit/PR that disabled them so re-enable is copy-paste.
- [ ] Keep `apps/runner` + `@repo/*` packages in the tree until Phase 5 — disabled, not
      deleted.

## Phase 5 — Cleanup (only after a clean week NEXUS-solo)

- [ ] Delete the three workflow files.
- [ ] Remove `apps/runner` (and `apps/factory` if site-gen migrated) + their `@repo/*`
      packages.
- [ ] Drop now-dead deps from the root `pnpm` workspace; `pnpm install` + `typecheck`.
- [ ] Update README: remove the "two stacks" / retirement section; NEXUS is sole stack.

---

## Go / No-Go gate for June 22

```
IF Phase 1 + Phase 2 all green  → proceed to Phase 3 cutover on the 22nd.
ELSE                            → keep legacy cron running, extend parallel run,
                                  set a new date, note why in Ops → Logs.
```

Coverage continuity beats hitting the date. The date is a target, not a guillotine.
