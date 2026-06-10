# Contributing

## Branching

- `main` is the only long-lived branch and must always be deployable.
- Work happens on short-lived branches named by intent:
  `fix/<topic>`, `feat/<topic>`, `docs/<topic>`, `chore/<topic>`.
- One concern per branch. Audit/bug-batch branches should name the items
  they close (e.g. `fix/audit-18-19-20-validation`).

## Commits and PRs

- Conventional commits: `fix(scope): ...`, `feat(scope): ...`,
  `docs: ...`, `chore(deps): ...`.
- Every PR must:
  1. pass CI (typecheck, tests, builds, env drift check, D1 dry-run,
     schema-drift check, secret scan);
  2. say **what** changed and **why**, referencing audit items or issues
     it closes;
  3. keep the diff reviewable — split unrelated changes.
- No force-pushes to `main`. Rewriting history on a PR branch is fine
  before review starts.

## Environment variables

- Every new key in `packages/config/src/env.ts` must be documented in
  `.env.example` — CI runs `check-env --check-example` and fails on drift.
- Never commit real values. `wrangler secret put` for Workers, GitHub
  Actions secrets for CI.

## Database migrations (D1)

- Migrations live in `apps/nexus/apps/nexus-api/migrations/` and are
  numbered monotonically — never edit an applied migration; add a new one.
- CI dry-runs migrations and checks schema drift against the worker's
  queries. Deploy applies them with
  `wrangler d1 migrations apply nexus-db --remote`.

## Releases / deploys

There are no tagged releases. The pipeline is:

1. PR merges to `main`.
2. `CI` workflow runs (plus `secret-scan`).
3. On CI success, `Deploy Workers` runs automatically: applies D1
   migrations, deploys `nexus-ai` and `nexus-api`.
4. The dashboard (`nexus-web`) auto-deploys via Cloudflare Pages git
   integration.
5. Manual deploys: `Deploy Workers` via workflow_dispatch
   (`skip_migrations: true` when only worker code changed).

## Security

Read `SECURITY.md` and `docs/THREAT_MODEL.md` before touching auth,
uploads, publishing, or anything that handles external content.
Vulnerabilities go through private reporting, not public issues.
