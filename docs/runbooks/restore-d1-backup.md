# Runbook: restore a D1 backup

Backups are produced weekly by `.github/workflows/d1-backup.yml` (Mondays
05:00 UTC, also runnable manually via workflow_dispatch). Each backup is a
full SQL export of `nexus-db` stored in the `nexus-assets` R2 bucket under
`backups/d1/nexus-db-<UTC timestamp>.sql`, verified byte-for-byte at upload
time.

## 1. List available backups

wrangler has no `r2 object list` command — browse the Cloudflare dashboard
(R2 → nexus-assets → `backups/d1/`) to pick a timestamp. Backup runs also
print the exact key in the GitHub Actions log of the D1 Backup workflow.

## 2. Download the backup you want

```bash
cd apps/nexus/apps/nexus-api
wrangler r2 object get "nexus-assets/backups/d1/nexus-db-<STAMP>.sql" \
  --file ./restore.sql
```

## 3. Rehearse locally first (always)

```bash
wrangler d1 execute nexus-db --local --file ./restore.sql
# poke at the result:
wrangler d1 execute nexus-db --local \
  --command "SELECT count(*) FROM products"
```

## 4. Restore to production

A D1 SQL export contains `CREATE TABLE` statements — restoring onto a
non-empty database will fail or duplicate. For a true restore, recreate the
database:

```bash
# 1. Stop writers: disable the two crons by commenting out [triggers] in
#    wrangler.toml and deploying, or pause via the Cloudflare dashboard.
# 2. Recreate:
wrangler d1 create nexus-db-restored
# 3. Update database_id in wrangler.toml to the new DB.
wrangler d1 execute nexus-db-restored --remote --file ./restore.sql
# 4. Deploy, smoke test (/api/health + one authed route), re-enable crons.
# 5. Keep the old DB around for a week before deleting it.
```

## 5. Verify

- `GET /api/health` returns `status: ok`
- Dashboard loads products / publish queue / revenue views
- The 07:00 UTC daily batch completes without errors the next morning
