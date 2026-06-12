# Branch & Release Policy

## Branch strategy

This project uses a **trunk-based** workflow on `main`. There are no
long-lived feature branches or release branches.

| Branch | Purpose | Protection |
|---|---|---|
| `main` | Single source of truth; always deployable | Required CI pass + review before merge |
| `fix/*`, `feat/*`, `chore/*` | Short-lived work branches | Deleted after merge |

### Branch naming

```
fix/<issue-or-description>     — bug fixes
feat/<issue-or-description>    — new features
chore/<issue-or-description>   — maintenance, deps, docs
audit/<task-id>                — audit remediation (e.g., audit/t-28-youtube-chunked)
```

## Pull request rules

1. **CI must pass** — all jobs (lint, typecheck, test, env-check,
   migration-discipline, secret-scan) must be green.
2. **No merge commits** — use squash merge to keep history linear.
3. **Self-review checklist** (from `.github/pull_request_template.md`):
   - [ ] No secrets in the diff
   - [ ] New routes are auth-gated or explicitly excepted
   - [ ] New external inputs validated (host/size/type/timeout)
   - [ ] Migrations follow naming convention and are idempotent
   - [ ] Backward compatibility preserved (or migration path documented)
4. **One logical change per PR** — don't mix unrelated fixes.

## Release process

There are no versioned releases. Deployment is continuous from `main`:

```
PR merged → CI passes → Deploy workflow runs → Production updated
```

### Rollback procedure

If a deploy causes issues:

1. **Revert the merge commit** on `main`:
   ```bash
   git revert <merge-commit-sha>
   ```
2. **Push and let CI deploy the revert** automatically.
3. **If the revert itself fails**, manually deploy the last known-good
   commit:
   ```bash
   git checkout <last-good-sha>
   wrangler deploy --env production
   ```
4. **For database migrations**: write a compensating migration (never
   `DROP` in production without a backup).

### Hotfix process

1. Branch from `main`: `git checkout -b fix/hotfix-description`
2. Make the minimal fix.
3. Open PR, get review (self-review acceptable for P1 with post-hoc review).
4. Merge and verify deploy.

## Migration discipline

- Migration files live in `apps/nexus/migrations/`.
- Filenames: `NNN_description.sql` (e.g., `023_add_foo_table.sql`).
- Numbers must be unique and monotonically increasing.
- CI `migration-discipline` job enforces this automatically.
- All migrations must be idempotent (use `IF NOT EXISTS`, `IF EXISTS`,
  or conditional checks).

## Secret management

- **Local dev**: `.env` file (gitignored), documented in `.env.example`.
- **Workers**: `wrangler secret put <NAME>`.
- **CI**: GitHub Actions secrets.
- **Never** in code, commits, issues, or workflow files.
- **Rotation**: if a secret leaks, rotate first, clean history second.
